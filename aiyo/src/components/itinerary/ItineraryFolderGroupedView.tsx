"use client";

import { memo, useCallback, useMemo, useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  ChevronDown,
  Folder,
  FolderOpen,
  FolderPlus,
  Inbox,
  PencilLine,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { zhTW as t } from "@/locales/zh-TW";
import type { ItineraryListItem } from "@/lib/itinerary-sort";
import type { ItineraryFolderDto } from "@/services/itineraryClient";
import { isFolderNameDuplicate } from "@/lib/itinerary-folder-names";
import {
  LANDING_DROP_UNFILED,
  landingDropFolderId,
  parseLandingDropId,
  type ItineraryFolderGroup,
} from "@/lib/itinerary-grouping";
import TripLandingCard from "./TripLandingCard";
import TripLibraryItem from "./TripLibraryItem";

function tripDragId(tripId: string) {
  return `trip:${tripId}`;
}

function parseTripDragId(id: string | number | undefined) {
  if (typeof id !== "string" || !id.startsWith("trip:")) {
    return null;
  }
  return id.slice("trip:".length);
}

type TripListCallbacks = {
  disabled?: boolean;
  tripDuplicatingId: string | null;
  status?: "authenticated" | "loading" | "unauthenticated";
  activeTripId?: string | null;
  onSelectTrip: (item: ItineraryListItem) => void;
  onEditTrip: (item: ItineraryListItem) => void;
  onDuplicateTrip: (item: ItineraryListItem) => void;
  onDeleteTrip: (item: ItineraryListItem) => void;
};

export type ItineraryFolderGroupedViewProps = {
  variant: "landing" | "sidebar";
  unfiled: ItineraryListItem[];
  folderGroups: ItineraryFolderGroup[];
  folders: ItineraryFolderDto[];
  dragEnabled: boolean;
  showFolderManage?: boolean;
  viewMode?: "grid" | "list";
  folderFormOpen?: boolean;
  newFolderName?: string;
  onToggleFolderForm?: () => void;
  onNewFolderNameChange?: (value: string) => void;
  onCreateFolder?: () => void;
  onRenameFolder: (folder: ItineraryFolderDto) => void;
  onDeleteFolder: (folder: ItineraryFolderDto) => void;
  onMoveTripToFolder: (tripId: string, folderId: string | null) => void;
} & TripListCallbacks;

function tripListLayoutClass(variant: "landing" | "sidebar", viewMode: "grid" | "list") {
  if (variant === "landing") {
    return "grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3";
  }
  if (viewMode === "grid") {
    return "grid grid-cols-1 gap-3";
  }
  return "flex flex-col gap-2";
}

function DraggableTripRow({
  variant,
  item,
  index,
  dragEnabled,
  viewMode,
  isDragging,
  callbacks,
}: {
  variant: "landing" | "sidebar";
  item: ItineraryListItem;
  index: number;
  dragEnabled: boolean;
  viewMode: "grid" | "list";
  isDragging?: boolean;
  callbacks: TripListCallbacks;
}) {
  const canDrag = dragEnabled && item.isOwner !== false;
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: tripDragId(item.id),
    disabled: !canDrag,
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  const disabledActions = Boolean(callbacks.disabled);
  const status = callbacks.status ?? "authenticated";
  const active = callbacks.activeTripId != null && item.id === callbacks.activeTripId;
  const compact = variant === "sidebar" && viewMode === "list";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative",
        isDragging && "opacity-40",
        canDrag && "touch-none cursor-grab active:cursor-grabbing",
      )}
      {...(canDrag ? listeners : {})}
      {...(canDrag ? attributes : {})}
      aria-label={canDrag ? t.itineraryPage.landingDragTripAria.replace("{title}", item.title) : undefined}
    >
      {variant === "landing" ? (
        <TripLandingCard
          item={item}
          index={index}
          disabled={disabledActions}
          duplicating={callbacks.tripDuplicatingId === item.id}
          tripMapHref={`/trip/${item.id}`}
          onClick={callbacks.onSelectTrip}
          onEdit={callbacks.onEditTrip}
          onDuplicate={callbacks.onDuplicateTrip}
          onDelete={callbacks.onDeleteTrip}
        />
      ) : (
        <TripLibraryItem
          item={item}
          active={active}
          compact={compact}
          disabledActions={disabledActions}
          tripDuplicatingId={callbacks.tripDuplicatingId}
          status={status}
          onSelectTrip={callbacks.onSelectTrip}
          onEditTrip={callbacks.onEditTrip}
          onDuplicateTrip={callbacks.onDuplicateTrip}
          onDeleteTrip={callbacks.onDeleteTrip}
        />
      )}
    </div>
  );
}

