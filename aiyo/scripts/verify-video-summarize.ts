import { summarizeVideoForApi } from "../src/server/services/videoSummaryConnector";

async function main() {
  const videoId = process.argv[2] || "9CfPVVg_Hoc";
  const result = await summarizeVideoForApi({
    videoId,
    destination: "Chiayi",
    refresh: true,
  });
  console.log(
    JSON.stringify({
      failed: result.debug?.failedChunkCount,
      segs: result.segments?.length ?? 0,
      locs: result.extractedLocations?.length ?? 0,
      foods: result.extractedFoods?.length ?? 0,
      transcript: result.transcriptSource,
      failedChunks: result.debug?.failedChunkCount ?? 0,
    }),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
