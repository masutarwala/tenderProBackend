import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler, HttpError } from "../../middleware/errorHandler";
import { authenticate, AuthedRequest } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import { recordAudit } from "../../middleware/audit";
import { canTransitionProspect } from "../../utils/tenderStateMachine";
import axios from "axios";
import * as cheerio from "cheerio";
import { validateContacts, validateContactsDb } from "../../utils/validation";
import { computeStageProgress, ensureDefaultChecklist } from "../evaluation/evaluation.routes";

const router = Router();
router.use(authenticate);

// Derives the display-facing "TENDER001" style ID from the internal tenderSeq
// auto-increment counter — see the Tender.tenderSeq comment in schema.prisma.
function formatTenderId(seq: number): string {
  return `TENDER${String(seq).padStart(3, "0")}`;
}

function withTenderId<T extends { tenderSeq: number }>(tender: T) {
  return { ...tender, tenderId: formatTenderId(tender.tenderSeq) };
}

// Attaches { completed, total, status } for the tender's *current* bidStage,
// derived from its checklist (see evaluation.routes.ts CHECKLIST_DEFINITION).
function withStageProgress<T extends { bidStage: string; checklistItems: { phase: string; checked: boolean }[] }>(tender: T) {
  const { checklistItems, ...rest } = tender;
  return { ...rest, stageProgress: computeStageProgress(tender.bidStage, checklistItems) };
}

router.post(
  "/external-search",
  requireRole("EXTRACTOR", "ADMIN"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const { tenderRefNo } = req.body;
    if (!tenderRefNo) {
      throw new HttpError(400, "tenderRefNo is required");
    }

    try {
      const response = await axios.post(
        "https://tendertiger.co.in/AIListing/GetTendersByLocation",
        {
          searchtext: tenderRefNo,
          locationType: "Country",
          locationValues: ["india"],
          last_rescount: 0,
          isviewmore: 0,
          maxscore: 0,
          queryvector: [],
          excludelocationList: null,
          isReqFromMail: 0,
          PosTagsByAI: {
            cityname: [],
            companyname: [],
            continents: [],
            countries: ["india"],
            exceptlocation: [],
            region: [],
            statename: [],
            exactwordsearch: "",
            excludewordsearch: "",
            tenderDate: [],
            tendervalue: {
              condition: null,
              tovalue: null,
              fromvalue: null
            }
          },
          filterRequestParam: {
            isDashboard: 1,
            tender_typewise: "live",
            archive_year: 0,
            wwordsearch: null,
            worgname: null,
            wcompanysubindustry: null,
            wlocation: null,
            wtenderrefno: null,
            wtenderhostdate: null,
            wtenderclosedate: null,
            wtenderclosingdate: null,
            gemtender: null,
            wbiddingType: null,
            wfundingAgency: null,
            wismse: null,
            isotherdocument: null,
            isstartup: null,
            sortcolumnname: null,
            sortingby: null,
            fromQty: null,
            toQty: null,
            qtyType: "GreaterThan",
            qtyValue: null,
            valType: "GreaterThan",
            emdValue: null,
            emdType: "GreaterThan",
            tenderValue: null,
            fromVal: null,
            toVal: null,
            fromEmd: null,
            toEmd: null
          }
        },
        {
          headers: {
            "X-Requested-With": "XMLHttpRequest",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Content-Type": "application/json"
          },
          timeout: 15000 // 15s timeout
        }
      );

      const $ = cheerio.load(response.data);
      const tenders: any[] = [];

      $("input").each((i, el) => {
        const json = $(el).attr("data-tenderdata");
        if (json) {
          try {
            tenders.push(JSON.parse(json));
          } catch (e) {
            // ignore JSON parse errors
          }
        }
      });

      if (tenders.length === 0) {
        throw new HttpError(404, `No tender found on TenderTiger matching "${tenderRefNo}"`);
      }

      res.json(tenders[0]);
    } catch (err: any) {
      if (err instanceof HttpError) throw err;
      console.error("TenderTiger scraper failed:", err);
      throw new HttpError(520, `Failed to query TenderTiger: ${err.message}`);
    }
  })
);



const TENDER_TYPES = ["HARDWARE", "SOFTWARE", "SERVICES"] as const;