function DroppableZone({
  id,
  children,
  className,
}: {
  id: string;
  children: ReactNode;
  className?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        className,
        isOver && "ring-2 ring-primary/40 ring-offset-2 ring-offset-background",
      )}
    >
      {children}
    </div>
  );
}

function TripFolderSection({
  variant,
  viewMode,
  group,
  expanded,
  onToggle,
  dragEnabled,
  activeDragTripId,
  onRenameFolder,
  onDeleteFolder,
  callbacks,
}: {
  variant: "landing" | "sidebar";
  viewMode: "grid" | "list";
  group: ItineraryFolderGroup;
  expanded: boolean;
  onToggle: () => void;
  dragEnabled: boolean;
  activeDragTripId: string | null;
  onRenameFolder: (folder: ItineraryFolderDto) => void;
  onDeleteFolder: (folder: ItineraryFolderDto) => void;
  callbacks: TripListCallbacks;
}) {
  const dropId = landingDropFolderId(group.folder.id);
  const layoutClass = tripListLayoutClass(variant, viewMode);
  const sectionPadding = variant === "sidebar" ? "p-3" : "p-4";

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border-light bg-cream/20 shadow-soft",
        sectionPadding,
      )}
    >
      {dragEnabled && (
        <div
          className={cn(
            "absolute right-1 top-1 z-20 rounded-lg p-1",
            "opacity-0 transition-opacity",
            "hover:opacity-100 focus-within:opacity-100",
          )}
        >
          <div className="flex gap-0.5 rounded-lg bg-surface/95 p-0.5 shadow-soft">
            <button
              type="button"
              aria-label={t.itineraryPage.renameFolderDialogTitle}
              title={t.itineraryPage.renameFolder}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onRenameFolder(group.folder);
              }}
              className="rounded-lg p-2 text-muted transition-colors hover:bg-cream/70 hover:text-primary"
            >
              <PencilLine className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              aria-label={t.itineraryPage.deleteFolderDialogTitle}
              title={t.itineraryPage.deleteFolder}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onDeleteFolder(group.folder);
              }}
              className="rounded-lg p-2 text-muted transition-colors hover:bg-cream/70 hover:text-danger"
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      )}
      <div className="mb-3">
        <button
          type="button"
          onClick={onToggle}
          className="inline-flex min-w-0 w-full items-center gap-2 text-left"
          aria-expanded={expanded}
        >
          {expanded ? (
            <FolderOpen className="size-5 shrink-0 text-primary" aria-hidden />
          ) : (
            <Folder className="size-5 shrink-0 text-primary" aria-hidden />
          )}
          <span
            className={cn(
              "truncate font-semibold text-foreground",
              variant === "sidebar" ? "text-sm" : "text-base",
            )}
          >
            {group.folder.name}
          </span>
          <span className="shrink-0 text-xs text-muted">
            {t.itineraryPage.landingFolderTripCount.replace("{n}", String(group.trips.length))}
          </span>
          <ChevronDown
            className={cn("size-4 shrink-0 text-muted transition-transform", expanded && "rotate-180")}
            aria-hidden
          />
        </button>
      </div>
      {expanded && (
        <DroppableZone
          id={dropId}
          className={cn(
            "rounded-xl border border-dashed border-border-light/80 bg-surface/60 p-2 transition-colors",
            group.trips.length === 0 && (variant === "sidebar" ? "min-h-[80px]" : "min-h-[120px]"),
          )}
        >
          {group.trips.length > 0 ? (
            <div className={layoutClass}>
              {group.trips.map((item, index) => (
                <DraggableTripRow
                  key={item.id}
                  variant={variant}
                  item={item}
                  index={index}
                  dragEnabled={dragEnabled}
                  viewMode={viewMode}
                  isDragging={activeDragTripId === item.id}
                  callbacks={callbacks}
                />
              ))}
            </div>
          ) : (
            <p className="px-2 py-6 text-center text-xs text-muted sm:text-sm">
              {t.itineraryPage.landingFolderDropHint}
            </p>
          )}
        </DroppableZone>
      )}
    </section>
  );
}

