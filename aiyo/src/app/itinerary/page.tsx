"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  filterItineraries,
  sortItineraries,
  type ItineraryListItem,
} from "@/lib/itinerary-sort";
import { canCollaborator } from "@/lib/permissions";
import { zhTW as t } from "@/locales/zh-TW";
import ItineraryEditorSection from "@/components/itinerary/ItineraryEditorSection";
import ItineraryLibraryPanel, {
  type TripLibrarySort,
} from "@/components/itinerary/ItineraryLibraryPanel";
import ItineraryPageHeader from "@/components/itinerary/ItineraryPageHeader";
import ItineraryShareDialog from "@/components/itinerary/ItineraryShareDialog";
import RenameTripDialog from "@/components/itinerary/RenameTripDialog";
import type { AddActivityDraft } from "@/components/itinerary/AddActivityForm";
import {
  addTripCollaborator,
  createItineraryFolder,
  deleteItineraryFolder,
  deleteTrip,
  duplicateTrip,
  listItineraryFolders,
  listTripsForLibrary,
  listTripCollaborators,
  moveTripToFolder,
  patchTripDetails,
  removeTripCollaborator,
  setActiveTrip,
  updateItineraryFolder,
  updateTripCollaboratorRole,
  type ItineraryFolderDto,
  type TripCollaboratorDto,
} from "@/services/itineraryClient";
import { syncService } from "@/services/syncService";
import { useCollabStore } from "@/stores/useCollabStore";
import { withSyncMutationSource } from "@/stores/syncMutationSource";
import { useToastStore } from "@/stores/useToastStore";
import { useTripStore } from "@/stores/useTripStore";
import type { BootstrapPayload, TripPlanItem } from "@/types";

const MAX_COVER_DATA_URL_CHARS = 850_000;

const EMPTY_ADD_DRAFT: AddActivityDraft = {
  title: "",
  time: "10:00",
  location: "",
  type: "attraction",
  notes: "",
};

async function compressImageFileToDataUrl(
  file: File,
): Promise<{ ok: true; url: string } | { ok: false; reason: "format" | "size" | "decode" }> {
  if (!file.type.startsWith("image/")) {
    return { ok: false, reason: "format" };
  }
  try {
    const bitmap = await createImageBitmap(file);
    const maxW = 960;
    const scale = Math.min(1, maxW / bitmap.width);
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return { ok: false, reason: "decode" };
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const url = canvas.toDataURL("image/jpeg", 0.82);
    if (url.length > MAX_COVER_DATA_URL_CHARS) {
      return { ok: false, reason: "size" };
    }
    return { ok: true, url };
  } catch {
    return { ok: false, reason: "decode" };
  }
}

