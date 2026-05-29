import { prisma } from "@/lib/prisma";

async function main() {
  const total = await prisma.$queryRaw<Array<{ c: number }>>`
    SELECT COUNT(*)::int AS c FROM "video_summary_caches"
  `;
  const pipeline = await prisma.$queryRaw<Array<{ c: number }>>`
    SELECT COUNT(*)::int AS c FROM "video_summary_caches"
    WHERE "videoId" LIKE 'video-simple-ollama-v2:%'
  `;
  console.log(JSON.stringify({ totalRows: total[0]?.c ?? 0, pipelineRows: pipeline[0]?.c ?? 0 }, null, 2));
}

main()
  .finally(() => prisma.$disconnect());
