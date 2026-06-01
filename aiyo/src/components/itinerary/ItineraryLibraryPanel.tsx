"use client";

import { memo, useMemo } from "react";
import { FolderPlus, LayoutGrid, List, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { zhTW as t } from "@/locales/zh-TW";
import { isFolderNameDuplicate } from "@/lib/itinerary-folder-names";
import { groupItinerariesForLanding } from "@/lib/itinerary-grouping";
import type { ItineraryListItem, ItinerarySortOption } from "@/lib/itinerary-sort";
import type { ItineraryFolderDto } from "@/services/itineraryClient";
import ItineraryFolderGroupedView from "@/components/itinerary/ItineraryFolderGroupedView";

export type TripLibrarySort = Extract<
  ItinerarySortOption,
  "updatedAt_desc" | "title_asc" | "createdAt_desc" | "days_asc"
>;

type Props = {
  status: "authenticated" | "loading" | "unauthenticated";
  activeTripId: string | null;
  currentFolderId: string | null;
  scopeTab: "myTrips" | "sharedTrips";
  search: string;
  sort: TripLibrarySort;
  viewMode: "grid" | "list";
  folderFormOpen: boolean;
  folders: ItineraryFolderDto[];
  newFolderName: string;
  visibleItineraries: ItineraryListItem[];
  libraryLoading: boolean;
  tripSwitching: boolean;
  tripDeletingId: string | null;
  tripDuplicatingId: string | null;
  folderError: string | null;
  libraryError: string | null;
  emptyHint: string;
  canEdit: boolean;
  hideScopeTabs?: boolean;
  onScopeTabChange: (tab: "myTrips" | "sharedTrips") => void;
  onSearchChange: (value: string) => void;
  onSortChange: (value: TripLibrarySort) => void;
  onViewModeChange: (value: "grid" | "list") => void;
  onToggleFolderForm: () => void;
  onNewFolderNameChange: (value: string) => void;
  onCreateFolder: () => void;
  onRenameFolder: (folder: ItineraryFolderDto) => void;
  onDeleteFolder: (folder: ItineraryFolderDto) => void;
  onMoveCurrentTripToFolder: (folderId: string | null) => void;
  onMoveTripToFolder: (tripId: string, folderId: string | null) => void;
  onSelectTrip: (item: ItineraryListItem) => void;
  onEditTrip: (item: ItineraryListItem) => void;
  onDuplicateTrip: (item: ItineraryListItem) => void;
  onDeleteTrip: (item: ItineraryListItem) => void;
};

function ItineraryLibraryPanel({
  status,
  activeTripId,
  currentFolderId,
  scopeTab,
  search,
  sort,
  viewMode,
  folderFormOpen,
  folders,
  newFolderName,
  visibleItineraries,
  libraryLoading,
  tripSwitching,
  tripDeletingId,
  tripDuplicatingId,
  folderError,
  libraryError,
  emptyHint,
  canEdit,
  hideScopeTabs = false,
  onScopeTabChange,
  onSearchChange,
  onSortChange,
  onViewModeChange,
  onToggleFolderForm,
  onNewFolderNameChange,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveCurrentTripToFolder,
  onMoveTripToFolder,
  onSelectTrip,
  onEditTrip,
  onDuplicateTrip,
  onDeleteTrip,
}: Props) {
  const disabledActions = tripSwitching || tripDeletingId !== null;
  const landingGroups = useMemo(
    () => groupItinerariesForLanding(visibleItineraries, folders),
    [folders, visibleItineraries],
  );
  const hasGroupedTrips =
    landingGroups.unfiled.length > 0 || landingGroups.folderGroups.length > 0;
  const newFolderNameDuplicate =
    newFolderName.trim().length > 0 && isFolderNameDuplicate(folders, newFolderName);

  return (
    <section className="rounded-2xl border border-border-light bg-surface p-4 shadow-soft lg:sticky lg:top-6">
      <div className="mb-4 flex min-w-0 items-center gap-2">
        {!hideScopeTabs ? (
          <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 text-sm font-semibold">
            <button
              type="button"
              onClick={() => onScopeTabChange("myTrips")}
              className={cn(
                "min-w-0 truncate rounded-xl px-2 py-2 transition-colors sm:px-3",
                scopeTab === "myTrips" ? "bg-foreground text-white" : "bg-cream/45 text-muted hover:text-foreground",
              )}
            >
              {t.itineraryPage.tabMyTrips}
            </button>
            <button
              type="button"
              onClick={() => onScopeTabChange("sharedTrips")}
              className={cn(
                "min-w-0 truncate rounded-xl px-2 py-2 transition-colors sm:px-3",
                scopeTab === "sharedTrips" ? "bg-foreground text-white" : "bg-cream/45 text-muted hover:text-foreground",
              )}
            >
              {t.itineraryPage.tabSharedTrips}
            </button>
          </div>
        ) : (
          <div className="min-w-0 flex-1" />
        )}
        <div className="flex shrink-0 items-center gap-1 rounded-full border border-border-light bg-cream/30 p-1">
          <button
            type="button"
            aria-label={t.itineraryPage.viewGrid}
            onClick={() => onViewModeChange("grid")}
            className={cn("rounded-full p-2 transition-colors", viewMode === "grid" ? "bg-foreground text-white" : "text-muted hover:text-foreground")}
          >
            <LayoutGrid className="size-4" />
          </button>
          <button
            type="button"
            aria-label={t.itineraryPage.viewList}
            onClick={() => onViewModeChange("list")}
            className={cn("rounded-full p-2 transition-colors", viewMode === "list" ? "bg-foreground text-white" : "text-muted hover:text-foreground")}
          >
            <List className="size-4" />
          </button>
        </div>
      </div>

      <div className="mb-4 grid gap-2">
        <div className="flex min-h-[42px] min-w-0 items-center gap-2 rounded-xl border border-border-light bg-cream/35 px-3 py-2">
          <Search className="size-4 shrink-0 text-muted-light" />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={t.itineraryPage.searchFolders}
            className="min-w-0 flex-1 bg-transparent text-xs font-normal text-foreground placeholder:text-muted-light focus:outline-none"
          />
        </div>
        {status === "authenticated" && (
          <select
            id="trip-library-sort"
            data-testid="trip-library-sort"
            value={sort}
            onChange={(event) => onSortChange(event.target.value as TripLibrarySort)}
            className="min-h-[42px] rounded-xl border border-border-light bg-surface px-3 py-2 text-xs font-medium text-foreground"
            aria-label={t.itineraryPage.librarySortSelectAria}
          >
            <option value="updatedAt_desc">{t.itineraryPage.librarySortByTime}</option>
            <option value="title_asc">{t.itineraryPage.librarySortByTitle}</option>
            <option value="createdAt_desc">{t.itineraryPage.librarySortByCreated}</option>
            <option value="days_asc">{t.itineraryPage.librarySortByTripDays}</option>
          </select>
        )}
      </div>

      {!hideScopeTabs && scopeTab === "myTrips" && (
        <div className="mb-4 overflow-hidden rounded-xl border border-border-light bg-cream/25 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 flex-1 text-xs font-semibold text-muted">{t.itineraryPage.filterCurrentTripFolder}</p>
            <button
              type="button"
              onClick={onToggleFolderForm}
              className="inline-flex max-w-full shrink-0 items-center gap-2 rounded-lg border border-border-light bg-surface px-3 py-2 text-xs font-medium text-foreground hover:bg-cream/60"
            >
              <FolderPlus className="size-4" />
              {t.itineraryPage.createFolder}
            </button>
          </div>
          {activeTripId && (
            <select
              aria-label={t.itineraryPage.filterCurrentTripFolder}
              value={currentFolderId ?? ""}
              disabled={!canEdit}
              onChange={(event) => onMoveCurrentTripToFolder(event.target.value || null)}
              className="mt-3 w-full rounded-xl border border-border-light bg-surface px-3 py-2 text-xs text-foreground disabled:opacity-60"
            >
              <option value="">{t.itineraryPage.unfiledFolder}</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
          )}
          {folderFormOpen && (
            <div className="mt-3 flex gap-2">
              <input
                value={newFolderName}
                onChange={(event) => onNewFolderNameChange(event.target.value)}
                placeholder={t.itineraryPage.folderNamePh}
                className="min-w-0 flex-1 rounded-lg border border-border-light bg-surface px-3 py-2 text-xs text-foreground"
              />
              <button
                type="button"
                onClick={onCreateFolder}
                disabled={
                  status !== "authenticated" || !newFolderName.trim() || newFolderNameDuplicate
                }
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

      {(folderError || libraryError) && (
        <p className="mb-4 break-words rounded-xl border border-danger/20 bg-danger/10 px-3 py-2 text-xs text-danger">
          {folderError || libraryError}
        </p>
      )}
      {tripSwitching && <p className="mb-3 text-xs text-primary">{t.itineraryPage.switchingTrip}</p>}

      {libraryLoading && visibleItineraries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-light bg-surface/60 px-4 py-12 text-center text-sm text-muted">
          {t.itineraryPage.libraryLoading}
        </div>
      ) : !hasGroupedTrips ? (
        <div className="rounded-xl border border-dashed border-border-light bg-surface/60 px-4 py-10 text-center text-sm text-muted">
          {emptyHint}
        </div>
      ) : (
        <ItineraryFolderGroupedView
          variant="sidebar"
          unfiled={landingGroups.unfiled}
          folderGroups={landingGroups.folderGroups}
          folders={folders}
          dragEnabled={scopeTab === "myTrips" && canEdit}
          showFolderManage={false}
          viewMode={viewMode}
          activeTripId={activeTripId}
          status={status}
          disabled={disabledActions}
          tripDuplicatingId={tripDuplicatingId}
          onSelectTrip={onSelectTrip}
          onEditTrip={onEditTrip}
          onDuplicateTrip={onDuplicateTrip}
          onDeleteTrip={onDeleteTrip}
          onRenameFolder={onRenameFolder}
          onDeleteFolder={onDeleteFolder}
          onMoveTripToFolder={onMoveTripToFolder}
        />
      )}
    </section>
  );
}

export default memo(ItineraryLibraryPanel);