const createSchema = z.object({
  tenderRefNo: z.string().min(1),
  portalSource: z.string().nullable().optional(),
  title: z.string().min(1),
  description: z.string().min(1),
  summary: z.string().min(1),
  customerId: z.string().nullable().optional(),
  tenderType: z.enum(TENDER_TYPES),
  publishedDate: z.coerce.date().nullable().optional(),
  closingDate: z.coerce.date(),
  preBidDate: z.coerce.date().nullable().optional(),
  bidOpeningDate: z.coerce.date().nullable().optional(),
  bidValidityDays: z.number().int().nullable().optional(),
  deliveryTimelineWeeks: z.number().int().nullable().optional(),
  contractPeriodYears: z.number().int().nullable().optional(),
  // Extracted at intake (spec §5.2 "Prospect Stage - Fee & EMD Extraction")
  emdRequired: z.boolean().default(false),
  emdAmount: z.number().nullable().optional(),
  emdPaymentMode: z.string().nullable().optional(),
  paymentDeadline: z.coerce.date().nullable().optional(),
  refundConditions: z.string().nullable().optional(),
  tenderFeeRequired: z.boolean().default(false),
  tenderFeeAmount: z.number().nullable().optional(),
  // Raw portal-extraction fields (TenderTiger/GeM JSON export shape)
  tcNo: z.string().nullable().optional(),
  sourceUrl: z.string().nullable().optional(),
  country: z.string().min(1),
  state: z.string().min(1),
  city: z.string().min(1),
  address: z.string().min(1),
  tenderValue: z.number().nullable().optional(),
  biddingType: z.string().min(1),
  isFreeTender: z.boolean().default(false),
  keyword: z.string().nullable().optional(),
  subIndustry: z.string().nullable().optional(),
  companySubIndustry: z.string().nullable().optional(),
  extractedCompanyName: z.string().nullable().optional(),
  customerName: z.string().min(1),
  industry: z.array(z.string()).optional().default([]),
  organizationType: z.string().nullable().optional(),
  contacts: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string().min(1),
        email: z.string().email().nullable().optional(),
        phone: z.string().nullable().optional(),
        designation: z.string().nullable().optional(),
      })
    )
    .optional()
    .default([]),
});



router.get(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const { bidStage } = req.query as { bidStage?: string };
    const where: any = {};
    if (bidStage) where.bidStage = bidStage;
    // Bidders/sales execs only see their assigned tenders (spec §6 role matrix)
    // if (req.user!.role === "BIDDER") where.bidderId = req.user!.userId;
    if (req.user!.role === "SALES_EXEC") where.salesExecId = req.user!.userId;
    const tenders = await prisma.tender.findMany({
      where,
      include: {
        customer: true,
        emdRequirement: { include: { emdPayment: true } },
        bidder: { select: { id: true, fullName: true } },
        salesExec: { select: { id: true, fullName: true } },
        checklistItems: { select: { phase: true, checked: true } },
        outcomeRecord: true,
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(tenders.map((t) => withTenderId(withStageProgress(t))));
  })
);

router.get(
  "/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const tender = await prisma.tender.findUnique({
      where: { id: req.params.id },
      include: {
        customer: { include: { contacts: true } },
        preliminaryInfo: true,
        evaluationRecords: { include: { scores: true } },
        opportunityDetails: { include: { approvalRecord: true, bidSubmission: true } },
        emdRequirement: { include: { emdPayment: { include: { refund: true } } } },
        outcomeRecord: true,
        checklistItems: { select: { phase: true, checked: true } },
      },
    });
    if (!tender) throw new HttpError(404, "Tender not found");
    res.json(withTenderId(withStageProgress(tender)));
  })
);

