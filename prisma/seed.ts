import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEFAULT_PASSWORD = "Passw0rd!";

// Menu keys must stay in sync with backend/src/modules/roles/roles.routes.ts (MENU_KEYS)
// and frontend/src/layouts/menuRegistry.ts. These are the 9 system roles — isSystem: true
// locks their name (route guards like requireRole("FINANCE") key off it) but leaves
// description/menuKeys editable from the admin Roles screen.
const SYSTEM_ROLES: Record<string, { description: string; menuKeys: string[] }> = {
  ADMIN: {
    description: "Full administrative access, including user, role, and master-data management.",
    menuKeys: ["tenders", "evaluation", "approvals", "emd-payments", "emd-refunds", "emd-summary", "ceo-dashboard", "customers", "users", "roles", "pqi", "interest-criteria", "decision-matrices", "checklist"],
  },
  EXTRACTOR: { description: "Extracts and uploads new tenders for evaluation.", menuKeys: ["tenders", "ceo-dashboard"] },
  EVALUATOR: { description: "Evaluates and shortlists tenders in the Prospect stage.", menuKeys: ["tenders", "evaluation", "interest-criteria", "ceo-dashboard"] },
  BIDDER: { description: "Prepares and submits assigned bids.", menuKeys: ["tenders", "my-bids", "ceo-dashboard"] },
  SALES_EXEC: { description: "Owns customer relationships for assigned bids.", menuKeys: ["tenders", "customers", "ceo-dashboard"] },
  SALES_MANAGER: { description: "Manages the sales team's bid pipeline and approvals.", menuKeys: ["tenders", "team-bids", "approvals", "customers", "ceo-dashboard"] },
  FINANCE: { description: "Manages EMD payment/refund verification and bid approvals.", menuKeys: ["tenders", "approvals", "emd-payments", "emd-refunds", "emd-summary", "ceo-dashboard"] },
  CEO: { description: "Final approver with full pipeline and EMD financial visibility.", menuKeys: ["tenders", "approvals", "emd-summary", "ceo-dashboard"] },
  TECH: { description: "Gives technical sign-off during evaluation and preparation.", menuKeys: ["tenders", "approvals", "ceo-dashboard"] },
};

async function upsertRole(name: string) {
  const config = SYSTEM_ROLES[name];
  return prisma.role.upsert({
    where: { name },
    update: { description: config.description, menuKeys: config.menuKeys },
    create: { name, description: config.description, menuKeys: config.menuKeys, isSystem: true },
  });
}

async function upsertUser(email: string, fullName: string, roleName: string, managerEmail?: string) {
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  const role = await upsertRole(roleName);
  let managerId: string | undefined;
  if (managerEmail) {
    const manager = await prisma.user.findUnique({ where: { email: managerEmail } });
    managerId = manager?.id;
  }
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, fullName, roleId: role.id, passwordHash, managerId },
  });
}

