import { prisma } from "./src/lib/prisma";

async function main() {
  const tenders = await prisma.tender.findMany({
    include: { outcomeRecord: true },
  });

  const now = new Date();
  const isBidClosed = (t: (typeof tenders)[number]) => {
    if (t.status === "COMPLETED") return true;
    if (t.outcomeRecord && t.outcomeRecord.outcome !== "WON") return true;
    return false;
  };

  const allPaidTenders = tenders.filter((t) => t.emdStatus === "PAID" && (t.emdAmount ?? 0) > 0);
  const emdInvestedTotal = {
    count: allPaidTenders.length,
    amount: allPaidTenders.reduce((sum, t) => sum + (t.emdAmount ?? 0), 0),
  };

  const dueTendersAll = allPaidTenders.filter((t) => !t.outcomeRecord?.isEmdRecovered && isBidClosed(t));
  const emdRecoverTotal = {
    count: dueTendersAll.length,
    amount: dueTendersAll.reduce((sum, t) => sum + (t.emdAmount ?? 0), 0),
  };

  console.log("EMD Invested Total:", emdInvestedTotal);
  console.log("EMD Recover Total:", emdRecoverTotal);
}

main().catch(console.error).finally(() => prisma.$disconnect());
