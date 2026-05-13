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
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowUpDown, CalendarDays, LinkIcon, Plus, Search } from "lucide-react";
import DeleteTripDialog from "@/components/itinerary/DeleteTripDialog";
import ItineraryEditorSection from "@/components/itinerary/ItineraryEditorSection";
import type { TripLibrarySort } from "@/components/itinerary/ItineraryLibraryPanel";
import ItineraryPageHeader from "@/components/itinerary/ItineraryPageHeader";
import ItineraryShareDialog from "@/components/itinerary/ItineraryShareDialog";
import RenameTripDialog from "@/components/itinerary/RenameTripDialog";
import TripLandingCard from "@/components/itinerary/TripLandingCard";
import type { AddActivityDraft } from "@/components/itinerary/AddActivityForm";
import ConfirmDialog from "@/components/system/ConfirmDialog";
import PromptDialog from "@/components/system/PromptDialog";
import {
  addTripCollaborator,
  createNewTrip,
  deleteItineraryFolder,
  joinCollabTrip,
  deleteTrip,
  duplicateTrip,
  listItineraryFolders,
  listTripsForLibrary,
  listTripCollaborators,
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
  const [tripLibrarySort, setTripLibrarySort] = useState<TripLibrarySort>("createdAt_desc");
  const [itinerarySearch, setItinerarySearch] = useState("");
  const deferredItinerarySearch = useDeferredValue(itinerarySearch);
  const [fabOpen, setFabOpen] = useState(false);
  const [, setFolders] = useState<ItineraryFolderDto[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
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
  const [deleteTarget, setDeleteTarget] = useState<ItineraryListItem | null>(null);
  const [deleteDayTarget, setDeleteDayTarget] = useState<{ dayNumber: number; displayOrdinal: number } | null>(null);
  const [renameFolderTarget, setRenameFolderTarget] = useState<ItineraryFolderDto | null>(null);
  const [renameFolderDraft, setRenameFolderDraft] = useState("");
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<ItineraryFolderDto | null>(null);
  const [folderDialogSaving, setFolderDialogSaving] = useState(false);
  const [coverImageHint, setCoverImageHint] = useState<string | null>(null);
  const libraryEditCoverInputRef = useRef<HTMLInputElement>(null);
  const [collaborators, setCollaborators] = useState<TripCollaboratorDto[]>([]);
  const [collabEmail, setCollabEmail] = useState("");
  const [collabRole, setCollabRole] = useState<"editor" | "viewer">("viewer");
  const [collabError, setCollabError] = useState<string | null>(null);
  const [recoveringTrip, setRecoveringTrip] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinLoading, setJoinLoading] = useState(false);
  const itemIdCounter = useRef(0);
  const lastCursorSentAt = useRef(0);

  const requireAuthenticated = useCallback(
    (redirectPath: string) => {
      if (status === "loading") {
        return false;
      }
      if (status === "authenticated") {
        return true;
      }
      router.push(`/login?callbackUrl=${encodeURIComponent(redirectPath)}`);
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
      const rows = await listTripsForLibrary("recent");
      setTripLibrary(rows);
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : t.itineraryPage.libraryLoadFailed);
      setTripLibrary([]);
    } finally {
      setLibraryLoading(false);
    }
  }, [status]);

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
        const rows = await listTripCollaborators(id);
        if (useTripStore.getState().tripId === id) {
          setCollaborators(rows);
        }
      } catch (error) {
        if (useTripStore.getState().tripId === id) {
          setCollabError(error instanceof Error ? error.message : "無法載入協作者。");
        }
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

  const handleCreateNewTrip = useCallback(async () => {
    if (!requireAuthenticated("/itinerary")) return;
    setRecoveringTrip(true);
    try {
      const created = await createNewTrip();
      const snapshot = await setActiveTrip(created.tripId);
      syncService.applyTripSwitch(snapshot);
      syncService.startRealtime(snapshot.collaboration?.roomId ?? null);
      void refreshCollaboratorsForTrip(created.tripId);
      void loadTripLibrary();
      setShowEditor(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      pushToast({
        variant: "error",
        title: t.bootstrap.failedTitle,
        description: message.trim() || t.itineraryPage.recoverTripFailed,
      });
    } finally {
      setRecoveringTrip(false);
    }
  }, [loadTripLibrary, pushToast, refreshCollaboratorsForTrip, requireAuthenticated]);

  const handleJoinCollab = useCallback(async () => {
    if (!requireAuthenticated("/itinerary")) return;
    const raw = joinCode.trim();
    if (!raw) return;

    const code = raw.includes("invite=")
      ? new URL(raw, window.location.origin).searchParams.get("invite") ?? raw
      : raw;

    setJoinLoading(true);
    try {
      const result = await joinCollabTrip(code);
      const snapshot = await setActiveTrip(result.tripId);
      syncService.applyTripSwitch(snapshot);
      syncService.startRealtime(snapshot.collaboration?.roomId ?? null);
      void refreshCollaboratorsForTrip(result.tripId);
      void loadTripLibrary();
      setJoinCode("");
      setJoinDialogOpen(false);
      pushToast({ variant: "success", title: "已加入共用行程", description: result.tripName || "" });
      setShowEditor(true);
    } catch (error) {
      pushToast({
        variant: "error",
        title: "加入失敗",
        description: error instanceof Error ? error.message : "邀請碼或連結無效",
      });
    } finally {
      setJoinLoading(false);
    }
  }, [joinCode, loadTripLibrary, pushToast, refreshCollaboratorsForTrip, requireAuthenticated]);

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
      void syncService.flushTripSyncNow();
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
      setDeleteDayTarget({ dayNumber, displayOrdinal });
    },
    [itinerary.length, requireAuthenticated],
  );

  const handleConfirmDeleteDay = useCallback(() => {
    if (!deleteDayTarget) {
      return;
    }
    const { dayNumber } = deleteDayTarget;
    if (!requireAuthenticated("/itinerary")) {
      return;
    }
    removeDay(dayNumber);
    setAddingToDay((current) => (current === dayNumber ? null : current));
    setDeleteDayTarget(null);
  }, [deleteDayTarget, removeDay, requireAuthenticated]);

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

  const closeRenameFolderDialog = useCallback(() => {
    if (folderDialogSaving) {
      return;
    }
    setRenameFolderTarget(null);
    setRenameFolderDraft("");
  }, [folderDialogSaving]);

  const handleConfirmRenameFolder = useCallback(async () => {
    if (!renameFolderTarget) {
      return;
    }
    const name = renameFolderDraft.trim();
    if (!name || name === renameFolderTarget.name) {
      closeRenameFolderDialog();
      return;
    }
    setFolderDialogSaving(true);
    setFolderError(null);
    try {
      const updated = await updateItineraryFolder(renameFolderTarget.id, { name });
      setFolders((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      setRenameFolderTarget(null);
      setRenameFolderDraft("");
      void loadTripLibrary();
    } catch (error) {
      setFolderError(error instanceof Error ? error.message : t.itineraryPage.renameFolderFailed);
    } finally {
      setFolderDialogSaving(false);
    }
  }, [closeRenameFolderDialog, loadTripLibrary, renameFolderDraft, renameFolderTarget]);

  const closeDeleteFolderDialog = useCallback(() => {
    if (folderDialogSaving) {
      return;
    }
    setDeleteFolderTarget(null);
  }, [folderDialogSaving]);

  const handleConfirmDeleteFolder = useCallback(async () => {
    if (!deleteFolderTarget) {
      return;
    }
    const folder = deleteFolderTarget;
    setFolderDialogSaving(true);
    setFolderError(null);
    try {
      await deleteItineraryFolder(folder.id);
      setFolders((items) => items.filter((item) => item.id !== folder.id));
      if (currentFolderId === folder.id) {
        setCurrentFolderId(null);
      }
      setDeleteFolderTarget(null);
      void loadTripLibrary();
    } catch (error) {
      setFolderError(error instanceof Error ? error.message : t.itineraryPage.deleteFolderFailed);
    } finally {
      setFolderDialogSaving(false);
    }
  }, [currentFolderId, deleteFolderTarget, loadTripLibrary]);

  const handleSelectTripFromLibrary = useCallback(
    async (item: ItineraryListItem) => {
      if (item.id === tripId) {
        setShowEditor(true);
        document.getElementById("itinerary-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      if (!requireAuthenticated("/itinerary")) {
        return;
      }
      setTripSwitching(true);
      setLibraryError(null);
      try {
        setCollaborators([]);
        const snapshot = await setActiveTrip(item.id);
        syncService.applyTripSwitch(snapshot);
        syncService.startRealtime(snapshot.collaboration?.roomId ?? null);
        setCurrentFolderId(item.folderId ?? null);
        void refreshCollaboratorsForTrip(item.id);
        setShowEditor(true);
      } catch (error) {
        setLibraryError(error instanceof Error ? error.message : t.itineraryPage.libraryLoadFailed);
      } finally {
        setTripSwitching(false);
      }
    },
    [refreshCollaboratorsForTrip, requireAuthenticated, tripId],
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

  const handleRequestDeleteTrip = useCallback(
    (item: ItineraryListItem) => {
      if (!item.isOwner || !requireAuthenticated("/itinerary")) {
        return;
      }
      setDeleteTarget(item);
    },
    [requireAuthenticated],
  );

  const closeDeleteDialog = useCallback(() => {
    if (tripDeletingId) {
      return;
    }
    setDeleteTarget(null);
  }, [tripDeletingId]);

  const handleConfirmDeleteTrip = useCallback(
    async (item: ItineraryListItem) => {
      if (!item.isOwner || !requireAuthenticated("/itinerary")) {
        return;
      }
      const previousTripLibrary = tripLibrary;
      const wasActiveTrip = useTripStore.getState().tripId === item.id;
      setLibraryError(null);
      setDeleteTarget(null);
      setTripDeletingId(item.id);
      setTripLibrary((items) => items.filter((candidate) => candidate.id !== item.id));
      try {
        await deleteTrip(item.id);
        if (wasActiveTrip) {
          setRecoveringTrip(true);
          try {
            const snapshot = await syncService.loadBootstrap();
            syncService.applyBootstrap(snapshot, { source: "trip-delete", forceTrip: true });
            syncService.startRealtime(snapshot.collaboration?.roomId ?? null);
          } finally {
            setRecoveringTrip(false);
          }
          const replacementId = useTripStore.getState().tripId;
          if (replacementId) {
            void refreshCollaboratorsForTrip(replacementId);
          }
        }
        void loadTripLibrary();
      } catch (error) {
        setTripLibrary(previousTripLibrary);
        setLibraryError(error instanceof Error ? error.message : t.itineraryPage.deleteTripFailed);
      } finally {
        setTripDeletingId(null);
      }
    },
    [loadTripLibrary, refreshCollaboratorsForTrip, requireAuthenticated, tripLibrary],
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
      if (!roomId || !tripId) {
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
    [roomId, tripId],
  );

  const visibleItineraries = useMemo(
    () => sortItineraries(filterItineraries(tripLibrary, deferredItinerarySearch), tripLibrarySort),
    [deferredItinerarySearch, tripLibrary, tripLibrarySort],
  );

  const myId = session?.user?.id;
  const othersEditorPresence = useMemo(
    () =>
      presence.filter(
        (entry) =>
          entry.userId !== myId &&
          (entry.activeSection === "itinerary-editor" || entry.activeSection === "itinerary"),
      ),
    [myId, presence],
  );

  const currentLibraryItem = useMemo(
    () => tripLibrary.find((item) => item.id === tripId),
    [tripId, tripLibrary],
  );
  const isCurrentTripShared = currentLibraryItem?.isOwner === false;
  const currentRole =
    collaborators.find((member) => member.userId === myId)?.role ||
    (status === "authenticated" && currentLibraryItem?.isOwner !== false ? "owner" : "viewer");
  const canEdit = canCollaborator(currentRole, "edit");
  const canManageShare = canCollaborator(currentRole, "managePermissions");
  const emptyTripLibraryHint =
    !deferredItinerarySearch.trim() && tripLibrary.length === 0
      ? t.itineraryPage.noOwnedTripsInLibrary
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

  const showTripSummaryRow = useMemo(() => {
    if (!tripId) {
      return false;
    }
    const hasItems = itinerary.some((day) => day.items.length > 0);
    return (
      hasItems ||
      destination.trim().length > 0 ||
      days > 1 ||
      budget > 0
    );
  }, [budget, days, destination, itinerary, tripId]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AnimatePresence mode="wait">
        {!showEditor ? (
          <motion.div
            key="landing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="mx-auto max-w-6xl px-5 py-8 lg:px-8"
          >
            <div className="mb-8 text-center">
              <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-lavender text-white">
                <CalendarDays className="size-6" />
              </div>
              <h1 className="text-2xl font-bold text-foreground">{t.itineraryPage.title}</h1>
              <p className="mt-2 text-sm text-muted">{t.itineraryPage.subtitle}</p>
            </div>

            <div className="mb-6 mx-auto max-w-md">
              <div className="flex items-center gap-2 rounded-xl border border-border-light bg-cream/35 px-4 py-2.5">
                <Search className="size-4 shrink-0 text-muted-light" />
                <input
                  value={itinerarySearch}
                  onChange={(e) => setItinerarySearch(e.target.value)}
                  placeholder={t.itineraryPage.searchFolders}
                  className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-light focus:outline-none"
                />
              </div>
            </div>

            <div className="mb-5 flex items-center justify-between">
              <p className="text-xs text-muted">
                共 {visibleItineraries.length} 個行程
              </p>
              <div className="flex items-center gap-1.5">
                <ArrowUpDown className="size-3.5 text-muted" aria-hidden />
                {(
                  [
                    { value: "createdAt_desc", label: t.itineraryPage.librarySortByCreated },
                    { value: "updatedAt_desc", label: t.itineraryPage.librarySortByTime },
                    { value: "title_asc", label: t.itineraryPage.librarySortByTitle },
                    { value: "days_asc", label: t.itineraryPage.librarySortByTripDays },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setTripLibrarySort(opt.value)}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      tripLibrarySort === opt.value
                        ? "bg-primary/10 text-primary"
                        : "text-muted hover:bg-cream/60 hover:text-foreground"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {libraryLoading && visibleItineraries.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border-light bg-surface/60 px-4 py-16 text-center text-sm text-muted">
                {t.itineraryPage.libraryLoading}
              </div>
            ) : tripSwitching ? (
              <div className="rounded-2xl border border-dashed border-border-light bg-surface/60 px-4 py-16 text-center text-sm text-primary">
                {t.itineraryPage.switchingTrip}
              </div>
            ) : visibleItineraries.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border-light bg-surface/60 px-4 py-16 text-center text-sm text-muted">
                {emptyTripLibraryHint}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {visibleItineraries.map((item, index) => (
                  <TripLandingCard
                    key={item.id}
                    item={item}
                    index={index}
                    disabled={tripSwitching || tripDeletingId !== null}
                    duplicating={tripDuplicatingId === item.id}
                    onClick={(selected) => void handleSelectTripFromLibrary(selected)}
                    onEdit={handleEditTripFromLibrary}
                    onDuplicate={(selected) => void handleDuplicateTrip(selected)}
                    onDelete={handleRequestDeleteTrip}
                  />
                ))}
              </div>
            )}

            {(libraryError || folderError) && (
              <p className="mt-4 rounded-xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
                {libraryError || folderError}
              </p>
            )}

            {fabOpen && (
              <div className="fixed inset-0 z-40" onClick={() => setFabOpen(false)} />
            )}
            <div
              className="fixed bottom-24 right-6 z-50 flex flex-col items-end gap-3 lg:bottom-8"
              onClick={(e) => e.stopPropagation()}
            >
              <AnimatePresence>
                {fabOpen && (
                  <>
                    <motion.div
                      initial={{ opacity: 0, y: 16, scale: 0.8 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 16, scale: 0.8 }}
                      transition={{ duration: 0.15 }}
                      className="flex items-center gap-2"
                    >
                      <span className="rounded-lg bg-foreground/80 px-3 py-1.5 text-xs font-medium text-white shadow-sm">
                        加入別人的行程
                      </span>
                      <button
                        type="button"
                        onClick={() => { setFabOpen(false); setJoinDialogOpen(true); }}
                        className="flex size-12 items-center justify-center rounded-full bg-secondary text-white shadow-lg transition-transform hover:scale-105"
                      >
                        <LinkIcon className="size-5" />
                      </button>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, y: 16, scale: 0.8 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 16, scale: 0.8 }}
                      transition={{ duration: 0.15, delay: 0.05 }}
                      className="flex items-center gap-2"
                    >
                      <span className="rounded-lg bg-foreground/80 px-3 py-1.5 text-xs font-medium text-white shadow-sm">
                        新增行程
                      </span>
                      <button
                        type="button"
                        disabled={recoveringTrip}
                        onClick={() => { setFabOpen(false); void handleCreateNewTrip(); }}
                        className="flex size-12 items-center justify-center rounded-full bg-primary text-white shadow-lg transition-transform hover:scale-105 disabled:opacity-60"
                      >
                        <CalendarDays className="size-5" />
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>

              <button
                type="button"
                onClick={() => setFabOpen((v) => !v)}
                className={`flex size-14 items-center justify-center rounded-full shadow-lg transition-all duration-200 ${
                  fabOpen
                    ? "rotate-45 bg-muted text-white"
                    : "bg-primary text-white hover:bg-primary-dark"
                }`}
              >
                <Plus className="size-6" />
              </button>
            </div>

            <AnimatePresence>
              {joinDialogOpen && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4"
                  onClick={() => { if (!joinLoading) { setJoinDialogOpen(false); setJoinCode(""); } }}
                >
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 12 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 12 }}
                    transition={{ duration: 0.2 }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full max-w-sm rounded-2xl border border-border-light bg-surface p-6 shadow-soft-lg"
                  >
                    <h3 className="mb-1 text-base font-bold text-foreground">加入別人的行程</h3>
                    <p className="mb-4 text-xs text-muted">輸入邀請碼或貼上邀請連結來加入他人的共用行程</p>
                    <input
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && joinCode.trim()) void handleJoinCollab(); }}
                      placeholder="邀請碼 或 邀請連結"
                      autoFocus
                      disabled={joinLoading}
                      className="mb-4 w-full rounded-xl border border-border-light bg-cream/30 px-4 py-3 text-sm text-foreground placeholder:text-muted-light focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => { setJoinDialogOpen(false); setJoinCode(""); }}
                        disabled={joinLoading}
                        className="rounded-xl px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:text-foreground disabled:opacity-60"
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        disabled={!joinCode.trim() || joinLoading}
                        onClick={() => void handleJoinCollab()}
                        className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
                      >
                        {joinLoading ? "加入中..." : "加入"}
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ) : (
          <motion.div
            key="editor"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-8 lg:px-8">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowEditor(false)}
                  className="flex items-center gap-2 rounded-xl border border-border-light bg-surface px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-cream/50 hover:text-foreground"
                >
                  <ArrowLeft className="size-4" />
                  {t.itineraryPage.title}
                </button>
              </div>

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
                showTripSummaryRow={showTripSummaryRow}
                onShare={() => setShareOpen(true)}
                onAddDay={() => void handleAddDay()}
                onOpenMap={() => router.push("/map")}
              />

              <ItineraryEditorSection
                itinerary={itinerary}
                tripId={tripId}
                isAuthenticated={status === "authenticated"}
                isSharedTrips={isCurrentTripShared}
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
          </motion.div>
        )}
      </AnimatePresence>

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

      <ConfirmDialog
        open={Boolean(deleteDayTarget)}
        title={t.itineraryPage.deleteDayDialogTitle}
        description={
          deleteDayTarget
            ? t.itineraryPage.deleteDayConfirm.replace("{n}", String(deleteDayTarget.displayOrdinal))
            : ""
        }
        confirmLabel={t.itineraryPage.deleteDayConfirmAction}
        cancelLabel={t.itineraryPage.deleteDayCancel}
        variant="danger"
        onCancel={() => setDeleteDayTarget(null)}
        onConfirm={handleConfirmDeleteDay}
      />

      <PromptDialog
        open={Boolean(renameFolderTarget)}
        title={t.itineraryPage.renameFolderDialogTitle}
        label={t.itineraryPage.renameFolderLabel}
        value={renameFolderDraft}
        confirmLabel={t.itineraryPage.renameFolderSave}
        cancelLabel={t.itineraryPage.renameFolderCancel}
        pending={folderDialogSaving}
        onValueChange={setRenameFolderDraft}
        onCancel={closeRenameFolderDialog}
        onConfirm={() => void handleConfirmRenameFolder()}
      />

      <ConfirmDialog
        open={Boolean(deleteFolderTarget)}
        title={t.itineraryPage.deleteFolderDialogTitle}
        description={
          deleteFolderTarget
            ? t.itineraryPage.deleteFolderConfirm.replace("{name}", deleteFolderTarget.name)
            : ""
        }
        confirmLabel={t.itineraryPage.deleteFolderConfirmAction}
        cancelLabel={t.itineraryPage.deleteFolderCancel}
        pending={folderDialogSaving}
        pendingLabel={t.itineraryPage.deleteFolderDeleting}
        variant="danger"
        onCancel={closeDeleteFolderDialog}
        onConfirm={() => void handleConfirmDeleteFolder()}
      />

      <DeleteTripDialog
        target={deleteTarget}
        deleting={Boolean(tripDeletingId)}
        onCancel={closeDeleteDialog}
        onConfirm={() => {
          if (deleteTarget) {
            void handleConfirmDeleteTrip(deleteTarget);
          }
        }}
      />
    </div>
  );
}
