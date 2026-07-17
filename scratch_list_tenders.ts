import { prisma } from "./src/lib/prisma";

async function main() {
  console.log("Renaming enum values...");
  try {
    await prisma.$executeRawUnsafe(`ALTER TYPE "BidStage" RENAME VALUE 'PROSPECT' TO 'EVALUATION'`);
  } catch (e: any) {
    console.error("Failed to rename PROSPECT:", e.message);
  }
  try {
    await prisma.$executeRawUnsafe(`ALTER TYPE "BidStage" RENAME VALUE 'OPPORTUNITY' TO 'PREPARATION'`);
  } catch (e: any) {
    console.error("Failed to rename OPPORTUNITY:", e.message);
  }
  try {
    await prisma.$executeRawUnsafe(`ALTER TYPE "BidStage" ADD VALUE 'SUBMISSION'`);
  } catch (e: any) {
    console.error("Failed to add SUBMISSION:", e.message);
  }

  const tenders = await prisma.tender.groupBy({
    by: ["bidStage"],
    _count: { _all: true },
  });
  console.log("New tenders count by bidStage:", tenders);
}

main().catch(console.error).finally(() => prisma.$disconnect());