async function main() {
  console.log("Seeding roles + users (one per role, password for all: 'Passw0rd!')...");
  await upsertUser("admin@tenderpro.local", "Ada Admin", "ADMIN");
  await upsertUser("extractor@tenderpro.local", "Ellie Extractor", "EXTRACTOR");
  await upsertUser("evaluator@tenderpro.local", "Eva Evaluator", "EVALUATOR");
  const salesManager = await upsertUser("salesmanager@tenderpro.local", "Sam SalesManager", "SALES_MANAGER");
  await upsertUser("salesexec@tenderpro.local", "Sid SalesExec", "SALES_EXEC", "salesmanager@tenderpro.local");
  const bidder = await upsertUser("bidder@tenderpro.local", "Bella Bidder", "BIDDER");
  await upsertUser("finance@tenderpro.local", "Fin Finance", "FINANCE");
  await upsertUser("ceo@tenderpro.local", "Cara CEO", "CEO");
  await upsertUser("tech@tenderpro.local", "Theo Tech", "TECH");
  void salesManager;

  console.log("Seeding interest criteria...");
  await prisma.interestCriterion.upsert({
    where: { id: "seed-criterion-hardware-govt" },
    update: {},
    create: {
      id: "seed-criterion-hardware-govt",
      category: "Hardware",
      industryType: "Government",
      geography: "Karnataka",
      organizationType: "Government",
      scoringWeight: 40,
      active: true,
    },
  });

  console.log("Seeding decision matrix...");
  const matrix = await prisma.decisionMatrix.upsert({
    where: { id: "seed-matrix-govt-hardware" },
    update: {},
    create: {
      id: "seed-matrix-govt-hardware",
      name: "Government Hardware 2026",
      shortlistThreshold: 60,
      criteria: {
        create: [
          { name: "Technical specification fit", weight: 30, scoringScaleMax: 10 },
          { name: "Price competitiveness", weight: 30, scoringScaleMax: 10 },
          { name: "Delivery timeline feasibility", weight: 20, scoringScaleMax: 10 },
          { name: "Vendor credibility", weight: 20, scoringScaleMax: 10 },
        ],
      },
    },
  });
  void matrix;

  console.log("Seeding reference case: Police SAN Storage tender (KSP/2026-27/IND0599)...");
  const customer = await prisma.customer.upsert({
    where: { id: "seed-customer-ksp" },
    update: {},
    create: {
      id: "seed-customer-ksp",
      name: "Karnataka State Police - SCRB",
      primaryContact: "DIGP SCRB, Phone: 08022254790",
      industry: ["Government", "Police"],
      organizationType: "Government",
      procurementNotes: "Contact via DIGP SCRB office, Bengaluru.",
    },
  });

  const extractor = await prisma.user.findUnique({ where: { email: "extractor@tenderpro.local" } });

  const tender = await prisma.tender.upsert({
    where: { tenderRefNo: "KSP/2026-27/IND0599" },
    update: {},
    create: {
      tenderRefNo: "KSP/2026-27/IND0599",
      portalSource: "TenderTiger",
      title: "Supply Installation and Maintenance of SAN Storage with 250 TB for Karnataka State Police",
      description:
        "250 TB SAN storage supply, installation, commissioning and 5-year warranty/AMC for Karnataka State Police (SCRB). " +
        "Amended via corrigendum: delivery timeline 8->15 weeks, bid validity 180->90 days, data availability 99.999%->99.9999%.",
      customerId: customer.id,
      tenderType: "HARDWARE",
      bidStage: "EVALUATION",
      prospectStatus: "NEW",
      publishedDate: new Date("2026-05-07"),
      preBidDate: new Date("2026-05-19T12:30:00"),
      closingDate: new Date("2026-06-08T17:30:00"),
      bidOpeningDate: new Date("2026-06-10T11:30:00"),
      bidValidityDays: 90,
      deliveryTimelineWeeks: 15,
      contractPeriodYears: 5,
      extractorId: extractor?.id,
      emdRequirement: {
        create: {
          tenderFeeRequired: true,
          tenderFeeAmount: 500,
          emdRequired: true,
          emdAmount: 1650000,
          emdPaymentMode: "On the Portal",
          paymentDeadline: new Date("2026-06-08T17:30:00"),
          refundConditions: "Refund/adjustment per KTPP Rules post bid outcome.",
          emdPayment: {
            create: {
              amountRequired: 1650000,
              status: "PENDING",
              paidById: bidder.id,
            },
          },
        },
      },
    },
  });

  console.log("Seeding master checklist items...");
  const defaultEvaluationSteps = [
    "Tender document review",
    "Technical feasibility assessment",
    "Compliance check (eligibility & EMD)",
    "Financial analysis",
    "Risk assessment",
    "Go/No-Go decision",
  ];
  const defaultPreparationSteps = [
    "NIT / RFP download",
    "Pre-bid queries submission",
    "Technical document preparation",
    "Financial bid preparation",
    "EMD arrangement",
    "Document compilation & review",
  ];

  for (let i = 0; i < defaultEvaluationSteps.length; i++) {
    const label = defaultEvaluationSteps[i];
    await prisma.masterChecklistItem.upsert({
      where: { id: `seed-eval-step-${i}` },
      update: { label, order: i },
      create: {
        id: `seed-eval-step-${i}`,
        phase: "EVALUATION",
        label,
        order: i,
        isDefault: true,
      },
    });
  }

  for (let i = 0; i < defaultPreparationSteps.length; i++) {
    const label = defaultPreparationSteps[i];
    await prisma.masterChecklistItem.upsert({
      where: { id: `seed-prep-step-${i}` },
      update: { label, order: i },
      create: {
        id: `seed-prep-step-${i}`,
        phase: "PREPARATION",
        label,
        order: i,
        isDefault: true,
      },
    });
  }

  console.log(`Seed complete. Reference tender id: ${tender.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
