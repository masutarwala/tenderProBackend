import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEFAULT_PASSWORD = "Passw0rd!";

async function upsertUser(email: string, fullName: string, isAdmin: boolean, menuKeys: string[]) {
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  return prisma.user.upsert({
    where: { email },
    // Re-applies isAdmin/menuKeys on every seed run — important right after
    // the RBAC-removal migration, since pre-existing rows with this email
    // (from before the migration) got isAdmin=false by column default and
    // would otherwise never be corrected by a no-op update.
    update: { fullName, passwordHash, isAdmin, menuKeys },
    create: { email, fullName, passwordHash, isAdmin, menuKeys },
  });
}

async function main() {
  console.log("Seeding users (password for all: 'Passw0rd!')...");
  const admin = await upsertUser("admin@tenderpro.local", "Ada Admin", true, []);
  const bidder = await upsertUser("bidder@tenderpro.local", "Bella Bidder", false, ["dashboard", "my-bids", "task-list"]);
  const salesExec = await upsertUser("sales@tenderpro.local", "Sid SalesExec", false, ["dashboard", "my-bids", "task-list"]);

  console.log("Seeding reference tender (Police SAN Storage, KSP/2026-27/IND0599)...");
  const referenceTenderData = {
    title: "Supply Installation and Maintenance of SAN Storage with 250 TB for Karnataka State Police",
    description:
      "250 TB SAN storage supply, installation, commissioning and 5-year warranty/AMC for Karnataka State Police (SCRB).",
    tenderType: "HARDWARE" as const,
    stage: "EVALUATION" as const,
    status: "PENDING" as const,
    publishedDate: new Date("2026-05-07"),
    preBidDate: new Date("2026-05-19T12:30:00"),
    closingDate: new Date("2026-06-08T17:30:00"),
    bidOpeningDate: new Date("2026-06-10T11:30:00"),
    tenderValue: 16500000,
    emdAmount: 1650000,
    awardCriteria: "QCBS" as const,
    bidValidity: "90 days",
    contractPeriod: "5 years",
    securityDeposit: "5% of contract value",
    slaPenalties: "0.5% per week of delay, capped at 10%",
    paymentTerms: "30 days from delivery, net of taxes",
    customerName: "Karnataka State Police - SCRB",
    customerCity: "Bengaluru",
    customerState: "Karnataka",
    customerAddress: "DIGP SCRB Office, Bengaluru",
    contactName: "DIGP SCRB",
    contactPhone: "08022254790",
    bidderId: bidder.id,
    salesExecId: salesExec.id,
  };
  const tender = await prisma.tender.upsert({
    where: { tenderRefNo: "KSP/2026-27/IND0599" },
    // Re-applies bidder/salesExec/financial fields on every seed run — same
    // no-op-update pitfall as upsertUser above, since this row predates the
    // RBAC-removal migration and would otherwise keep stale/null values.
    update: referenceTenderData,
    create: {
      tenderRefNo: "KSP/2026-27/IND0599",
      ...referenceTenderData,
    },
  });

  const existingTaskCount = await prisma.tenderTask.count({ where: { tenderId: tender.id } });
  if (existingTaskCount === 0) {
    await prisma.tenderTask.createMany({
      data: [
        { tenderId: tender.id, title: "Review Tender Document", assignedUserId: bidder.id, isRequired: true },
        { tenderId: tender.id, title: "Risk Analysis", assignedUserId: bidder.id, isRequired: true },
        { tenderId: tender.id, title: "Technical Clearance Sign-off", assignedUserId: admin.id, isRequired: false },
      ],
    });
    await prisma.comment.create({
      data: {
        tenderId: tender.id,
        userId: bidder.id,
        message: "Tender created and assigned.",
        stage: "EVALUATION",
        status: "PENDING",
      },
    });
  }

  console.log("Seeding QA fixtures covering every stage x status x outcome combination...");
  const fixtures: {
    seq: string;
    title: string;
    stage: "EVALUATION" | "PREPARATION" | "SUBMISSION";
    status: "PENDING" | "COMPLETED";
    outcome?: "WON" | "LOST" | "DROPPED";
  }[] = [
    { seq: "0600", title: "QA Fixture - Evaluation Pending", stage: "EVALUATION", status: "PENDING" },
    { seq: "0601", title: "QA Fixture - Evaluation Completed (Dropped)", stage: "EVALUATION", status: "COMPLETED", outcome: "DROPPED" },
    { seq: "0602", title: "QA Fixture - Preparation Pending", stage: "PREPARATION", status: "PENDING" },
    { seq: "0603", title: "QA Fixture - Preparation Completed", stage: "PREPARATION", status: "COMPLETED" },
    { seq: "0604", title: "QA Fixture - Submission Pending", stage: "SUBMISSION", status: "PENDING" },
    { seq: "0605", title: "QA Fixture - Submission Completed (Won)", stage: "SUBMISSION", status: "COMPLETED", outcome: "WON" },
    { seq: "0606", title: "QA Fixture - Submission Completed (Lost)", stage: "SUBMISSION", status: "COMPLETED", outcome: "LOST" },
  ];
  for (const fixture of fixtures) {
    const qaTenderData = {
      title: fixture.title,
      description: "Seeded fixture for stage/status/outcome QA coverage.",
      tenderType: "HARDWARE" as const,
      stage: fixture.stage,
      status: fixture.status,
      closingDate: new Date("2026-12-31"),
      customerName: "Karnataka State Police - SCRB",
      bidderId: bidder.id,
      salesExecId: salesExec.id,
    };
    const qaTender = await prisma.tender.upsert({
      where: { tenderRefNo: `QA/2026/${fixture.seq}` },
      update: qaTenderData,
      create: {
        tenderRefNo: `QA/2026/${fixture.seq}`,
        ...qaTenderData,
      },
    });
    if (fixture.outcome) {
      await prisma.outcomeRecord.upsert({
        where: { tenderId: qaTender.id },
        update: {
          outcome: fixture.outcome,
          decisionDate: new Date("2026-07-01"),
          winningBidAmount: fixture.outcome === "WON" ? 16000000 : undefined,
          winner: fixture.outcome === "WON" ? "Us" : fixture.outcome === "LOST" ? "Competitor Corp" : undefined,
          reasonForLoss: fixture.outcome === "LOST" ? "Price" : undefined,
          recordedById: bidder.id,
        },
        create: {
          tenderId: qaTender.id,
          outcome: fixture.outcome,
          decisionDate: new Date("2026-07-01"),
          winningBidAmount: fixture.outcome === "WON" ? 16000000 : undefined,
          winner: fixture.outcome === "WON" ? "Us" : fixture.outcome === "LOST" ? "Competitor Corp" : undefined,
          reasonForLoss: fixture.outcome === "LOST" ? "Price" : undefined,
          recordedById: bidder.id,
        },
      });
    }
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