router.post(
  "/",
  requireRole("EXTRACTOR", "ADMIN"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = createSchema.parse(req.body);

    let customerId = data.customerId;

    if (data.customerName) {
      const existingCustomer = await prisma.customer.findFirst({
        where: { name: { equals: data.customerName, mode: "insensitive" } },
        include: { contacts: true },
      });

      if (existingCustomer) {
        customerId = existingCustomer.id;
        // Validate contacts duplicate check
        await validateContactsDb(prisma, existingCustomer.id, data.contacts);

        // Add any contacts supplied on this tender that the customer doesn't already have (by email)
        const existingEmails = new Set(existingCustomer.contacts.filter((c) => c.email).map((c) => c.email!.toLowerCase()));
        const newContacts = data.contacts.filter((c) => !c.email || !existingEmails.has(c.email.toLowerCase()));
        if (newContacts.length > 0) {
          await prisma.customerContact.createMany({
            data: newContacts.map((c) => ({
              customerId: existingCustomer.id,
              name: c.name,
              email: c.email,
              phone: c.phone,
              designation: c.designation,
            })),
          });
        }
      } else {
        validateContacts(data.contacts);
        const newCustomer = await prisma.customer.create({
          data: {
            name: data.customerName,
            country: data.country,
            state: data.state,
            city: data.city,
            address: data.address,
            billingAddress: data.address,
            industry: data.industry,
            organizationType: data.organizationType,
            contacts: data.contacts.length > 0 ? { create: data.contacts } : undefined,
          },
        });
        customerId = newCustomer.id;
      }
    }

    const tender = await prisma.tender.create({
      data: {
        tenderRefNo: data.tenderRefNo,
        portalSource: data.portalSource,
        title: data.title,
        description: data.description,
        summary: data.summary,
        customerId: customerId || undefined,
        tenderType: data.tenderType,

        publishedDate: data.publishedDate,
        closingDate: data.closingDate,
        preBidDate: data.preBidDate,
        bidOpeningDate: data.bidOpeningDate,
        bidValidityDays: data.bidValidityDays,
        deliveryTimelineWeeks: data.deliveryTimelineWeeks,
        contractPeriodYears: data.contractPeriodYears,
        tcNo: data.tcNo,
        sourceUrl: data.sourceUrl,
        country: data.country,
        state: data.state,
        city: data.city,
        address: data.address,
        tenderValue: data.tenderValue,
        biddingType: data.biddingType,
        isFreeTender: data.isFreeTender,
        keyword: data.keyword,
        subIndustry: data.subIndustry,
        companySubIndustry: data.companySubIndustry,
        extractedCompanyName: data.extractedCompanyName || data.customerName,
        extractorId: req.user!.userId,

        emdRequirement: {
          create: {
            tenderFeeRequired: data.tenderFeeRequired,
            tenderFeeAmount: data.tenderFeeAmount,
            emdRequired: data.emdRequired,
            emdAmount: data.emdAmount,
            emdPaymentMode: data.emdPaymentMode,
            paymentDeadline: data.paymentDeadline,
            refundConditions: data.refundConditions,
            emdPayment: data.emdRequired
              ? { create: { amountRequired: data.emdAmount ?? 0, status: "PENDING" } }
              : undefined,
          },
        },
      },
      include: { emdRequirement: { include: { emdPayment: true } } },
    });
    // Seed the Evaluation checklist immediately so the tender list's progress badge
    // (e.g. "0/9") is correct from the moment the tender exists, rather than showing
    // "0/0" until someone first opens the Update page (which used to be the only
    // place ensureDefaultChecklist ran).
    await ensureDefaultChecklist(tender.id);
    await recordAudit(req, "CREATE", "Tender", tender.id);
    res.status(201).json(withTenderId(tender));
  })
);

