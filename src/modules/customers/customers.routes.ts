import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler, HttpError } from "../../middleware/errorHandler";
import { authenticate } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import { recordAudit } from "../../middleware/audit";
import { validateContacts, validateContactsDb } from "../../utils/validation";

const router = Router();
router.use(authenticate);

const contactSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  designation: z.string().nullable().optional(),
});

const customerSchema = z.object({
  name: z.string().min(1),
  primaryContact: z.string().optional(),
  alternateContact: z.string().optional(),
  billingAddress: z.string().optional(),
  shippingAddress: z.string().optional(),
  industry: z.array(z.string()).optional().default([]),
  organizationType: z.string().optional(),
  organizationSize: z.string().optional(),
  procurementNotes: z.string().optional(),
  country: z.string().optional(),
  state: z.string().optional(),
  city: z.string().optional(),
  address: z.string().optional(),
  contacts: z.array(contactSchema).optional().default([]),
});

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await prisma.customer.findMany({ include: { contacts: true }, orderBy: { name: "asc" } }));
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    res.json(await prisma.customer.findUnique({ where: { id: req.params.id }, include: { contacts: true } }));
  })
);

router.post(
  "/",
  requireRole("ADMIN", "SALES_EXEC", "SALES_MANAGER"),
  asyncHandler(async (req: any, res) => {
    const data = customerSchema.parse(req.body);
    const { contacts, ...customerData } = data;
    validateContacts(contacts);

    const customer = await prisma.customer.create({
      data: {
        ...customerData,
        billingAddress: customerData.address || customerData.billingAddress,
        contacts: contacts.length > 0 ? { create: contacts.map((c) => ({ name: c.name, email: c.email, phone: c.phone, designation: c.designation })) } : undefined,
      },
      include: { contacts: true },
    });
    await recordAudit(req, "CREATE", "Customer", customer.id);
    res.status(201).json(customer);
  })
);

router.patch(
  "/:id",
  requireRole("ADMIN", "SALES_EXEC", "SALES_MANAGER"),
  asyncHandler(async (req: any, res) => {
    const data = customerSchema.partial().parse(req.body);
    const { contacts, ...customerData } = data;
    if (contacts) {
      await validateContactsDb(prisma, req.params.id, contacts);
    }

    const customer = await prisma.customer.update({
      where: { id: req.params.id },
      data: {
        ...customerData,
        billingAddress: customerData.address || customerData.billingAddress,
      },
      include: { contacts: true },
    });

    // Sync the contacts list: update ones with a matching id, create the rest,
    // and delete any existing contact the incoming list no longer references.
    if (contacts) {
      const incomingIds = contacts.filter((c) => c.id).map((c) => c.id!);
      await prisma.customerContact.deleteMany({
        where: { customerId: customer.id, id: { notIn: incomingIds.length > 0 ? incomingIds : ["__none__"] } },
      });
      for (const c of contacts) {
        if (c.id) {
          await prisma.customerContact.update({ where: { id: c.id }, data: { name: c.name, email: c.email, phone: c.phone, designation: c.designation } });
        } else {
          await prisma.customerContact.create({ data: { customerId: customer.id, name: c.name, email: c.email, phone: c.phone, designation: c.designation } });
        }
      }
    }

    await recordAudit(req, "UPDATE", "Customer", customer.id, data);
    res.json(await prisma.customer.findUnique({ where: { id: customer.id }, include: { contacts: true } }));
  })
);

router.delete(
  "/:id",
  requireRole("ADMIN"),
  asyncHandler(async (req: any, res) => {
    await prisma.customer.delete({ where: { id: req.params.id } });
    await recordAudit(req, "DELETE", "Customer", req.params.id);
    res.status(204).send();
  })
);

export default router;
