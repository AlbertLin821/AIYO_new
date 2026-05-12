import type { NormalizedTranscriptLine } from "@/server/video/transcriptProcessing";

export type RawPlaceCandidate = {
  rawText: string;
  cleanedText?: string;
  source: "transcript" | "title" | "description" | "chapter" | "llm";
  startSeconds?: number;
  endSeconds?: number;
  context?: string;
  confidence?: number;
  sourceTranscriptLineIds?: string[];
};

export type PlaceNameQualityResult = {
  accepted: boolean;
  cleanedName?: string;
  rejectedReason?: string;
  warnings?: string[];
};

export type CanonicalPlaceCandidate = {
  rawText: string;
  cleanedName: string;
  canonicalName: string;
  canonicalId?: string;
  aliases: string[];
  type?: string;
  source: RawPlaceCandidate["source"];
  startSeconds?: number;
  endSeconds?: number;
  context?: string;
  confidence: number;
  rejectedReason?: string;
  sourceTranscriptLineIds?: string[];
  evidenceTexts?: string[];
  evidenceSource?: "title" | "description" | "transcript" | "chapter" | "llm";
};

export type VerifiedVideoPlace = {
  id: string;
  name: string;
  canonicalName: string;
  aliases: string[];
  type?: string;
  lat?: number;
  lng?: number;
  address?: string;
  source: "gazetteer" | "geocode" | "search" | "heuristic";
  confidence: number;
  firstMentionStartSeconds?: number;
  firstMentionEndSeconds?: number;
  sourceTranscriptLineIds?: string[];
  evidenceTexts: string[];
};

export type FinalVideoPlaceExtractionInput = {
  transcriptLines: NormalizedTranscriptLine[];
  title: string;
  description?: string;
  destinationHint?: string;
  enableGeocode?: boolean;
  enableSearch?: boolean;
};
