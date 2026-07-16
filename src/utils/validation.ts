import { HttpError } from "../middleware/errorHandler";

export function validateContacts(contacts: any[]) {
  const emails = new Set<string>();
  const phones = new Set<string>();

  for (const c of contacts) {
    if (!c.name) continue;

    if (c.email && c.email.trim()) {
      const emailLower = c.email.trim().toLowerCase();
      if (emails.has(emailLower)) {
        throw new HttpError(400, `Duplicate contact email "${c.email}" for this customer`);
      }
      emails.add(emailLower);
    }

    if (c.phone && c.phone.trim()) {
      const phoneTrim = c.phone.trim();
      if (phones.has(phoneTrim)) {
        throw new HttpError(400, `Duplicate contact phone number "${c.phone}" for this customer`);
      }
      phones.add(phoneTrim);
    }
  }
}

export async function validateContactsDb(tx: any, customerId: string, contacts: any[]) {
  // First, check duplicates in the incoming array itself
  validateContacts(contacts);

  // Then, check if any incoming contact has the same email/phone as another contact in the db for the same customer
  if (customerId) {
    for (const c of contacts) {
      const conditions: any[] = [];
      if (c.email && c.email.trim()) {
        conditions.push({ email: { equals: c.email.trim(), mode: "insensitive" } });
      }
      if (c.phone && c.phone.trim()) {
        conditions.push({ phone: c.phone.trim() });
      }

      if (conditions.length === 0) continue;

      const existing = await tx.customerContact.findFirst({
        where: {
          customerId,
          id: c.id ? { not: c.id } : undefined,
          OR: conditions,
        },
      });

      if (existing) {
        if (c.email && existing.email && existing.email.toLowerCase() === c.email.toLowerCase()) {
          if (!c.id) {
            continue;
          }
          throw new HttpError(400, `A contact with email "${c.email}" already exists for this customer`);
        }
        if (c.phone && existing.phone === c.phone) {
          if (c.email && existing.email && existing.email.toLowerCase() === c.email.toLowerCase()) {
            continue;
          }
          throw new HttpError(400, `A contact with phone number "${c.phone}" already exists for this customer`);
        }
      }
    }
  }
}
