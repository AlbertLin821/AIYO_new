export type SimpleExtractedPlace = {
  name: string;
  type?:
    | "attraction"
    | "landmark"
    | "restaurant"
    | "shop"
    | "station"
    | "market"
    | "district"
    | "hotel"
    | "transport"
    | "unknown";
  evidence?: string;
  startSeconds?: number;
};

export type SimpleExtractedFood = {
  name: string;
  evidence?: string;
  startSeconds?: number;
};

export type SimpleVideoExtractionChunkResult = {
  places: SimpleExtractedPlace[];
  foods: SimpleExtractedFood[];
};

export type SimpleVideoExtractionResult = {
  places: SimpleExtractedPlace[];
  foods: SimpleExtractedFood[];
  debug?: {
    chunkCount: number;
    model: string;
    pipelineVersion: string;
    rawPlaceCount: number;
    rawFoodCount: number;
    finalPlaceCount: number;
    finalFoodCount: number;
    failedChunkCount?: number;
    failedChunks?: Array<{
      chunkIndex: number;
      reason: string;
    }>;
  };
};
