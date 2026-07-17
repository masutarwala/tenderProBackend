import { prisma } from "./src/lib/prisma";

async function main() {
  console.log("Migrating existing checklist item phases...");
  
  // 1. Move "Submission" from PREPARATION to SUBMISSION
  const res1 = await prisma.tenderUpdateChecklist.updateMany({
    where: { label: "Submission", phase: "PREPARATION" },
    data: { phase: "SUBMISSION" },
  });
  console.log(`Moved ${res1.count} "Submission" items to SUBMISSION phase.`);

  // 2. Move "Technical round" from OUTCOME to SUBMISSION
  const res2 = await prisma.tenderUpdateChecklist.updateMany({
    where: { label: "Technical round", phase: "OUTCOME" },
    data: { phase: "SUBMISSION" },
  });
  console.log(`Moved ${res2.count} "Technical round" items to SUBMISSION phase.`);

  // 3. Move "Commercial round" from OUTCOME to SUBMISSION
  const res3 = await prisma.tenderUpdateChecklist.updateMany({
    where: { label: "Commercial round", phase: "OUTCOME" },
    data: { phase: "SUBMISSION" },
  });
  console.log(`Moved ${res3.count} "Commercial round" items to SUBMISSION phase.`);

  console.log("Migration complete!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