function UnfiledSection({
  variant,
  viewMode,
  trips,
  dragEnabled,
  activeDragTripId,
  callbacks,
}: {
  variant: "landing" | "sidebar";
  viewMode: "grid" | "list";
  trips: ItineraryListItem[];
  dragEnabled: boolean;
  activeDragTripId: string | null;
  callbacks: TripListCallbacks;
}) {
  const layoutClass = tripListLayoutClass(variant, viewMode);

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <Inbox className="size-5 text-muted" aria-hidden />
        <h2
          className={cn(
            "font-semibold text-foreground",
            variant === "sidebar" ? "text-sm" : "text-base",
          )}
        >
          {t.itineraryPage.landingUnfiledSectionTitle}
        </h2>
        {trips.length > 0 && (
          <span className="text-xs text-muted">
            {t.itineraryPage.landingFolderTripCount.replace("{n}", String(trips.length))}
          </span>
        )}
      </div>
      <DroppableZone
        id={LANDING_DROP_UNFILED}
        className={cn(
          "rounded-2xl border border-dashed border-border-light bg-surface/40 p-2 transition-colors",
          trips.length === 0 && (variant === "sidebar" ? "min-h-[100px]" : "min-h-[140px]"),
        )}
      >
        {trips.length > 0 ? (
          <div className={layoutClass}>
            {trips.map((item, index) => (
              <DraggableTripRow
                key={item.id}
                variant={variant}
                item={item}
                index={index}
                dragEnabled={dragEnabled}
                viewMode={viewMode}
                isDragging={activeDragTripId === item.id}
                callbacks={callbacks}
              />
            ))}
          </div>
        ) : (
          <p className="px-2 py-8 text-center text-xs text-muted sm:text-sm">
            {t.itineraryPage.landingUnfiledDropHint}
          </p>
        )}
      </DroppableZone>
    </section>
  );
}