export default function ItineraryPage() {
  const router = useRouter();
  const { status, data: session } = useSession();
  const {
    itinerary,
    tripId,
    title,
    destination,
    days,
    budget,
    coverImageUrl,
    lastUpdatedAt,
    addDay,
    insertDayAfter,
    removeDay,
    addItineraryItem,
    updateItineraryItem,
    removeItineraryItem,
    reorderItineraryItem,
  } = useTripStore();
  const { inviteCode, shareLink, roomId, presence } = useCollabStore();
  const pushToast = useToastStore((state) => state.pushToast);

  const [addingToDay, setAddingToDay] = useState<number | null>(null);
  const [addDraft, setAddDraft] = useState<AddActivityDraft>(EMPTY_ADD_DRAFT);
  const [shareOpen, setShareOpen] = useState(false);
  const [isInteractive, setIsInteractive] = useState(false);
  const [folderFormOpen, setFolderFormOpen] = useState(false);
  const [tripLibrarySort, setTripLibrarySort] = useState<TripLibrarySort>("createdAt_desc");
  const [itinerarySearch, setItinerarySearch] = useState("");
  const deferredItinerarySearch = useDeferredValue(itinerarySearch);
  const [libraryScopeTab, setLibraryScopeTab] = useState<"myTrips" | "sharedTrips">("myTrips");
  const [folderViewMode, setFolderViewMode] = useState<"grid" | "list">("grid");
  const [folders, setFolders] = useState<ItineraryFolderDto[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [folderError, setFolderError] = useState<string | null>(null);
  const [tripLibrary, setTripLibrary] = useState<ItineraryListItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [tripSwitching, setTripSwitching] = useState(false);
  const [tripDeletingId, setTripDeletingId] = useState<string | null>(null);
  const [tripDuplicatingId, setTripDuplicatingId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<ItineraryListItem | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameCoverUrl, setRenameCoverUrl] = useState<string | null>(null);
  const [renameSaving, setRenameSaving] = useState(false);
  const [coverImageHint, setCoverImageHint] = useState<string | null>(null);
  const libraryEditCoverInputRef = useRef<HTMLInputElement>(null);
  const [collaborators, setCollaborators] = useState<TripCollaboratorDto[]>([]);
  const [collabEmail, setCollabEmail] = useState("");
  const [collabRole, setCollabRole] = useState<"editor" | "viewer">("viewer");
  const [collabError, setCollabError] = useState<string | null>(null);
  const [recoveringTrip, setRecoveringTrip] = useState(false);
  const itemIdCounter = useRef(0);
  const lastCursorSentAt = useRef(0);

  const requireAuthenticated = useCallback(
    (redirectPath: string) => {
      if (status === "authenticated") {
        return true;
      }
      router.push(`/login?redirect=${encodeURIComponent(redirectPath)}`);
      return false;
    },
    [router, status],
  );

  const loadTripLibrary = useCallback(async () => {
    if (status !== "authenticated") {
      setTripLibrary([]);
      return;
    }
    setLibraryLoading(true);
    setLibraryError(null);
    try {
      const rows = await listTripsForLibrary(libraryScopeTab === "myTrips" ? "mine" : "shared");
      setTripLibrary(rows);
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : t.itineraryPage.libraryLoadFailed);
      setTripLibrary([]);
    } finally {
      setLibraryLoading(false);
    }
  }, [libraryScopeTab, status]);

  const refreshFolders = useCallback(async () => {
    if (status !== "authenticated") {
      return;
    }
    try {
      setFolderError(null);
      setFolders(await listItineraryFolders());
    } catch (error) {
      setFolderError(error instanceof Error ? error.message : "無法載入資料夾。");
    }
  }, [status]);

  const refreshCollaboratorsForTrip = useCallback(
    async (id: string) => {
      if (status !== "authenticated" || !id) {
        return;
      }
      try {
        setCollabError(null);
        setCollaborators(await listTripCollaborators(id));
      } catch (error) {
        setCollabError(error instanceof Error ? error.message : "無法載入協作者。");
      }
    },
    [status],
  );

  const refreshCollaborators = useCallback(async () => {
    if (status !== "authenticated" || !tripId) {
      return;
    }
    await refreshCollaboratorsForTrip(tripId);
  }, [refreshCollaboratorsForTrip, status, tripId]);

  const handleAddDay = useCallback(async () => {
    if (!requireAuthenticated("/itinerary")) {
      return;
    }
    if (!useTripStore.getState().tripId) {
      setRecoveringTrip(true);
      let snapshot: BootstrapPayload | null = null;
      try {
        snapshot = await syncService.loadBootstrap();
        syncService.applyBootstrap(snapshot, { source: "itinerary-ensure-trip", forceTrip: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        pushToast({
          variant: "error",
          title: t.bootstrap.failedTitle,
          description: message.trim() || t.itineraryPage.recoverTripFailed,
        });
        return;
      } finally {
        setRecoveringTrip(false);
      }

      if (!useTripStore.getState().tripId) {
        pushToast({
          variant: "error",
          title: t.itineraryPage.noActiveTripTitle,
          description: t.itineraryPage.recoverTripFailed,
        });
        return;
      }

      syncService.startRealtime(snapshot?.collaboration?.roomId ?? null);

      if (useTripStore.getState().itinerary.length === 0) {
        addDay();
      }
      return;
    }

    addDay();
  }, [addDay, pushToast, requireAuthenticated]);

  const handleAddItem = useCallback(
    (dayNumber: number) => {
      if (!requireAuthenticated("/itinerary")) {
        return;
      }
      if (!addDraft.title.trim()) {
        return;
      }
      itemIdCounter.current += 1;
      addItineraryItem(dayNumber, {
        id: `item_new_${dayNumber}_${itemIdCounter.current}`,
        dayNumber,
        time: addDraft.time,
        title: addDraft.title.trim(),
        type: addDraft.type,
        notes: addDraft.notes.trim() || undefined,
        location: addDraft.location.trim()
          ? {
              name: addDraft.location.trim(),
              lat: 0,
              lng: 0,
              description: addDraft.notes.trim() || addDraft.location.trim(),
              address: addDraft.location.trim(),
            }
          : undefined,
        source: "manual",
      });
      setAddDraft(EMPTY_ADD_DRAFT);
      setAddingToDay(null);
    },
    [addDraft, addItineraryItem, requireAuthenticated],
  );

  const handleStartAddActivity = useCallback(
    (dayNumber: number) => {
      if (!requireAuthenticated("/itinerary")) {
        return;
      }
      setAddingToDay(dayNumber);
      setAddDraft(EMPTY_ADD_DRAFT);
    },
    [requireAuthenticated],
  );

  const handleInsertDayAfter = useCallback(
    (dayNumber: number) => {
      if (!requireAuthenticated("/itinerary")) {
        return;
      }
      insertDayAfter(dayNumber);
    },
    [insertDayAfter, requireAuthenticated],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent, dayNumber: number, items: TripPlanItem[]) => {
      if (!requireAuthenticated("/itinerary")) {
        return;
      }
      const { active, over } = event;
      if (over && active.id !== over.id) {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        reorderItineraryItem(dayNumber, oldIndex, newIndex);
      }
    },
    [reorderItineraryItem, requireAuthenticated],
  );

  const handleRemoveDay = useCallback(
    (dayNumber: number, displayOrdinal: number) => {
      if (!requireAuthenticated("/itinerary")) {
        return;
      }
      if (itinerary.length <= 1) {
        return;
      }
      const message = t.itineraryPage.deleteDayConfirm.replace("{n}", String(displayOrdinal));
      if (!window.confirm(message)) {
        return;
      }
      removeDay(dayNumber);
      setAddingToDay((current) => (current === dayNumber ? null : current));
    },
    [itinerary.length, removeDay, requireAuthenticated],
  );

  const handleRemoveItem = useCallback(
    (dayNumber: number, itemId: string) => {
      if (!requireAuthenticated("/itinerary")) {
        return;
      }
      removeItineraryItem(dayNumber, itemId);
    },
    [removeItineraryItem, requireAuthenticated],
  );

  const handleUpdateItem = useCallback(
    (dayNumber: number, itemId: string, patch: Partial<TripPlanItem>) => {
      if (!requireAuthenticated("/itinerary")) {
        return;
      }
      updateItineraryItem(dayNumber, itemId, patch);
    },
    [requireAuthenticated, updateItineraryItem],
  );

  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) {
      return;
    }
    const folder = await createItineraryFolder({
      name: newFolderName.trim(),
      sortOrder: folders.length,
    });
    setFolders((items) => [...items, folder]);
    setNewFolderName("");
    void loadTripLibrary();
  }, [folders.length, loadTripLibrary, newFolderName]);

  const handleRenameFolder = useCallback(
    async (folder: ItineraryFolderDto) => {
      const name = window.prompt("重新命名資料夾", folder.name)?.trim();
      if (!name || name === folder.name) {
        return;
      }
      const updated = await updateItineraryFolder(folder.id, { name });
      setFolders((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      void loadTripLibrary();
    },
    [loadTripLibrary],
  );

  const handleDeleteFolder = useCallback(
    async (folder: ItineraryFolderDto) => {
      if (!window.confirm(`刪除「${folder.name}」？行程會移出資料夾，不會被刪除。`)) {
        return;
      }
      await deleteItineraryFolder(folder.id);
      setFolders((items) => items.filter((item) => item.id !== folder.id));
      if (currentFolderId === folder.id) {
        setCurrentFolderId(null);
      }
      void loadTripLibrary();
    },
    [currentFolderId, loadTripLibrary],
  );

  const handleMoveCurrentTripToFolder = useCallback(
    async (folderId: string | null) => {
      if (!tripId || !requireAuthenticated("/itinerary")) {
        return;
      }
      setFolderError(null);
      try {
        await moveTripToFolder(tripId, folderId);
        setCurrentFolderId(folderId);
        await loadTripLibrary();
      } catch (error) {
        setFolderError(error instanceof Error ? error.message : "無法更新行程資料夾。");
      }
    },
    [loadTripLibrary, requireAuthenticated, tripId],
  );

  const handleSelectTripFromLibrary = useCallback(
    async (item: ItineraryListItem) => {
      if (item.id === tripId) {
        document.getElementById("itinerary-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      if (!requireAuthenticated("/itinerary")) {
        return;
      }
      setTripSwitching(true);
      setLibraryError(null);
      try {
        await setActiveTrip(item.id);
        const snapshot = await syncService.loadBootstrap();
        syncService.applyBootstrap(snapshot, { source: "trip-switch", forceTrip: true });
        syncService.startRealtime(snapshot.collaboration?.roomId ?? null);
        setCurrentFolderId(item.folderId ?? null);
        await loadTripLibrary();
        await refreshCollaboratorsForTrip(item.id);
      } catch (error) {
        setLibraryError(error instanceof Error ? error.message : t.itineraryPage.libraryLoadFailed);
      } finally {
        setTripSwitching(false);
      }
    },
    [loadTripLibrary, refreshCollaboratorsForTrip, requireAuthenticated, tripId],
  );

  const handleEditTripFromLibrary = useCallback(
    (item: ItineraryListItem) => {
      if (item.isOwner) {
        setRenameTarget(item);
        setRenameDraft(item.title);
        setRenameCoverUrl(item.coverImageUrl ?? null);
        setCoverImageHint(null);
      } else {
        void handleSelectTripFromLibrary(item);
      }
    },
    [handleSelectTripFromLibrary],
  );

  const handleDuplicateTrip = useCallback(
    async (item: ItineraryListItem) => {
      if (!requireAuthenticated("/itinerary")) {
        return;
      }
      setLibraryError(null);
      setTripDuplicatingId(item.id);
      try {
        await duplicateTrip(item.id);
        await loadTripLibrary();
      } catch (error) {
        setLibraryError(error instanceof Error ? error.message : t.itineraryPage.duplicateTripFailed);
      } finally {
        setTripDuplicatingId(null);
      }
    },
    [loadTripLibrary, requireAuthenticated],
  );

  const handleDeleteTrip = useCallback(
    async (item: ItineraryListItem) => {
      if (!item.isOwner || !requireAuthenticated("/itinerary")) {
        return;
      }
      if (!window.confirm(t.itineraryPage.deleteTripConfirm.replace("{title}", item.title))) {
        return;
      }
      setLibraryError(null);
      setTripDeletingId(item.id);
      try {
        await deleteTrip(item.id);
        await loadTripLibrary();
        const activeTripId = useTripStore.getState().tripId;
        if (activeTripId === item.id) {
          const snapshot = await syncService.loadBootstrap();
          syncService.applyBootstrap(snapshot, { source: "trip-delete", forceTrip: true });
          syncService.startRealtime(snapshot.collaboration?.roomId ?? null);
          await loadTripLibrary();
          const replacementId = useTripStore.getState().tripId;
          if (replacementId) {
            await refreshCollaboratorsForTrip(replacementId);
          }
        }
      } catch (error) {
        setLibraryError(error instanceof Error ? error.message : t.itineraryPage.deleteTripFailed);
      } finally {
        setTripDeletingId(null);
      }
    },
    [loadTripLibrary, refreshCollaboratorsForTrip, requireAuthenticated],
  );

  const handleLibraryEditCoverFiles = useCallback(async (files: FileList | null) => {
    setCoverImageHint(null);
    const file = files?.[0];
    if (!file) {
      return;
    }
    const result = await compressImageFileToDataUrl(file);
    if (!result.ok) {
      if (result.reason === "format") {
        setCoverImageHint(t.itineraryPage.tripCoverInvalidType);
      } else if (result.reason === "size") {
        setCoverImageHint(t.itineraryPage.tripCoverTooLarge);
      } else {
        setCoverImageHint(t.itineraryPage.tripCoverReadFailed);
      }
      return;
    }
    setRenameCoverUrl(result.url);
    if (libraryEditCoverInputRef.current) {
      libraryEditCoverInputRef.current.value = "";
    }
  }, []);

  const clearLibraryEditCover = useCallback(() => {
    setCoverImageHint(null);
    setRenameCoverUrl(null);
    if (libraryEditCoverInputRef.current) {
      libraryEditCoverInputRef.current.value = "";
    }
  }, []);

  const closeRenameDialog = useCallback(() => {
    if (renameSaving) {
      return;
    }
    setRenameTarget(null);
    setRenameCoverUrl(null);
    setCoverImageHint(null);
    if (libraryEditCoverInputRef.current) {
      libraryEditCoverInputRef.current.value = "";
    }
  }, [renameSaving]);

  const handleSaveLibraryRename = useCallback(async () => {
    if (!renameTarget || !requireAuthenticated("/itinerary")) {
      return;
    }
    setLibraryError(null);
    setRenameSaving(true);
    try {
      const { title: savedTitle, coverImageUrl: savedCover } = await patchTripDetails(renameTarget.id, {
        title: renameDraft,
        coverImageUrl: renameCoverUrl,
      });
      const nextTitle = savedTitle.trim();
      if (useTripStore.getState().tripId === renameTarget.id) {
        withSyncMutationSource("bootstrap", () => {
          useTripStore.setState({ title: nextTitle, coverImageUrl: savedCover });
        });
      }
      setRenameTarget(null);
      setRenameCoverUrl(null);
      if (libraryEditCoverInputRef.current) {
        libraryEditCoverInputRef.current.value = "";
      }
      await loadTripLibrary();
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : t.itineraryPage.renameTripFailed);
    } finally {
      setRenameSaving(false);
    }
  }, [loadTripLibrary, renameCoverUrl, renameDraft, renameTarget, requireAuthenticated]);

  const handleAddCollaborator = useCallback(async () => {
    if (!tripId || !collabEmail.trim()) {
      return;
    }
    const collaborator = await addTripCollaborator(tripId, {
      email: collabEmail.trim(),
      role: collabRole,
    });
    setCollaborators((items) => [
      ...items.filter((item) => item.userId !== collaborator.userId),
      collaborator,
    ]);
    setCollabEmail("");
  }, [collabEmail, collabRole, tripId]);

  const handleUpdateCollaboratorRole = useCallback(
    async (memberTripId: string, userId: string, role: "editor" | "viewer") => {
      const updated = await updateTripCollaboratorRole(memberTripId, userId, role);
      setCollaborators((items) => items.map((item) => (item.userId === updated.userId ? updated : item)));
    },
    [],
  );

  const handleRemoveCollaborator = useCallback(async (memberTripId: string, userId: string) => {
    await removeTripCollaborator(memberTripId, userId);
    setCollaborators((items) => items.filter((item) => item.userId !== userId));
  }, []);

  const sendSharedTripCursor = useCallback(
    (clientX: number, clientY: number, rect: DOMRect) => {
      if (libraryScopeTab !== "sharedTrips" || !roomId || !tripId) {
        return;
      }
      const now = Date.now();
      if (now - lastCursorSentAt.current < 180) {
        return;
      }
      lastCursorSentAt.current = now;
      const x = ((clientX - rect.left) / Math.max(rect.width, 1)) * 100;
      const y = ((clientY - rect.top) / Math.max(rect.height, 1)) * 100;
      void syncService.sendPresenceHeartbeat({
        roomId,
        activeSection: "itinerary-editor",
        selectedEntityId: tripId,
        cursorX: Math.round(x * 10) / 10,
        cursorY: Math.round(y * 10) / 10,
      });
    },
    [libraryScopeTab, roomId, tripId],
  );

  const visibleItineraries = useMemo(
    () => sortItineraries(filterItineraries(tripLibrary, deferredItinerarySearch), tripLibrarySort),
    [deferredItinerarySearch, tripLibrary, tripLibrarySort],
  );

  const myId = session?.user?.id;
  const othersEditorPresence = useMemo(
    () =>
      libraryScopeTab === "sharedTrips"
        ? presence.filter(
            (entry) =>
              entry.userId !== myId &&
              (entry.activeSection === "itinerary-editor" || entry.activeSection === "itinerary"),
          )
        : [],
    [libraryScopeTab, myId, presence],
  );

  const currentRole =
    collaborators.find((member) => member.userId === myId)?.role ||
    (status === "authenticated" ? "owner" : "viewer");
  const canEdit = canCollaborator(currentRole, "edit");
  const canManageShare = canCollaborator(currentRole, "managePermissions");
  const emptyTripLibraryHint =
    libraryScopeTab === "myTrips" && !deferredItinerarySearch.trim() && tripLibrary.length === 0
      ? t.itineraryPage.noOwnedTripsInLibrary
      : libraryScopeTab === "sharedTrips" && !deferredItinerarySearch.trim() && tripLibrary.length === 0
        ? t.itineraryPage.emptySharedTrips
        : t.itineraryPage.emptyLibrary;

  useEffect(() => {
    void refreshFolders();
  }, [refreshFolders]);

  useEffect(() => {
    void loadTripLibrary();
  }, [loadTripLibrary]);

  useEffect(() => {
    if (!tripId || tripLibrary.length === 0) {
      return;
    }
    const row = tripLibrary.find((item) => item.id === tripId);
    if (row) {
      setCurrentFolderId(row.folderId ?? null);
    }
  }, [tripId, tripLibrary]);

  useEffect(() => {
    if (shareOpen) {
      void refreshCollaborators();
    }
  }, [refreshCollaborators, shareOpen, tripId]);

  useEffect(() => {
    if (status === "authenticated" && tripId) {
      void refreshCollaborators();
    }
  }, [refreshCollaborators, status, tripId]);

  useEffect(() => {
    if (status !== "authenticated" || !lastUpdatedAt) {
      return;
    }
    const timer = window.setTimeout(() => void loadTripLibrary(), 800);
    return () => window.clearTimeout(timer);
  }, [lastUpdatedAt, loadTripLibrary, status]);

  useEffect(() => {
    setIsInteractive(true);
  }, []);

  useEffect(() => {
    if (!renameTarget) {
      return;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeRenameDialog();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [renameTarget, closeRenameDialog]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-8 lg:px-8">
        <ItineraryPageHeader
          title={title}
          destination={destination}
          days={days}
          budget={budget}
          coverImageUrl={coverImageUrl}
          lastUpdatedAt={lastUpdatedAt}
          session={session}
          isInteractive={isInteractive}
          canEdit={status === "authenticated" && canEdit}
          recoveringTrip={recoveringTrip}
          onShare={() => setShareOpen(true)}
          onAddDay={() => void handleAddDay()}
          onOpenMap={() => router.push("/map")}
        />

        <div className="grid items-start gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
          <ItineraryLibraryPanel
            status={status}
            activeTripId={tripId}
            currentFolderId={currentFolderId}
            scopeTab={libraryScopeTab}
            search={itinerarySearch}
            sort={tripLibrarySort}
            viewMode={folderViewMode}
            folderFormOpen={folderFormOpen}
            folders={folders}
            newFolderName={newFolderName}
            visibleItineraries={visibleItineraries}
            libraryLoading={libraryLoading}
            tripSwitching={tripSwitching}
            tripDeletingId={tripDeletingId}
            tripDuplicatingId={tripDuplicatingId}
            folderError={folderError}
            libraryError={libraryError}
            emptyHint={emptyTripLibraryHint}
            canEdit={canEdit}
            onScopeTabChange={setLibraryScopeTab}
            onSearchChange={setItinerarySearch}
            onSortChange={setTripLibrarySort}
            onViewModeChange={setFolderViewMode}
            onToggleFolderForm={() => setFolderFormOpen((open) => !open)}
            onNewFolderNameChange={setNewFolderName}
            onCreateFolder={() => void handleCreateFolder()}
            onRenameFolder={(folder) => void handleRenameFolder(folder)}
            onDeleteFolder={(folder) => void handleDeleteFolder(folder)}
            onMoveCurrentTripToFolder={(folderId) => void handleMoveCurrentTripToFolder(folderId)}
            onSelectTrip={(item) => void handleSelectTripFromLibrary(item)}
            onEditTrip={handleEditTripFromLibrary}
            onDuplicateTrip={(item) => void handleDuplicateTrip(item)}
            onDeleteTrip={(item) => void handleDeleteTrip(item)}
          />

          <ItineraryEditorSection
            itinerary={itinerary}
            tripId={tripId}
            isAuthenticated={status === "authenticated"}
            isSharedTrips={libraryScopeTab === "sharedTrips"}
            canEdit={canEdit}
            recoveringTrip={recoveringTrip}
            addingToDay={addingToDay}
            addDraft={addDraft}
            othersEditorPresence={othersEditorPresence}
            onMouseMove={sendSharedTripCursor}
            onAddDay={() => void handleAddDay()}
            onAddDraftChange={setAddDraft}
            onStartAddActivity={handleStartAddActivity}
            onCancelAddActivity={() => setAddingToDay(null)}
            onSaveAddActivity={handleAddItem}
            onInsertDayAfter={handleInsertDayAfter}
            onRemoveDay={handleRemoveDay}
            onRemoveItem={handleRemoveItem}
            onUpdateItem={handleUpdateItem}
            onReorderItem={handleDragEnd}
          />
        </div>
      </div>

      <ItineraryShareDialog
        open={shareOpen}
        inviteCode={inviteCode}
        shareLink={shareLink}
        collaborators={collaborators}
        canManageShare={canManageShare}
        collabEmail={collabEmail}
        collabRole={collabRole}
        collabError={collabError}
        onClose={() => setShareOpen(false)}
        onCollabEmailChange={setCollabEmail}
        onCollabRoleChange={setCollabRole}
        onAddCollaborator={() => void handleAddCollaborator()}
        onUpdateRole={(memberTripId, userId, role) => void handleUpdateCollaboratorRole(memberTripId, userId, role)}
        onRemoveCollaborator={(memberTripId, userId) => void handleRemoveCollaborator(memberTripId, userId)}
      />

      <RenameTripDialog
        target={renameTarget}
        draft={renameDraft}
        coverUrl={renameCoverUrl}
        saving={renameSaving}
        coverHint={coverImageHint}
        fileInputRef={libraryEditCoverInputRef}
        onDraftChange={setRenameDraft}
        onCoverFiles={(files) => void handleLibraryEditCoverFiles(files)}
        onClearCover={clearLibraryEditCover}
        onSave={() => void handleSaveLibraryRename()}
        onClose={closeRenameDialog}
      />
    </div>
  );
}
