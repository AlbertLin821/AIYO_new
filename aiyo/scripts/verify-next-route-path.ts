import "@/app/api/videos/summarize/route";
import { summarizeVideoForApi } from "@/server/services/videoSummaryConnector";

async function main() {
  const result = await summarizeVideoForApi({
    videoId: "9CfPVVg_Hoc",
    destination: "嘉義市",
    refresh: true,
  });
  console.log(
    JSON.stringify({
      failed: result.debug?.failedChunkCount ?? 0,
      segs: result.segments.length,
      locs: result.extractedLocations.length,
      foods: result.segments.flatMap((s) => s.foods || []).length,
      model: result.debug?.model,
      transcript: result.debug?.transcriptSource,
    }),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
