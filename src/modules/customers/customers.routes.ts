import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/errorHandler";

const router = Router();

// GET all customers (for dropdowns)
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const customers = await prisma.customer.findMany({
      orderBy: { name: "asc" },
      include: {
        relatedTo: { select: { id: true, name: true, city: true } },
      }
    });
    res.json(customers);
  })
);

// POST a new customer
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const {
      name,
      city,
      state,
      country,
      address,
      email,
      phone,
      contactName,
      contactDesignation,
      contactEmail,
      contactPhone,
      relatedToId,
    } = req.body;

    if (!name || !city || !state) {
      return res.status(400).json({ error: "Name, city, and state are required." });
    }

    const customer = await prisma.customer.create({
      data: {
        name,
        city,
        state,
        country: country || "India",
        address,
        email,
        phone,
        contactName,
        contactDesignation,
        contactEmail,
        contactPhone,
        relatedToId: relatedToId || undefined,
      },
    });

    res.status(201).json(customer);
  })
);

// PATCH update a customer
router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
      name, city, state, country, address, email, phone,
      contactName, contactDesignation, contactEmail, contactPhone, relatedToId
    } = req.body;

    const customer = await prisma.customer.update({
      where: { id },
      data: {
        name,
        city,
        state,
        country: country || "India",
        address,
        email,
        phone,
        contactName,
        contactDesignation,
        contactEmail,
        contactPhone,
        relatedToId: relatedToId || null,
      },
    });

    res.json(customer);
  })
);

export const customersRouter = router;
