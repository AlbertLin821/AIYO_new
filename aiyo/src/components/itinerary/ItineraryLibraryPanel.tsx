"use client";

import { memo } from "react";
import Image from "next/image";
import {
  Copy,
  Folder,
  FolderPlus,
  LayoutGrid,
  List,
  PencilLine,
  Search,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { zhTW as t } from "@/locales/zh-TW";
import type { ItineraryListItem, ItinerarySortOption } from "@/lib/itinerary-sort";
import type { ItineraryFolderDto } from "@/services/itineraryClient";

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
  onSelectTrip,
  onEditTrip,
  onDuplicateTrip,
  onDeleteTrip,
}: Props) {
  const disabledActions = tripSwitching || tripDeletingId !== null;

  return (
    <section className="rounded-2xl border border-border-light bg-surface p-4 shadow-soft lg:sticky lg:top-6">
      <div className="mb-4 flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold text-foreground">
            {scopeTab === "myTrips" ? t.itineraryPage.folderLibraryTitleMine : t.itineraryPage.folderLibraryTitleShared}
          </h2>
        </div>
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

      <div className="mb-4 grid grid-cols-2 gap-2 text-sm font-semibold">
        <button
          type="button"
          onClick={() => onScopeTabChange("myTrips")}
          className={cn("rounded-xl px-3 py-2 transition-colors", scopeTab === "myTrips" ? "bg-foreground text-white" : "bg-cream/45 text-muted hover:text-foreground")}
        >
          {t.itineraryPage.tabMyTrips}
        </button>
        <button
          type="button"
          onClick={() => onScopeTabChange("sharedTrips")}
          className={cn("rounded-xl px-3 py-2 transition-colors", scopeTab === "sharedTrips" ? "bg-foreground text-white" : "bg-cream/45 text-muted hover:text-foreground")}
        >
          {t.itineraryPage.tabSharedTrips}
        </button>
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

      {scopeTab === "myTrips" && (
        <div className="mb-4 rounded-xl border border-border-light bg-cream/25 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-muted">{t.itineraryPage.filterCurrentTripFolder}</p>
            <button
              type="button"
              onClick={onToggleFolderForm}
              className="inline-flex items-center gap-2 rounded-lg border border-border-light bg-surface px-3 py-2 text-xs font-medium text-foreground hover:bg-cream/60"
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
                disabled={status !== "authenticated" || !newFolderName.trim()}
                className="rounded-lg bg-primary px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
              >
                {t.itineraryPage.confirmCreateFolder}
              </button>
            </div>
          )}
          {folders.length > 0 && (
            <div className="mt-3 flex max-h-24 flex-wrap gap-2 overflow-y-auto">
              {folders.map((folder) => (
                <div key={folder.id} className="inline-flex items-center gap-2 rounded-full border border-border-light bg-surface px-3 py-1.5 text-xs text-muted">
                  <span>{folder.name}</span>
                  <button type="button" onClick={() => onRenameFolder(folder)} className="text-primary hover:text-primary-dark">
                    {t.itineraryPage.renameFolder}
                  </button>
                  <button type="button" onClick={() => onDeleteFolder(folder)} className="text-danger hover:underline">
                    {t.itineraryPage.deleteFolder}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {(folderError || libraryError) && (
        <p className="mb-4 rounded-xl border border-danger/20 bg-danger/10 px-3 py-2 text-xs text-danger">
          {folderError || libraryError}
        </p>
      )}
      {tripSwitching && <p className="mb-3 text-xs text-primary">{t.itineraryPage.switchingTrip}</p>}

      {libraryLoading && visibleItineraries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-light bg-surface/60 px-4 py-12 text-center text-sm text-muted">
          {t.itineraryPage.libraryLoading}
        </div>
      ) : (
        <div className={viewMode === "grid" ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-1" : "flex flex-col gap-2"}>
          {visibleItineraries.map((item) => (
            <TripLibraryItem
              key={item.id}
              item={item}
              active={item.id === activeTripId}
              compact={viewMode === "list"}
              disabledActions={disabledActions}
              tripDuplicatingId={tripDuplicatingId}
              status={status}
              onSelectTrip={onSelectTrip}
              onEditTrip={onEditTrip}
              onDuplicateTrip={onDuplicateTrip}
              onDeleteTrip={onDeleteTrip}
            />
          ))}
          {visibleItineraries.length === 0 && (
            <div className="rounded-xl border border-dashed border-border-light bg-surface/60 px-4 py-10 text-center text-sm text-muted">
              {emptyHint}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function TripLibraryItem({
  item,
  active,
  compact,
  disabledActions,
  tripDuplicatingId,
  status,
  onSelectTrip,
  onEditTrip,
  onDuplicateTrip,
  onDeleteTrip,
}: {
  item: ItineraryListItem;
  active: boolean;
  compact: boolean;
  disabledActions: boolean;
  tripDuplicatingId: string | null;
  status: "authenticated" | "loading" | "unauthenticated";
  onSelectTrip: (item: ItineraryListItem) => void;
  onEditTrip: (item: ItineraryListItem) => void;
  onDuplicateTrip: (item: ItineraryListItem) => void;
  onDeleteTrip: (item: ItineraryListItem) => void;
}) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-surface text-left transition-colors",
        active ? "border-primary/50 ring-2 ring-primary/10" : "border-border-light hover:border-primary/30",
        disabledActions && "pointer-events-none opacity-50",
      )}
    >
      <button
        type="button"
        disabled={disabledActions}
        onClick={() => onSelectTrip(item)}
        className={cn("flex w-full text-left", compact ? "items-center gap-3 px-3 py-3" : "flex-col")}
      >
        {compact ? (
          <Folder className="size-8 shrink-0 text-border-strong" />
        ) : (
          <div className="relative h-[110px] w-full shrink-0 overflow-hidden bg-surface-elevated">
            {item.coverImageUrl ? (
              <Image src={item.coverImageUrl} alt="" fill className="object-cover" unoptimized sizes="280px" />
            ) : (
              <div className="flex h-full items-center justify-center py-6">
                <Folder className="size-14 text-border-strong transition-colors group-hover:text-primary" strokeWidth={1.2} />
              </div>
            )}
          </div>
        )}
        <div className={cn("min-w-0 flex-1", compact ? "" : "border-t border-border-light p-3")}>
          <p className="truncate text-sm font-semibold text-foreground">{item.title}</p>
          <p className="mt-1 truncate text-xs font-semibold text-primary">
            {item.isOwner === false ? `${t.itineraryPage.folderMetaCollaborative} · ` : ""}
            {item.destination} · {t.itineraryPage.folderMetaDays.replace("{n}", String(item.days))}
          </p>
          {!compact && (
            <p className="mt-2 truncate text-[11px] text-muted">
              {item.folderName || t.itineraryPage.unfiledFolder} · {t.itineraryPage.folderMetaUpdated}{" "}
              {new Date(item.updatedAt).toLocaleDateString("zh-TW")}
            </p>
          )}
        </div>
      </button>
      {status === "authenticated" && (
        <div className="absolute right-2 top-2 z-20 flex gap-1 rounded-lg bg-surface/95 p-1 opacity-0 shadow-soft transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <button
            type="button"
            disabled={disabledActions}
            aria-label={(item.isOwner ? t.itineraryPage.renameTripAria : t.itineraryPage.editTripAria).replace("{title}", item.title)}
            title={item.isOwner ? t.itineraryPage.renameTrip : t.itineraryPage.editTrip}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onEditTrip(item);
            }}
            className="rounded-lg p-2 text-muted transition-colors hover:bg-cream/70 hover:text-primary disabled:opacity-40"
          >
            <PencilLine className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            data-testid={`library-duplicate-trip-${item.id}`}
            disabled={disabledActions || tripDuplicatingId === item.id}
            aria-label={t.itineraryPage.duplicateTripAria.replace("{title}", item.title)}
            title={t.itineraryPage.duplicateTrip}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onDuplicateTrip(item);
            }}
            className="rounded-lg p-2 text-muted transition-colors hover:bg-cream/70 hover:text-secondary disabled:opacity-40"
          >
            <Copy className="size-4" aria-hidden />
          </button>
          {item.isOwner && (
            <button
              type="button"
              data-testid={`library-delete-trip-${item.id}`}
              disabled={disabledActions}
              aria-label={t.itineraryPage.deleteTripAria.replace("{title}", item.title)}
              title={t.itineraryPage.deleteTrip}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onDeleteTrip(item);
              }}
              className="rounded-lg p-2 text-muted transition-colors hover:bg-cream/70 hover:text-danger disabled:opacity-40"
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(ItineraryLibraryPanel);
