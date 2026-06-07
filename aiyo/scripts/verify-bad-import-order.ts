import { getMockVideoSummaryResult } from "../src/lib/mocks/videoSummaryResultFixture";
import { summarizeVideo } from "../src/server/services/videoSummaryService";
import { extractYouTubeVideoId } from "../src/server/providers/youtubeProvider";

void getMockVideoSummaryResult;
void extractYouTubeVideoId;

async function main() {
  const result = await summarizeVideo({
    videoId: "9CfPVVg_Hoc",
    destination: "Chiayi",
    refresh: true,
  });
  console.log({ failed: result.debug?.failedChunkCount, places: result.extractedLocations?.length });
}

main().catch(console.error);