router.patch(
  "/:id",
  // EXTRACTOR corrects their own extracted tender data (unrelated to the Update
  // Tender workflow); BIDDER manages the tender going forward. ADMIN no longer
  // edits tenders directly (see TenderListPage/TenderDetailPage canEdit).
  requireRole("BIDDER", "EXTRACTOR"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = createSchema.partial().parse(req.body);
    const { emdRequired, emdAmount, emdPaymentMode, paymentDeadline, refundConditions, tenderFeeRequired, tenderFeeAmount, customerName, contacts, industry, organizationType, ...tenderData } = data;

    const updatedTender = await prisma.$transaction(async (tx) => {
      let finalCustomerId = tenderData.customerId;

      if (customerName) {
        const existingCustomer = await tx.customer.findFirst({
          where: { name: { equals: customerName, mode: "insensitive" } },
          include: { contacts: true },
        });

        if (existingCustomer) {
          finalCustomerId = existingCustomer.id;

          // 1. Update the Customer details
          await tx.customer.update({
            where: { id: existingCustomer.id },
            data: {
              country: data.country,
              state: data.state,
              city: data.city,
              address: data.address,
              billingAddress: data.address,
              industry: industry || [],
              organizationType: organizationType,
            },
          });

          // 2. Sync the Contacts list by matching emails
          if (contacts) {
            await validateContactsDb(tx, existingCustomer.id, contacts);
            const incomingIds = contacts.filter((c) => c.id).map((c) => c.id!);
            await tx.customerContact.deleteMany({
              where: {
                customerId: existingCustomer.id,
                id: { notIn: incomingIds.length > 0 ? incomingIds : ["__none__"] }
              }
            });

            for (const c of contacts) {
              if (c.id) {
                await tx.customerContact.update({
                  where: { id: c.id },
                  data: {
                    name: c.name,
                    email: c.email,
                    phone: c.phone,
                    designation: c.designation,
                  }
                });
              } else {
                await tx.customerContact.create({
                  data: {
                    customerId: existingCustomer.id,
                    name: c.name,
                    email: c.email,
                    phone: c.phone,
                    designation: c.designation,
                  }
                });
              }
            }
          }
        } else {
          if (contacts) {
            validateContacts(contacts);
          }
          const newCustomer = await tx.customer.create({
            data: {
              name: customerName,
              country: data.country,
              state: data.state,
              city: data.city,
              address: data.address,
              billingAddress: data.address,
              industry: industry || [],
              organizationType: organizationType,
              contacts: contacts && contacts.length > 0 ? { create: contacts } : undefined,
            },
          });
          finalCustomerId = newCustomer.id;
        }
      }

      // 1. Update the base tender
      const tender = await tx.tender.update({
        where: { id: req.params.id },
        data: {
          ...tenderData,
          customerId: finalCustomerId,
        },
      });

      // 2. Upsert EMD and Fee requirements
      if (
        emdRequired !== undefined ||
        emdAmount !== undefined ||
        emdPaymentMode !== undefined ||
        paymentDeadline !== undefined ||
        refundConditions !== undefined ||
        tenderFeeRequired !== undefined ||
        tenderFeeAmount !== undefined
      ) {
        const existingReq = await tx.tenderFeeEmdRequirement.findUnique({
          where: { tenderId: tender.id },
          include: { emdPayment: true },
        });

        const reqData = {
          tenderFeeRequired: tenderFeeRequired ?? existingReq?.tenderFeeRequired ?? false,
          tenderFeeAmount: tenderFeeAmount !== undefined ? tenderFeeAmount : existingReq?.tenderFeeAmount,
          emdRequired: emdRequired ?? existingReq?.emdRequired ?? false,
          emdAmount: emdAmount !== undefined ? emdAmount : existingReq?.emdAmount,
          emdPaymentMode: emdPaymentMode !== undefined ? emdPaymentMode : existingReq?.emdPaymentMode,
          paymentDeadline: paymentDeadline !== undefined ? paymentDeadline : existingReq?.paymentDeadline,
          refundConditions: refundConditions !== undefined ? refundConditions : existingReq?.refundConditions,
        };

        const upsertedReq = await tx.tenderFeeEmdRequirement.upsert({
          where: { tenderId: tender.id },
          create: {
            tenderId: tender.id,
            ...reqData,
          },
          update: reqData,
        });

        // Sync EMD payment entry
        if (reqData.emdRequired) {
          const reqEmdAmount = reqData.emdAmount ?? 0;
          if (!existingReq?.emdPayment) {
            await tx.emdPayment.create({
              data: {
                requirementId: upsertedReq.id,
                amountRequired: reqEmdAmount,
                status: "PENDING",
              },
            });
          } else {
            await tx.emdPayment.update({
              where: { requirementId: upsertedReq.id },
              data: { amountRequired: reqEmdAmount },
            });
          }
        } else if (existingReq?.emdPayment) {
          // Clean up pending payment if EMD is no longer required
          await tx.emdPayment.delete({ where: { requirementId: upsertedReq.id } });
        }
      }

      return tender;
    });

    await recordAudit(req, "UPDATE", "Tender", updatedTender.id, data);
    res.json(withTenderId(updatedTender));
  })
);

// Evaluator decision: Shortlist (assign bidder) or Drop (with reason) — spec §3.1
router.post(
  "/:id/decision",
  requireRole("EVALUATOR", "ADMIN"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const schema = z.union([
      z.object({ decision: z.literal("SHORTLIST"), bidderId: z.string(), salesExecId: z.string().optional() }),
      z.object({ decision: z.literal("DROP"), dropReason: z.enum(["NOT_INTERESTED", "NOT_QUALIFIED", "CANCELLED_BY_CUSTOMER"]) }),
    ]);
    const body = schema.parse(req.body);
    const tender = await prisma.tender.findUnique({ where: { id: req.params.id } });
    if (!tender) throw new HttpError(404, "Tender not found");

    const targetStatus = body.decision === "SHORTLIST" ? "SHORTLISTED" : "DROPPED";
    if (!canTransitionProspect(tender.prospectStatus as any, targetStatus)) {
      throw new HttpError(400, `Cannot transition prospect status from ${tender.prospectStatus} to ${targetStatus}`);
    }

    if (body.decision === "SHORTLIST") {
      const updated = await prisma.tender.update({
        where: { id: tender.id },
        data: {
          prospectStatus: "SHORTLISTED",
          bidStage: "EVALUATION",
          bidderId: body.bidderId,
          salesExecId: body.salesExecId,
          opportunityDetails: { create: { preparedById: body.bidderId } },
        },
      });
      await recordAudit(req, "UPDATE", "Tender", updated.id, { decision: "SHORTLIST" });
      return res.json(withTenderId(updated));
    } else {
      await prisma.preliminaryTenderInfo.upsert({
        where: { tenderId: tender.id },
        update: { dropReason: body.dropReason },
        create: { tenderId: tender.id, dropReason: body.dropReason },
      });
      const updated = await prisma.tender.update({ where: { id: tender.id }, data: { prospectStatus: "DROPPED" } });
      await recordAudit(req, "UPDATE", "Tender", updated.id, { decision: "DROP", reason: body.dropReason });
      return res.json(withTenderId(updated));
    }
  })
);

export default router;
