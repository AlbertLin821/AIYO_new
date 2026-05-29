"use client";

import { memo } from "react";
import type { ItineraryListItem } from "@/lib/itinerary-sort";
import ItineraryFolderGroupedView, {
  type ItineraryFolderGroupedViewProps,
} from "./ItineraryFolderGroupedView";

type LandingProps = Omit<
  ItineraryFolderGroupedViewProps,
  | "variant"
  | "viewMode"
  | "showFolderManage"
  | "status"
  | "activeTripId"
  | "onEditTrip"
  | "onDuplicateTrip"
  | "onDeleteTrip"
> & {
  onEdit?: (item: ItineraryListItem) => void;
  onDuplicate?: (item: ItineraryListItem) => void;
  onDelete?: (item: ItineraryListItem) => void;
  onEditTrip?: (item: ItineraryListItem) => void;
  onDuplicateTrip?: (item: ItineraryListItem) => void;
  onDeleteTrip?: (item: ItineraryListItem) => void;
};

function ItineraryLandingFolderView({
  onEdit,
  onDuplicate,
  onDelete,
  onEditTrip,
  onDuplicateTrip,
  onDeleteTrip,
  ...props
}: LandingProps) {
  return (
    <ItineraryFolderGroupedView
      variant="landing"
      showFolderManage
      onEditTrip={onEditTrip ?? onEdit ?? (() => undefined)}
      onDuplicateTrip={onDuplicateTrip ?? onDuplicate ?? (() => undefined)}
      onDeleteTrip={onDeleteTrip ?? onDelete ?? (() => undefined)}
      {...props}
    />
  );
}

export default memo(ItineraryLandingFolderView);