function ItineraryFolderGroupedView({
  variant,
  unfiled,
  folderGroups,
  folders,
  dragEnabled,
  showFolderManage = variant === "landing",
  viewMode = "list",
  folderFormOpen = false,
  newFolderName = "",
  onToggleFolderForm,
  onNewFolderNameChange,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveTripToFolder,
  ...callbacks
}: ItineraryFolderGroupedViewProps) {
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(() => new Set());
  const [activeDragTrip, setActiveDragTrip] = useState<ItineraryListItem | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const allTrips = useMemo(
    () => [...unfiled, ...folderGroups.flatMap((group) => group.trips)],
    [folderGroups, unfiled],
  );

  const toggleFolder = useCallback((folderId: string) => {
    setCollapsedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }, []);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const tripId = parseTripDragId(event.active.id);
      if (!tripId) {
        return;
      }
      const item = allTrips.find((trip) => trip.id === tripId) ?? null;
      setActiveDragTrip(item);
    },
    [allTrips],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragTrip(null);
      const tripId = parseTripDragId(event.active.id);
      if (!tripId || !event.over) {
        return;
      }
      const targetFolderId = parseLandingDropId(String(event.over.id));
      const trip = allTrips.find((item) => item.id === tripId);
      if (!trip) {
        return;
      }
      const currentFolderId = trip.folderId ?? null;
      if (currentFolderId === targetFolderId) {
        return;
      }
      onMoveTripToFolder(tripId, targetFolderId);
    },
    [allTrips, onMoveTripToFolder],
  );

  const showUnfiled = unfiled.length > 0 || dragEnabled;
  const showEmptyFolders = dragEnabled && folders.length > 0;
  const spacingClass = variant === "sidebar" ? "space-y-4" : "space-y-6";
  const newFolderNameDuplicate =
    newFolderName.trim().length > 0 && isFolderNameDuplicate(folders, newFolderName);

  return (
    <div className={spacingClass}>
      {showFolderManage && dragEnabled && (
        <div className="rounded-xl border border-border-light bg-cream/25 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-muted">{t.itineraryPage.landingFolderManageHint}</p>
            <button
              type="button"
              onClick={onToggleFolderForm}
              className="inline-flex items-center gap-2 rounded-lg border border-border-light bg-surface px-3 py-2 text-xs font-medium text-foreground hover:bg-cream/60"
            >
              <FolderPlus className="size-4" />
              {t.itineraryPage.createFolder}
            </button>
          </div>
          {folderFormOpen && (
            <div className="mt-3 flex gap-2">
              <input
                value={newFolderName}
                onChange={(event) => onNewFolderNameChange?.(event.target.value)}
                placeholder={t.itineraryPage.folderNamePh}
                className="min-w-0 flex-1 rounded-lg border border-border-light bg-surface px-3 py-2 text-xs text-foreground"
              />
              <button
                type="button"
                onClick={onCreateFolder}
                disabled={!newFolderName.trim() || newFolderNameDuplicate}
                className="rounded-lg bg-primary px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
              >
                {t.itineraryPage.confirmCreateFolder}
              </button>
            </div>
          )}
          {folderFormOpen && newFolderNameDuplicate && (
            <p className="mt-2 text-xs text-danger">{t.itineraryPage.folderNameDuplicate}</p>
          )}
        </div>
      )}

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        {showUnfiled && (
          <UnfiledSection
            variant={variant}
            viewMode={viewMode}
            trips={unfiled}
            dragEnabled={dragEnabled}
            activeDragTripId={activeDragTrip?.id ?? null}
            callbacks={callbacks}
          />
        )}

        {folderGroups.map((group) => (
          <TripFolderSection
            key={group.folder.id}
            variant={variant}
            viewMode={viewMode}
            group={group}
            expanded={!collapsedFolderIds.has(group.folder.id)}
            onToggle={() => toggleFolder(group.folder.id)}
            dragEnabled={dragEnabled}
            activeDragTripId={activeDragTrip?.id ?? null}
            onRenameFolder={onRenameFolder}
            onDeleteFolder={onDeleteFolder}
            callbacks={callbacks}
          />
        ))}

        {showEmptyFolders &&
          folders
            .filter((folder) => !folderGroups.some((group) => group.folder.id === folder.id))
            .map((folder) => (
              <TripFolderSection
                key={folder.id}
                variant={variant}
                viewMode={viewMode}
                group={{ folder, trips: [] }}
                expanded={!collapsedFolderIds.has(folder.id)}
                onToggle={() => toggleFolder(folder.id)}
                dragEnabled={dragEnabled}
                activeDragTripId={activeDragTrip?.id ?? null}
                onRenameFolder={onRenameFolder}
                onDeleteFolder={onDeleteFolder}
                callbacks={callbacks}
              />
            ))}

        <DragOverlay>
          {activeDragTrip ? (
            <div
              className={cn(
                "rotate-1 opacity-95 shadow-lg",
                variant === "sidebar" ? "w-full max-w-[280px]" : "w-[min(100vw-2rem,320px)]",
              )}
            >
              {variant === "landing" ? (
                <TripLandingCard item={activeDragTrip} index={0} disabled onClick={() => undefined} />
              ) : (
                <TripLibraryItem
                  item={activeDragTrip}
                  active={false}
                  compact={viewMode === "list"}
                  disabledActions
                  tripDuplicatingId={null}
                  status={callbacks.status ?? "authenticated"}
                  onSelectTrip={() => undefined}
                  onEditTrip={() => undefined}
                  onDuplicateTrip={() => undefined}
                  onDeleteTrip={() => undefined}
                />
              )}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

export default memo(ItineraryFolderGroupedView);
