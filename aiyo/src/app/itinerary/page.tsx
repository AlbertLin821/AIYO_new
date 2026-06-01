"use client";
"use memo";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import type { DragEndEvent } from "@dnd-kit/core";
import { isFolderNameDuplicate } from "@/lib/itinerary-folder-names";
import { groupItinerariesForLanding } from "@/lib/itinerary-grouping";
import {
  filterItineraries,
  sortItineraries,
  type ItineraryListItem,
} from "@/lib/itinerary-sort";
import { canCollaborator } from "@/lib/permissions";
import {
  commitTripDaysAndBudget,
  summarizeShrinkDaysImpact,
} from "@/lib/tripMetaEdit";
import { zhTW as t } from "@/locales/zh-TW";
import { AnimatePresence, m } from "@/lib/motion";
import { ArrowLeft, ArrowUpDown, CalendarDays, LinkIcon, Plus, Search } from "lucide-react";
import DeleteTripDialog from "@/components/itinerary/DeleteTripDialog";
import ItineraryEditorSection from "@/components/itinerary/ItineraryEditorSection";
import ItineraryLibraryPanel, { type TripLibrarySort } from "@/components/itinerary/ItineraryLibraryPanel";
import ItineraryPageHeader from "@/components/itinerary/ItineraryPageHeader";
import ItineraryShareDialog from "@/components/itinerary/ItineraryShareDialog";
import JoinTripDialog from "@/components/itinerary/JoinTripDialog";
import PublishItineraryDialog from "@/components/itinerary/PublishItineraryDialog";
import RenameTripDialog from "@/components/itinerary/RenameTripDialog";
import ItineraryLandingFolderView from "@/components/itinerary/ItineraryLandingFolderView";
import type { AddActivityDraft } from "@/components/itinerary/AddActivityForm";
import ConfirmDialog from "@/components/system/ConfirmDialog";
import PromptDialog from "@/components/system/PromptDialog";
import {
  addTripCollaborator,
  createItineraryFolder,
  createNewTrip,
  deleteItineraryFolder,
  joinCollabTrip,
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
import {
  getTripPublicationStatus,
  publishTrip,
  unpublishTrip,
} from "@/services/publicItineraryClient";
import { syncService } from "@/services/syncService";
import { useCollabStore } from "@/stores/useCollabStore";
import { withSyncMutationSource } from "@/stores/syncMutationSource";
import { useToastStore } from "@/stores/useToastStore";
import { useTripStore } from "@/stores/useTripStore";
import type { BootstrapPayload, TripPlanItem, TripPublicationStatus } from "@/types";

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
  const searchParams = useSearchParams();
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
  const [publishOpen, setPublishOpen] = useState(false);
  const [publicationStatus, setPublicationStatus] = useState<TripPublicationStatus>({
    published: false,
  });
  const [isPublishingPublication, setIsPublishingPublication] = useState(false);
  const [isInteractive, setIsInteractive] = useState(false);
  const [tripLibrarySort, setTripLibrarySort] = useState<TripLibrarySort>("createdAt_desc");
  const [scopeTab, setScopeTab] = useState<"myTrips" | "sharedTrips">("myTrips");
  const [libraryViewMode, setLibraryViewMode] = useState<"grid" | "list">("list");
  const [itinerarySearch, setItinerarySearch] = useState("");
  const deferredItinerarySearch = useDeferredValue(itinerarySearch);
  const [fabOpen, setFabOpen] = useState(false);
  const [folders, setFolders] = useState<ItineraryFolderDto[]>([]);
  const [folderFormOpen, setFolderFormOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
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
  const [deleteItemTarget, setDeleteItemTarget] = useState<{
    dayNumber: number;
    itemId: string;
    title: string;
  } | null>(null);
  const [shrinkDaysTarget, setShrinkDaysTarget] = useState<number | null>(null);
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

  useEffect(() => {
    const requestedTripId = searchParams.get("tripId")?.trim();
    if (status !== "authenticated" || !requestedTripId || requestedTripId === useTripStore.getState().tripId) {
      return;
    }
    void setActiveTrip(requestedTripId)
      .then((snapshot) => {
        syncService.applyTripSwitch(snapshot);
        syncService.startRealtime(snapshot.collaboration?.roomId ?? null);
      })
      .catch(() => {
        pushToast({
          variant: "warning",
          title: "載入指定行程失敗",
          description: "找不到指定行程，已保留目前內容。",
        });
      });
  }, [pushToast, searchParams, status]);
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
      const rows = await listTripsForLibrary(scopeTab === "sharedTrips" ? "shared" : "mine");
      setTripLibrary(rows);
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : t.itineraryPage.libraryLoadFailed);
      setTripLibrary([]);
    } finally {
      setLibraryLoading(false);
    }
  }, [scopeTab, status]);

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

  const handleDaysCommit = useCallback(
    async (nextDays: number) => {
      if (!requireAuthenticated("/itinerary")) {
        return;
      }
      const impact = summarizeShrinkDaysImpact(itinerary, days, nextDays);
      if (impact.willShrink) {
        setShrinkDaysTarget(nextDays);
        return;
      }
      await commitTripDaysAndBudget({ days: nextDays });
    },
    [days, itinerary, requireAuthenticated],
  );

  const handleConfirmShrinkDays = useCallback(async () => {
    if (shrinkDaysTarget === null) {
      return;
    }
    if (!requireAuthenticated("/itinerary")) {
      setShrinkDaysTarget(null);
      return;
    }
    const target = shrinkDaysTarget;
    setShrinkDaysTarget(null);
    await commitTripDaysAndBudget({ days: target });
  }, [requireAuthenticated, shrinkDaysTarget]);

  const shrinkDaysDialogDescription = useMemo(() => {
    if (shrinkDaysTarget === null) {
      return "";
    }
    const impact = summarizeShrinkDaysImpact(itinerary, days, shrinkDaysTarget);
    const rangeStart = impact.toDays + 1;
    const rangeEnd = impact.fromDays;
    const range =
      rangeStart === rangeEnd
        ? t.itineraryPage.shrinkDaysRangeSingle.replace("{n}", String(rangeStart))
        : t.itineraryPage.shrinkDaysRangeMulti
            .replace("{start}", String(rangeStart))
            .replace("{end}", String(rangeEnd));
    if (impact.removedActivityCount > 0) {
      return t.itineraryPage.shrinkDaysConfirmWithActivities
        .replace("{from}", String(impact.fromDays))
        .replace("{to}", String(impact.toDays))
        .replace("{range}", range)
        .replace("{n}", String(impact.removedActivityCount));
    }
    return t.itineraryPage.shrinkDaysConfirmDaysOnly
      .replace("{from}", String(impact.fromDays))
      .replace("{to}", String(impact.toDays))
      .replace("{range}", range);
  }, [days, itinerary, shrinkDaysTarget]);

  const shrinkDaysRemovesActivities = useMemo(() => {
    if (shrinkDaysTarget === null) {
      return false;
    }
    return summarizeShrinkDaysImpact(itinerary, days, shrinkDaysTarget).removedActivityCount > 0;
  }, [days, itinerary, shrinkDaysTarget]);

  const handleBudgetCommit = useCallback(
    async (nextBudget: number) => {
      if (!requireAuthenticated("/itinerary")) {
        return;
      }
      await commitTripDaysAndBudget({ budget: nextBudget });
    },
    [requireAuthenticated],
  );

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
      await loadTripLibrary();
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
      void syncService.flushTripSyncNow({ force: true });
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
      const day = useTripStore.getState().itinerary.find((entry) => entry.dayNumber === dayNumber);
      const item = day?.items.find((entry) => entry.id === itemId);
      setDeleteItemTarget({
        dayNumber,
        itemId,
        title: item?.title?.trim() || t.itineraryPanel.newActivityTitle,
      });
    },
    [requireAuthenticated],
  );

  const handleConfirmDeleteItem = useCallback(() => {
    if (!deleteItemTarget) {
      return;
    }
    removeItineraryItem(deleteItemTarget.dayNumber, deleteItemTarget.itemId);
    setDeleteItemTarget(null);
  }, [deleteItemTarget, removeItineraryItem]);

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
    if (isFolderNameDuplicate(folders, name, renameFolderTarget.id)) {
      setFolderError(t.itineraryPage.folderNameDuplicate);
      return;
    }
    setFolderDialogSaving(true);
    setFolderError(null);
    try {
      const updated = await updateItineraryFolder(renameFolderTarget.id, { name });
      setFolders((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      setTripLibrary((items) =>
        items.map((item) =>
          item.folderId === updated.id ? { ...item, folderName: updated.name } : item,
        ),
      );
      setRenameFolderTarget(null);
      setRenameFolderDraft("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.toLowerCase().includes("already exists")) {
        setFolderError(t.itineraryPage.folderNameDuplicate);
        return;
      }
      setFolderError(message.trim() || t.itineraryPage.renameFolderFailed);
    } finally {
      setFolderDialogSaving(false);
    }
  }, [closeRenameFolderDialog, folders, renameFolderDraft, renameFolderTarget]);

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
      setTripLibrary((items) =>
        items.map((item) =>
          item.folderId === folder.id ? { ...item, folderId: null, folderName: null } : item,
        ),
      );
      if (currentFolderId === folder.id) {
        setCurrentFolderId(null);
      }
      setDeleteFolderTarget(null);
    } catch (error) {
      setFolderError(error instanceof Error ? error.message : t.itineraryPage.deleteFolderFailed);
    } finally {
      setFolderDialogSaving(false);
    }
  }, [currentFolderId, deleteFolderTarget]);

  const handleCreateFolder = useCallback(async () => {
    if (!requireAuthenticated("/itinerary")) {
      return;
    }
    const name = newFolderName.trim();
    if (!name) {
      return;
    }
    if (isFolderNameDuplicate(folders, name)) {
      setFolderError(t.itineraryPage.folderNameDuplicate);
      return;
    }
    setFolderError(null);
    try {
      const created = await createItineraryFolder({ name });
      setFolders((items) => [...items, created]);
      setNewFolderName("");
      setFolderFormOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.toLowerCase().includes("already exists")) {
        setFolderError(t.itineraryPage.folderNameDuplicate);
        return;
      }
      setFolderError(message.trim() || "無法建立資料夾。");
    }
  }, [folders, newFolderName, requireAuthenticated]);

  const handleMoveTripToFolder = useCallback(
    async (targetTripId: string, folderId: string | null) => {
      if (!requireAuthenticated("/itinerary")) {
        return;
      }
      const trip = tripLibrary.find((item) => item.id === targetTripId);
      if (!trip || trip.isOwner === false) {
        return;
      }
      const folderName = folderId
        ? folders.find((folder) => folder.id === folderId)?.name ?? null
        : null;
      const previousLibrary = tripLibrary;
      const previousCurrentFolderId = currentFolderId;

      setTripLibrary((items) =>
        items.map((item) =>
          item.id === targetTripId ? { ...item, folderId, folderName } : item,
        ),
      );
      if (targetTripId === tripId) {
        setCurrentFolderId(folderId);
      }
      setFolderError(null);
      try {
        await moveTripToFolder(targetTripId, folderId);
      } catch (error) {
        setTripLibrary(previousLibrary);
        if (targetTripId === tripId) {
          setCurrentFolderId(previousCurrentFolderId);
        }
        setFolderError(
          error instanceof Error ? error.message : t.itineraryPage.landingMoveTripFailed,
        );
        void loadTripLibrary();
      }
    },
    [currentFolderId, folders, loadTripLibrary, requireAuthenticated, tripId, tripLibrary],
  );

  const handleMoveCurrentTripToFolder = useCallback(
    async (folderId: string | null) => {
      if (!tripId) {
        return;
      }
      await handleMoveTripToFolder(tripId, folderId);
    },
    [handleMoveTripToFolder, tripId],
  );

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

  const handleConfirmPublish = useCallback(async () => {
    if (!tripId || !requireAuthenticated("/itinerary")) {
      return;
    }
    setIsPublishingPublication(true);
    try {
      const result = await publishTrip(tripId);
      setPublicationStatus({
        published: true,
        publicationId: result.publicationId,
        publishedAt: result.publishedAt,
      });
      setPublishOpen(false);
      pushToast({
        variant: "success",
        title: t.itineraryPage.publishSuccessTitle,
        description: t.itineraryPage.publishSuccessDesc,
      });
    } catch (error) {
      pushToast({
        variant: "error",
        title: t.itineraryPage.publishFailedTitle,
        description: error instanceof Error ? error.message : t.itineraryPage.publishFailedTitle,
      });
    } finally {
      setIsPublishingPublication(false);
    }
  }, [pushToast, requireAuthenticated, tripId]);

  const handleUnpublish = useCallback(async () => {
    if (!tripId || !requireAuthenticated("/itinerary")) {
      return;
    }
    setIsPublishingPublication(true);
    try {
      await unpublishTrip(tripId);
      setPublicationStatus({ published: false });
      pushToast({
        variant: "success",
        title: t.itineraryPage.unpublishSuccessTitle,
      });
    } catch (error) {
      pushToast({
        variant: "error",
        title: t.itineraryPage.unpublishFailedTitle,
        description: error instanceof Error ? error.message : t.itineraryPage.unpublishFailedTitle,
      });
    } finally {
      setIsPublishingPublication(false);
    }
  }, [pushToast, requireAuthenticated, tripId]);

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

  const landingGroups = useMemo(
    () => groupItinerariesForLanding(visibleItineraries, folders),
    [folders, visibleItineraries],
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
  const isTripOwner = !isCurrentTripShared;
  const canPublishTrip =
    isTripOwner &&
    itinerary.length > 0 &&
    itinerary.some((day) => day.items.length > 0);
  const emptyTripLibraryHint =
    !deferredItinerarySearch.trim() && tripLibrary.length === 0
      ? t.itineraryPage.noOwnedTripsInLibrary
      : t.itineraryPage.emptyLibrary;

  useEffect(() => {
    if (!tripId || status !== "authenticated" || !isTripOwner) {
      setPublicationStatus({ published: false });
      return;
    }
    let cancelled = false;
    void getTripPublicationStatus(tripId)
      .then((next) => {
        if (!cancelled) {
          setPublicationStatus(next);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPublicationStatus({ published: false });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isTripOwner, status, tripId]);

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
    if (tripId) {
      setShowEditor(true);
    }
  }, [tripId]);

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
          <m.div
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
              <ItineraryLandingFolderView
                unfiled={landingGroups.unfiled}
                folderGroups={landingGroups.folderGroups}
                folders={folders}
                dragEnabled={status === "authenticated" && scopeTab === "myTrips"}
                folderFormOpen={folderFormOpen}
                newFolderName={newFolderName}
                onToggleFolderForm={() => setFolderFormOpen((value) => !value)}
                onNewFolderNameChange={setNewFolderName}
                onCreateFolder={() => void handleCreateFolder()}
                onRenameFolder={(folder) => {
                  setRenameFolderTarget(folder);
                  setRenameFolderDraft(folder.name);
                }}
                onDeleteFolder={setDeleteFolderTarget}
                onMoveTripToFolder={(targetTripId, folderId) =>
                  void handleMoveTripToFolder(targetTripId, folderId)
                }
                disabled={tripSwitching || tripDeletingId !== null}
                tripDuplicatingId={tripDuplicatingId}
                onSelectTrip={(selected) => void handleSelectTripFromLibrary(selected)}
                onEdit={handleEditTripFromLibrary}
                onDuplicate={(selected) => void handleDuplicateTrip(selected)}
                onDelete={handleRequestDeleteTrip}
              />
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
                    <m.div
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
                    </m.div>

                    <m.div
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
                    </m.div>
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

            <JoinTripDialog
              open={joinDialogOpen}
              joinCode={joinCode}
              joinLoading={joinLoading}
              onJoinCodeChange={setJoinCode}
              onClose={() => {
                setJoinDialogOpen(false);
                setJoinCode("");
              }}
              onJoin={() => void handleJoinCollab()}
            />
          </m.div>
        ) : (
          <m.div
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

              <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
                <ItineraryLibraryPanel
                  status={status}
                  activeTripId={tripId}
                  currentFolderId={currentFolderId}
                  scopeTab={scopeTab}
                  search={itinerarySearch}
                  sort={tripLibrarySort}
                  viewMode={libraryViewMode}
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
                  onScopeTabChange={setScopeTab}
                  onSearchChange={setItinerarySearch}
                  onSortChange={setTripLibrarySort}
                  onViewModeChange={setLibraryViewMode}
                  onToggleFolderForm={() => setFolderFormOpen((value) => !value)}
                  onNewFolderNameChange={setNewFolderName}
                  onCreateFolder={() => void handleCreateFolder()}
                  onRenameFolder={(folder) => {
                    setRenameFolderTarget(folder);
                    setRenameFolderDraft(folder.name);
                  }}
                  onDeleteFolder={setDeleteFolderTarget}
                  onMoveCurrentTripToFolder={(folderId) => void handleMoveCurrentTripToFolder(folderId)}
                  onMoveTripToFolder={(targetTripId, folderId) =>
                    void handleMoveTripToFolder(targetTripId, folderId)
                  }
                  onSelectTrip={(item) => void handleSelectTripFromLibrary(item)}
                  onEditTrip={handleEditTripFromLibrary}
                  onDuplicateTrip={(item) => void handleDuplicateTrip(item)}
                  onDeleteTrip={handleRequestDeleteTrip}
                />

                <div className="min-w-0 space-y-6">
                  <ItineraryPageHeader
                    title={title}
                    destination={destination}
                    days={days}
                    budget={budget}
                    coverImageUrl={coverImageUrl}
                    session={session}
                    isInteractive={isInteractive}
                    metaEditable={isInteractive && canEdit}
                    showTripSummaryRow={showTripSummaryRow}
                    onDaysCommit={handleDaysCommit}
                    onBudgetCommit={handleBudgetCommit}
                    onShare={() => setShareOpen(true)}
                    onOpenMap={() => router.push("/map")}
                    onPublish={
                      isTripOwner && status === "authenticated"
                        ? () => {
                            if (!canPublishTrip) {
                              pushToast({
                                variant: "info",
                                title: t.itineraryPage.publishFailedTitle,
                                description: t.itineraryPage.publishNotReadyHint,
                              });
                              return;
                            }
                            setPublishOpen(true);
                          }
                        : undefined
                    }
                    isPublished={publicationStatus.published}
                    isPublishing={isPublishingPublication}
                    canPublish={canPublishTrip}
                    onUnpublish={
                      isTripOwner && publicationStatus.published
                        ? () => void handleUnpublish()
                        : undefined
                    }
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
              </div>
            </div>
          </m.div>
        )}
      </AnimatePresence>

      <PublishItineraryDialog
        open={publishOpen}
        isPublished={publicationStatus.published}
        isPublishing={isPublishingPublication}
        onClose={() => setPublishOpen(false)}
        onConfirm={() => void handleConfirmPublish()}
      />

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

      <ConfirmDialog
        open={Boolean(deleteItemTarget)}
        title={t.itineraryPage.deleteItemDialogTitle}
        description={
          deleteItemTarget
            ? t.itineraryPage.deleteItemConfirm.replace("{name}", deleteItemTarget.title)
            : ""
        }
        confirmLabel={t.itineraryPage.deleteItemConfirmAction}
        cancelLabel={t.itineraryPage.deleteItemCancel}
        variant="danger"
        onCancel={() => setDeleteItemTarget(null)}
        onConfirm={handleConfirmDeleteItem}
      />

      <ConfirmDialog
        open={shrinkDaysTarget !== null}
        title={t.itineraryPage.shrinkDaysDialogTitle}
        description={shrinkDaysDialogDescription}
        confirmLabel={t.itineraryPage.shrinkDaysConfirmAction}
        cancelLabel={t.itineraryPage.shrinkDaysCancel}
        variant={shrinkDaysRemovesActivities ? "danger" : "primary"}
        onCancel={() => setShrinkDaysTarget(null)}
        onConfirm={() => void handleConfirmShrinkDays()}
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
