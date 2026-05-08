"use client";

import { useCallback, useDeferredValue, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarDays,
  Check,
  Clock,
  Copy,
  Folder,
  FolderPlus,
  GripVertical,
  ImagePlus,
  LayoutGrid,
  List,
  MapPin,
  MousePointer2,
  PencilLine,
  Plus,
  Search,
  Share2,
  Train,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  filterItineraries,
  sortItineraries,
  type ItineraryListItem,
  type ItinerarySortOption,
} from "@/lib/itinerary-sort";
import { canCollaborator } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { zhTW as t } from "@/locales/zh-TW";
import {
  addTripCollaborator,
  createItineraryFolder,
  deleteItineraryFolder,
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
import ItineraryCollaborationSidebar from "@/components/itinerary/ItineraryCollaborationSidebar";
import { useCollabStore } from "@/stores/useCollabStore";
import { withSyncMutationSource } from "@/stores/syncMutationSource";
import { useToastStore } from "@/stores/useToastStore";
import { useTripStore } from "@/stores/useTripStore";
import type { BootstrapPayload, TripPlanDay, TripPlanItem } from "@/types";

type TripLibrarySort = Extract<
  ItinerarySortOption,
  "updatedAt_desc" | "title_asc" | "createdAt_desc" | "days_asc"
>;

const typeColors: Record<TripPlanItem["type"], string> = {
  attraction: "border-l-primary",
  restaurant: "border-l-secondary",
  shopping: "border-l-peach",
  activity: "border-l-lavender",
  transport: "border-l-tertiary",
  hotel: "border-l-muted",
};

function typeLabel(itemType: TripPlanItem["type"]) {
  const labels: Record<TripPlanItem["type"], string> = {
    attraction: t.itineraryPanel.typeAttraction,
    restaurant: t.itineraryPanel.typeRestaurant,
    shopping: t.itineraryPanel.typeShopping,
    activity: t.itineraryPanel.typeActivity,
    transport: t.itineraryPanel.typeTransport,
    hotel: t.itineraryPanel.typeHotel,
  };
  return labels[itemType];
}

function presenceActionLabel(activeSection: string) {
  if (activeSection === "itinerary-editor" || activeSection === "itinerary") {
    return t.collab.presenceActionEditingItinerary;
  }
  return t.collab.presenceActionOther;
}

function roleLabel(role: "owner" | "editor" | "viewer") {
  if (role === "owner") {
    return t.itineraryPage.roleOwner;
  }
  if (role === "editor") {
    return t.itineraryPage.roleEditor;
  }
  return t.itineraryPage.roleViewer;
}

const MAX_COVER_DATA_URL_CHARS = 850_000;

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

const typeOptions: Array<{ value: TripPlanItem["type"]; label: string }> = [
  { value: "attraction", label: t.itineraryPanel.typeAttraction },
  { value: "restaurant", label: t.itineraryPanel.typeRestaurant },
  { value: "shopping", label: t.itineraryPanel.typeShopping },
  { value: "activity", label: t.itineraryPanel.typeActivity },
  { value: "transport", label: t.itineraryPanel.typeTransport },
  { value: "hotel", label: t.itineraryPanel.typeHotel },
];

function SortableActivityItem({
  item,
  dayNumber,
  itemIndex,
  itemsLength,
  removeItineraryItem,
  tone = "light",
}: {
  item: TripPlanItem;
  dayNumber: number;
  itemIndex: number;
  itemsLength: number;
  removeItineraryItem: (dayNumber: number, itemId: string) => void;
  tone?: "light" | "dark";
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 1,
    position: "relative" as const,
  };

  const colorClass = typeColors[item.type];
  const isDark = tone === "dark";

  return (
    <div
      ref={setNodeRef}
      data-testid="activity-card"
      style={style}
      className={cn(
        "flex items-start gap-3 px-4 py-3 rounded-xl border-l-4 transition-colors group",
        colorClass,
        isDark ? "bg-zinc-900/90 hover:bg-zinc-800/90 text-zinc-100 border-y border-r border-zinc-800" : "hover:bg-cream/40 bg-surface",
        isDragging &&
          (isDark
            ? "border border-primary/30 bg-zinc-800 opacity-90"
            : "shadow-soft-lg border border-primary/20 bg-cream/70 opacity-90"),
      )}
    >
      <div
        {...attributes}
        {...listeners}
        className={cn(
          "pt-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab focus:outline-none touch-none",
          isDark ? "hover:text-zinc-100" : "hover:text-primary",
        )}
      >
        <GripVertical className={cn("size-4", isDark ? "text-zinc-500" : "text-muted")} />
      </div>

      <div className="flex flex-col items-center gap-1 min-w-[50px]">
        <span
          className={cn(
            "text-xs font-mono font-semibold px-2 py-0.5 rounded-md",
            isDark ? "bg-zinc-800 text-orange-300" : "text-primary bg-primary/8",
          )}
        >
          {item.time}
        </span>
        {itemIndex < itemsLength - 1 && item.transport && (
          <div className={cn("mt-1 flex items-center gap-1 text-[10px]", isDark ? "text-zinc-500" : "text-muted")}>
            <Train className="size-3" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h3 className={cn("text-sm font-semibold", isDark ? "text-zinc-100" : "text-foreground")}>{item.title}</h3>
          <span
            className={cn(
              "text-[10px] px-1.5 py-0.5 rounded-full",
              isDark ? "bg-zinc-800 text-zinc-400" : "bg-border-light text-muted",
            )}
          >
            {typeLabel(item.type)}
          </span>
        </div>
        {item.transport && (
          <p className={cn("mb-1 flex items-center gap-1 text-xs", isDark ? "text-zinc-400" : "text-muted")}>
            <Train className="size-3" />
            {item.transport}
          </p>
        )}
        {item.notes && (
          <p className={cn("text-xs mb-1", isDark ? "text-zinc-500" : "text-muted")}>{item.notes}</p>
        )}
        {item.location && (
          <p
            className={cn(
              "mt-1 flex items-center gap-1 text-[11px]",
              isDark ? "text-orange-400/90" : "text-primary/70",
            )}
          >
            <MapPin className="size-3" />
            {item.location.name}
          </p>
        )}
      </div>

      <button
        type="button"
        data-testid="activity-delete-button"
        aria-label={`刪除活動 ${item.title}`}
        onClick={() => removeItineraryItem(dayNumber, item.id)}
        className={cn(
          "p-1.5 rounded-lg transition-colors cursor-pointer opacity-0 group-hover:opacity-100 relative z-20",
          isDark
            ? "text-zinc-500 hover:text-orange-400 hover:bg-zinc-800"
            : "text-muted hover:text-danger hover:bg-danger/10",
        )}
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

export default function ItineraryPage() {
  const router = useRouter();
  const { status, data: session } = useSession();
  const {
    itinerary,
    tripId,
    lastUpdatedAt,
    addDay,
    insertDayAfter,
    removeDay,
    addItineraryItem,
    removeItineraryItem,
    reorderItineraryItem,
  } = useTripStore();
  const { inviteCode, shareLink, roomId, presence } = useCollabStore();
  const [addingToDay, setAddingToDay] = useState<number | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newTime, setNewTime] = useState("10:00");
  const [newLocation, setNewLocation] = useState("");
  const [newType, setNewType] = useState<TripPlanItem["type"]>("attraction");
  const [newNotes, setNewNotes] = useState("");
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
  const pushToast = useToastStore((state) => state.pushToast);
  const itemIdCounter = useRef(0);
  const lastCursorSentAt = useRef(0);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

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

  function handleAddItem(dayNumber: number) {
    if (!requireAuthenticated(`/itinerary`)) {
      return;
    }
    if (!newTitle.trim()) {
      return;
    }
    itemIdCounter.current += 1;
    addItineraryItem(dayNumber, {
      id: `item_new_${dayNumber}_${itemIdCounter.current}`,
      dayNumber,
      time: newTime,
      title: newTitle.trim(),
      type: newType,
      notes: newNotes.trim() || undefined,
      location: newLocation.trim()
        ? {
            name: newLocation.trim(),
            lat: 0,
            lng: 0,
            description: newNotes.trim() || newLocation.trim(),
            address: newLocation.trim(),
          }
        : undefined,
      source: "manual",
    });
    setNewTitle("");
    setNewTime("10:00");
    setNewLocation("");
    setNewType("attraction");
    setNewNotes("");
    setAddingToDay(null);
  }

  function handleDragEnd(
    event: DragEndEvent,
    dayNumber: number,
    items: TripPlanItem[],
  ) {
    if (!requireAuthenticated("/itinerary")) {
      return;
    }
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);
      reorderItineraryItem(dayNumber, oldIndex, newIndex);
    }
  }

  function requireAuthenticated(redirectPath: string) {
    if (status === "authenticated") {
      return true;
    }
    router.push(`/login?redirect=${encodeURIComponent(redirectPath)}`);
    return false;
  }

  async function handleAddDay() {
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
  }

  async function handleLibraryEditCoverFiles(files: FileList | null) {
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
  }

  function clearLibraryEditCover() {
    setCoverImageHint(null);
    setRenameCoverUrl(null);
    if (libraryEditCoverInputRef.current) {
      libraryEditCoverInputRef.current.value = "";
    }
  }

  function handleRemoveDay(dayNumber: number, displayOrdinal?: number) {
    if (!requireAuthenticated("/itinerary")) {
      return;
    }
    if (itinerary.length <= 1) {
      return;
    }
    const ordinal = displayOrdinal ?? dayNumber;
    const message = t.itineraryPage.deleteDayConfirm.replace("{n}", String(ordinal));
    if (!window.confirm(message)) {
      return;
    }
    removeDay(dayNumber);
    setAddingToDay((current) => (current === dayNumber ? null : current));
  }

  async function refreshFolders() {
    if (status !== "authenticated") {
      return;
    }
    try {
      setFolderError(null);
      setFolders(await listItineraryFolders());
    } catch (error) {
      setFolderError(error instanceof Error ? error.message : "無法載入資料夾。");
    }
  }

  async function refreshCollaborators() {
    if (status !== "authenticated" || !tripId) {
      return;
    }
    try {
      setCollabError(null);
      setCollaborators(await listTripCollaborators(tripId));
    } catch (error) {
      setCollabError(error instanceof Error ? error.message : "無法載入協作者。");
    }
  }

  async function refreshCollaboratorsForTrip(id: string) {
    if (status !== "authenticated" || !id) {
      return;
    }
    try {
      setCollabError(null);
      setCollaborators(await listTripCollaborators(id));
    } catch (error) {
      setCollabError(error instanceof Error ? error.message : "無法載入協作者。");
    }
  }

  async function loadTripLibrary() {
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
  }

  useEffect(() => {
    void refreshFolders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    void loadTripLibrary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, libraryScopeTab]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareOpen, tripId]);

  useEffect(() => {
    if (status === "authenticated" && tripId) {
      void refreshCollaborators();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  useEffect(() => {
    if (status !== "authenticated" || !lastUpdatedAt) {
      return;
    }
    const timer = window.setTimeout(() => void loadTripLibrary(), 800);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastUpdatedAt, status]);

  async function handleCreateFolder() {
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
  }

  async function handleRenameFolder(folder: ItineraryFolderDto) {
    const name = window.prompt("重新命名資料夾", folder.name)?.trim();
    if (!name || name === folder.name) {
      return;
    }
    const updated = await updateItineraryFolder(folder.id, { name });
    setFolders((items) => items.map((item) => (item.id === updated.id ? updated : item)));
    void loadTripLibrary();
  }

  async function handleDeleteFolder(folder: ItineraryFolderDto) {
    if (!window.confirm(`刪除「${folder.name}」？行程會移出資料夾，不會被刪除。`)) {
      return;
    }
    await deleteItineraryFolder(folder.id);
    setFolders((items) => items.filter((item) => item.id !== folder.id));
    if (currentFolderId === folder.id) {
      setCurrentFolderId(null);
    }
    void loadTripLibrary();
  }

  async function handleAddCollaborator() {
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
  }

  function handleRemoveItem(dayNumber: number, itemId: string) {
    if (!requireAuthenticated("/itinerary")) {
      return;
    }
    removeItineraryItem(dayNumber, itemId);
  }

  async function handleSelectTripFromLibrary(item: ItineraryListItem) {
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
  }

  async function handleDuplicateTrip(item: ItineraryListItem) {
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
  }

  async function handleSaveLibraryRename() {
    if (!renameTarget || !requireAuthenticated("/itinerary")) {
      return;
    }
    setLibraryError(null);
    setRenameSaving(true);
    try {
      const { title, coverImageUrl: savedCover } = await patchTripDetails(renameTarget.id, {
        title: renameDraft,
        coverImageUrl: renameCoverUrl,
      });
      const nextTitle = title.trim();
      const nextCover = savedCover;
      if (useTripStore.getState().tripId === renameTarget.id) {
        withSyncMutationSource("bootstrap", () => {
          useTripStore.setState({ title: nextTitle, coverImageUrl: nextCover });
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
  }

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

  async function handleDeleteTrip(item: ItineraryListItem) {
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
  }

  const visibleItineraries = sortItineraries(
    filterItineraries(tripLibrary, deferredItinerarySearch),
    tripLibrarySort,
  );
  const myId = session?.user?.id;
  const othersEditorPresence =
    libraryScopeTab === "sharedTrips"
      ? presence.filter(
          (entry) =>
            entry.userId !== myId &&
            (entry.activeSection === "itinerary-editor" || entry.activeSection === "itinerary"),
        )
      : [];
  const currentRole =
    collaborators.find((member) => member.userId === myId)?.role ||
    (status === "authenticated" ? "owner" : "viewer");
  const canManageShare = canCollaborator(currentRole, "managePermissions");
  const emptyTripLibraryHint =
    libraryScopeTab === "myTrips" &&
    !deferredItinerarySearch.trim() &&
    tripLibrary.length === 0
      ? t.itineraryPage.noOwnedTripsInLibrary
      : libraryScopeTab === "sharedTrips" &&
          !deferredItinerarySearch.trim() &&
          tripLibrary.length === 0
        ? t.itineraryPage.emptySharedTrips
        : t.itineraryPage.emptyLibrary;

  useEffect(() => {
    setIsInteractive(true);
  }, []);

  useEffect(() => {
    if (!renameTarget) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeRenameDialog();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [renameTarget, closeRenameDialog]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
              <CalendarDays className="size-7 text-primary" />
              {t.itineraryPage.title}
            </h1>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShareOpen(true)}
                disabled={!isInteractive}
                data-testid="share-collaboration-button"
                className="flex items-center gap-2 rounded-xl border border-border-light bg-surface px-4 py-2 text-sm font-medium text-foreground shadow-soft transition-colors hover:bg-cream/60 disabled:cursor-wait disabled:opacity-60"
              >
                <Share2 className="size-4 text-primary" />
                {t.itineraryPage.share}
              </button>
              <button
                type="button"
                onClick={() => router.push("/map")}
                className="flex items-center gap-2 rounded-xl border border-border-light bg-surface px-4 py-2 text-sm font-medium text-foreground shadow-soft transition-colors hover:bg-cream/60"
              >
                <MapPin className="size-4 text-secondary" />
                {t.itineraryPage.workflowMap}
              </button>
              {status === "authenticated" && session?.user && (
                <div className="shrink-0" title={session.user.email || undefined}>
                  {session.user.image ? (
                    // eslint-disable-next-line @next/next/no-img-element -- OAuth 頭像為外部 URL
                    <img
                      src={session.user.image}
                      alt=""
                      width={36}
                      height={36}
                      className="size-9 rounded-full border border-border object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div
                      className="flex size-9 items-center justify-center rounded-full border border-border bg-surface text-xs font-medium text-primary shadow-soft"
                      aria-label={t.itineraryPage.userAvatarAria}
                    >
                      {(session.user.name || session.user.email || "?").slice(0, 1).toUpperCase()}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </motion.div>

        <div className="mb-8 flex min-w-0 flex-wrap items-end justify-between gap-2 border-b border-border-light text-sm font-semibold">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setLibraryScopeTab("myTrips")}
              className={cn(
                "-mb-px shrink-0 border-b-2 px-3 pb-4 transition-colors",
                libraryScopeTab === "myTrips"
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted hover:text-foreground",
              )}
            >
              {t.itineraryPage.tabMyTrips}
            </button>
            <button
              type="button"
              onClick={() => setLibraryScopeTab("sharedTrips")}
              className={cn(
                "-mb-px shrink-0 border-b-2 px-3 pb-4 transition-colors",
                libraryScopeTab === "sharedTrips"
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted hover:text-foreground",
              )}
            >
              {t.itineraryPage.tabSharedTrips}
            </button>
          </div>
          <div className="flex min-w-0 flex-nowrap items-center gap-2 overflow-x-auto pb-4 font-normal">
            <div className="flex min-h-[42px] min-w-0 flex-1 items-center gap-2 rounded-lg border border-border-light bg-surface px-3 py-3 shadow-soft max-sm:min-w-[min(100%,12rem)] sm:max-w-md">
              <Search className="size-4 shrink-0 text-muted-light" />
              <input
                value={itinerarySearch}
                onChange={(event) => setItinerarySearch(event.target.value)}
                placeholder={t.itineraryPage.searchFolders}
                className="min-w-0 flex-1 bg-transparent text-xs font-normal text-foreground placeholder:text-muted-light focus:outline-none"
              />
            </div>
          </div>
        </div>

        <section>
          <div className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 lg:flex-1">
              <h2 className="text-lg font-semibold text-foreground">
                {libraryScopeTab === "myTrips"
                  ? t.itineraryPage.folderLibraryTitleMine
                  : t.itineraryPage.folderLibraryTitleShared}
              </h2>
              <p className="mt-1 text-sm text-muted">
                {libraryScopeTab === "myTrips"
                  ? t.itineraryPage.folderLibrarySubtitleMine
                  : t.itineraryPage.folderLibrarySubtitleShared}
              </p>
            </div>
            <div className="flex w-full flex-col gap-2 lg:max-w-md lg:shrink-0">
              <div className="flex w-full flex-wrap items-center gap-2">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  {status === "authenticated" && (
                    <>
                      <label htmlFor="trip-library-sort" className="sr-only">
                        {t.itineraryPage.librarySortSelectAria}
                      </label>
                      <select
                        id="trip-library-sort"
                        data-testid="trip-library-sort"
                        value={tripLibrarySort}
                        onChange={(event) => setTripLibrarySort(event.target.value as TripLibrarySort)}
                        className="min-h-[42px] shrink-0 rounded-xl border border-border-light bg-surface px-3 py-2 text-xs font-medium text-foreground shadow-soft"
                      >
                        <option value="updatedAt_desc">{t.itineraryPage.librarySortByTime}</option>
                        <option value="title_asc">{t.itineraryPage.librarySortByTitle}</option>
                        <option value="createdAt_desc">{t.itineraryPage.librarySortByCreated}</option>
                        <option value="days_asc">{t.itineraryPage.librarySortByTripDays}</option>
                      </select>
                    </>
                  )}
                  {libraryScopeTab === "myTrips" && (
                    <button
                      type="button"
                      onClick={() => setFolderFormOpen((open) => !open)}
                      className="flex shrink-0 items-center justify-center gap-2 rounded-lg border border-border-light bg-surface px-3 py-2 text-xs font-medium text-foreground shadow-soft hover:bg-cream/60"
                    >
                      <FolderPlus className="size-4" />
                      {t.itineraryPage.createFolder}
                    </button>
                  )}
                  {status === "authenticated" && canCollaborator(currentRole, "edit") && (
                    <button
                      type="button"
                      data-testid="add-day-button"
                      onClick={handleAddDay}
                      disabled={recoveringTrip}
                      className="flex shrink-0 items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-white shadow-soft transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Plus className="size-4" />
                      {recoveringTrip ? t.itineraryPage.recoverTripLoading : t.itineraryPage.addDay}
                    </button>
                  )}
                </div>
                <div className="ml-auto flex shrink-0 items-center gap-1 rounded-full border border-border-light bg-surface p-1 shadow-soft">
                  <button
                    type="button"
                    aria-label={t.itineraryPage.viewGrid}
                    onClick={() => setFolderViewMode("grid")}
                    className={cn(
                      "rounded-full p-2 transition-colors",
                      folderViewMode === "grid" ? "bg-foreground text-white" : "text-muted hover:text-foreground",
                    )}
                  >
                    <LayoutGrid className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={t.itineraryPage.viewList}
                    onClick={() => setFolderViewMode("list")}
                    className={cn(
                      "rounded-full p-2 transition-colors",
                      folderViewMode === "list" ? "bg-foreground text-white" : "text-muted hover:text-foreground",
                    )}
                  >
                    <List className="size-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {(folderError || libraryError) && (
            <p className="mb-4 rounded-xl border border-danger/20 bg-danger/10 px-3 py-2 text-xs text-danger">
              {folderError || libraryError}
            </p>
          )}

          {tripSwitching && (
            <p className="mb-3 text-xs text-primary">{t.itineraryPage.switchingTrip}</p>
          )}

          {libraryScopeTab === "myTrips" && folderFormOpen && (
            <div className="mb-5 flex flex-wrap items-end gap-2 rounded-lg border border-border-light bg-surface p-3 shadow-soft">
              <input
                value={newFolderName}
                onChange={(event) => setNewFolderName(event.target.value)}
                placeholder={t.itineraryPage.folderNamePh}
                className="min-w-[12rem] flex-1 rounded-lg border border-border-light bg-cream/40 px-3 py-2 text-xs text-foreground"
              />
              <button
                type="button"
                onClick={() => void handleCreateFolder()}
                disabled={status !== "authenticated" || !newFolderName.trim()}
                className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
              >
                {t.itineraryPage.confirmCreateFolder}
              </button>
            </div>
          )}

          {libraryScopeTab === "myTrips" && folders.length > 0 && (
            <div className="mb-5 flex flex-wrap gap-2">
              {folders.map((folder) => (
                <div
                  key={folder.id}
                  className="inline-flex items-center gap-2 rounded-full border border-border-light bg-surface px-3 py-1.5 text-xs text-muted shadow-soft"
                >
                  <span>{folder.name}</span>
                  <button
                    type="button"
                    onClick={() => void handleRenameFolder(folder)}
                    className="text-primary hover:text-primary-dark"
                  >
                    {t.itineraryPage.renameFolder}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteFolder(folder)}
                    className="text-red-400 hover:text-red-300"
                  >
                    {t.itineraryPage.deleteFolder}
                  </button>
                </div>
              ))}
            </div>
          )}

          {libraryLoading && tripLibrary.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border-light bg-surface/60 px-4 py-12 text-center text-sm text-muted">
              {t.itineraryPage.libraryLoading}
            </div>
          ) : folderViewMode === "grid" ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visibleItineraries.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "group relative flex min-h-[212px] flex-col overflow-hidden rounded-lg border border-border-light bg-surface text-left shadow-soft transition-colors hover:border-primary/30 hover:bg-surface-hover",
                    (tripSwitching || tripDeletingId !== null) && "pointer-events-none opacity-50",
                  )}
                >
                  {status === "authenticated" && (
                    <div
                      className={cn(
                        "pointer-events-none absolute right-2 top-2 z-30 flex flex-col gap-1 opacity-0 transition-opacity duration-150",
                        "group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100",
                        (tripSwitching || tripDeletingId !== null) &&
                          "pointer-events-none opacity-0 group-hover:pointer-events-none group-hover:opacity-0 group-focus-within:pointer-events-none group-focus-within:opacity-0",
                      )}
                    >
                      <button
                        type="button"
                        disabled={tripSwitching || tripDeletingId !== null}
                        aria-label={
                          item.isOwner
                            ? t.itineraryPage.renameTripAria.replace("{title}", item.title)
                            : t.itineraryPage.editTripAria.replace("{title}", item.title)
                        }
                        title={item.isOwner ? t.itineraryPage.renameTrip : t.itineraryPage.editTrip}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          if (item.isOwner) {
                            setRenameTarget(item);
                            setRenameDraft(item.title);
                            setRenameCoverUrl(item.coverImageUrl ?? null);
                            setCoverImageHint(null);
                          } else {
                            void handleSelectTripFromLibrary(item);
                          }
                        }}
                        className="pointer-events-auto rounded-lg border border-border-light bg-surface/95 p-2 text-muted shadow-soft transition-colors hover:border-primary/35 hover:bg-cream/80 hover:text-primary disabled:pointer-events-none disabled:opacity-40"
                      >
                        <PencilLine className="size-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        data-testid={`library-duplicate-trip-${item.id}`}
                        disabled={
                          tripSwitching || tripDeletingId !== null || tripDuplicatingId === item.id
                        }
                        aria-label={t.itineraryPage.duplicateTripAria.replace("{title}", item.title)}
                        title={t.itineraryPage.duplicateTrip}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          void handleDuplicateTrip(item);
                        }}
                        className="pointer-events-auto rounded-lg border border-border-light bg-surface/95 p-2 text-muted shadow-soft transition-colors hover:border-secondary/40 hover:bg-cream/80 hover:text-secondary disabled:pointer-events-none disabled:opacity-40"
                      >
                        <Copy className="size-4" aria-hidden />
                      </button>
                      {item.isOwner && (
                        <button
                          type="button"
                          data-testid={`library-delete-trip-${item.id}`}
                          disabled={tripSwitching || tripDeletingId !== null}
                          aria-label={t.itineraryPage.deleteTripAria.replace("{title}", item.title)}
                          title={t.itineraryPage.deleteTrip}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            void handleDeleteTrip(item);
                          }}
                          className="pointer-events-auto rounded-lg border border-border-light bg-surface/95 p-2 text-muted shadow-soft transition-colors hover:border-danger/40 hover:bg-cream/80 hover:text-danger disabled:pointer-events-none disabled:opacity-40"
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </button>
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    disabled={tripSwitching || tripDeletingId !== null}
                    onClick={() => void handleSelectTripFromLibrary(item)}
                    className="flex min-h-0 flex-1 flex-col text-left"
                  >
                  <div className="relative h-[128px] w-full shrink-0 overflow-hidden bg-surface-elevated">
                    {item.coverImageUrl ? (
                      <Image
                        src={item.coverImageUrl}
                        alt=""
                        fill
                        className="object-cover"
                        unoptimized
                        sizes="(max-width: 768px) 100vw, 280px"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center py-6">
                        <Folder
                          className="size-16 text-border-strong transition-colors group-hover:text-primary"
                          strokeWidth={1.2}
                        />
                      </div>
                    )}
                  </div>
                  <div className="border-t border-border-light bg-surface p-4">
                    <p className="truncate text-sm font-semibold text-foreground">{item.title}</p>
                    <p className="mt-1 truncate text-xs font-semibold text-primary">
                      {item.isOwner === false ? `${t.itineraryPage.folderMetaCollaborative} · ` : ""}
                      {item.destination} · {t.itineraryPage.folderMetaDays.replace("{n}", String(item.days))}
                    </p>
                    <p className="mt-2 truncate text-[11px] text-muted">
                      {item.folderName || t.itineraryPage.unfiledFolder} · {t.itineraryPage.folderMetaUpdated}{" "}
                      {new Date(item.updatedAt).toLocaleDateString("zh-TW")}
                    </p>
                  </div>
                </button>
                </div>
              ))}
                  {visibleItineraries.length === 0 && (
                <div className="col-span-full rounded-2xl border border-dashed border-border-light bg-surface/60 px-4 py-12 text-center text-sm text-muted">
                  {emptyTripLibraryHint}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {visibleItineraries.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "group relative flex w-full items-stretch overflow-hidden rounded-xl border border-border-light bg-surface shadow-soft transition-colors hover:border-primary/30",
                    (tripSwitching || tripDeletingId !== null) && "pointer-events-none opacity-50",
                  )}
                >
                  <button
                    type="button"
                    disabled={tripSwitching || tripDeletingId !== null}
                    onClick={() => void handleSelectTripFromLibrary(item)}
                    className="flex min-w-0 flex-1 items-center gap-4 px-4 py-3 text-left"
                  >
                    <Folder className="size-8 shrink-0 text-border-strong" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                      <p className="truncate text-xs text-primary">
                        {item.isOwner === false ? `${t.itineraryPage.folderMetaCollaborative} · ` : ""}
                        {item.destination} · {t.itineraryPage.folderMetaDays.replace("{n}", String(item.days))}
                      </p>
                    </div>
                    <span className="hidden shrink-0 text-[11px] text-muted sm:inline">
                      {new Date(item.updatedAt).toLocaleDateString("zh-TW")}
                    </span>
                  </button>
                  {status === "authenticated" && (
                    <div
                      className={cn(
                        "pointer-events-none absolute inset-y-0 right-0 z-20 flex items-center gap-0.5 border-l border-border-light bg-surface/98 px-1.5 shadow-md backdrop-blur-sm sm:gap-1 sm:px-2",
                        "translate-x-full transition-transform duration-200 ease-out",
                        "group-hover:pointer-events-auto group-hover:translate-x-0 group-focus-within:pointer-events-auto group-focus-within:translate-x-0",
                        (tripSwitching || tripDeletingId !== null) &&
                          "pointer-events-none translate-x-full group-hover:translate-x-full group-focus-within:translate-x-full",
                      )}
                    >
                      <button
                        type="button"
                        disabled={tripSwitching || tripDeletingId !== null}
                        aria-label={
                          item.isOwner
                            ? t.itineraryPage.renameTripAria.replace("{title}", item.title)
                            : t.itineraryPage.editTripAria.replace("{title}", item.title)
                        }
                        title={item.isOwner ? t.itineraryPage.renameTrip : t.itineraryPage.editTrip}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          if (item.isOwner) {
                            setRenameTarget(item);
                            setRenameDraft(item.title);
                            setRenameCoverUrl(item.coverImageUrl ?? null);
                            setCoverImageHint(null);
                          } else {
                            void handleSelectTripFromLibrary(item);
                          }
                        }}
                        className="pointer-events-auto rounded-lg p-2 text-muted transition-colors hover:bg-cream/70 hover:text-primary disabled:pointer-events-none disabled:opacity-40"
                      >
                        <PencilLine className="size-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        data-testid={`library-duplicate-trip-${item.id}`}
                        disabled={
                          tripSwitching || tripDeletingId !== null || tripDuplicatingId === item.id
                        }
                        aria-label={t.itineraryPage.duplicateTripAria.replace("{title}", item.title)}
                        title={t.itineraryPage.duplicateTrip}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          void handleDuplicateTrip(item);
                        }}
                        className="pointer-events-auto rounded-lg p-2 text-muted transition-colors hover:bg-cream/70 hover:text-secondary disabled:pointer-events-none disabled:opacity-40"
                      >
                        <Copy className="size-4" aria-hidden />
                      </button>
                      {item.isOwner && (
                        <button
                          type="button"
                          data-testid={`library-delete-trip-${item.id}`}
                          disabled={tripSwitching || tripDeletingId !== null}
                          aria-label={t.itineraryPage.deleteTripAria.replace("{title}", item.title)}
                          title={t.itineraryPage.deleteTrip}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            void handleDeleteTrip(item);
                          }}
                          className="pointer-events-auto rounded-lg p-2 text-muted transition-colors hover:bg-cream/70 hover:text-danger disabled:pointer-events-none disabled:opacity-40"
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {visibleItineraries.length === 0 && (
                <div className="rounded-xl border border-dashed border-border-light bg-surface/60 px-4 py-10 text-center text-sm text-muted">
                  {emptyTripLibraryHint}
                </div>
              )}
            </div>
          )}
        </section>

        <div
          className={cn(
            "mt-10 grid items-start gap-8",
            libraryScopeTab === "sharedTrips" && "lg:grid-cols-[minmax(0,1fr)_320px]",
          )}
        >
          <div
            className="relative min-w-0 space-y-8"
            onMouseMove={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              sendSharedTripCursor(event.clientX, event.clientY, rect);
            }}
          >
            {libraryScopeTab === "sharedTrips" && othersEditorPresence.length > 0 && (
              <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden>
                {othersEditorPresence.map((entry) => (
                  <div
                    key={entry.userId}
                    className="pointer-events-none absolute z-10"
                    style={{
                      left: `${entry.cursorPosition.x}%`,
                      top: `${entry.cursorPosition.y}%`,
                      transform: "translate(-4px, -4px)",
                    }}
                  >
                    <MousePointer2 className="size-4 -rotate-12" style={{ color: entry.color }} fill={entry.color} />
                    <span
                      className="absolute left-4 top-3 max-w-[min(280px,48vw)] whitespace-normal rounded-md px-2 py-0.5 text-[10px] font-medium leading-snug text-white"
                      style={{ backgroundColor: entry.color }}
                    >
                      {entry.userName} · {presenceActionLabel(entry.activeSection)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <h2 className="mb-3 text-lg font-semibold text-foreground">{t.itineraryPage.editorSectionTitle}</h2>
            <div id="itinerary-editor" className="flex flex-col gap-6">
        {status === "authenticated" && !tripId ? (
          <div className="space-y-3 py-2">
            <p className="text-base font-medium text-foreground">{t.itineraryPage.noActiveTripTitle}</p>
            <p className="text-sm text-muted">{t.itineraryPage.noActiveTripHint}</p>
            <button
              type="button"
              onClick={handleAddDay}
              disabled={!canCollaborator(currentRole, "edit") || recoveringTrip}
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="size-4" />
              {recoveringTrip ? t.itineraryPage.recoverTripLoading : t.itineraryPage.createTripStartButton}
            </button>
          </div>
        ) : (
          <>
        {itinerary.length === 0 && (
          <div className="space-y-3 py-2">
            <p className="text-base font-medium text-foreground">{t.itinerary.emptyTitle}</p>
            <p className="text-sm text-muted">{t.itinerary.emptyHint}</p>
            <p className="text-xs text-muted-light">{t.itineraryPage.emptyStateHint}</p>
            <button
              type="button"
              onClick={handleAddDay}
              disabled={status !== "authenticated" || !canCollaborator(currentRole, "edit") || recoveringTrip}
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="size-4" />
              {recoveringTrip ? t.itineraryPage.recoverTripLoading : t.itineraryPage.addDay}
            </button>
          </div>
        )}
        {itinerary.map((day: TripPlanDay, dayIndex) => {
          const displayOrdinal = dayIndex + 1;
          return (
          <motion.div
            key={day.dayNumber}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: dayIndex * 0.06 }}
            className="relative z-10 overflow-hidden rounded-2xl border border-border-light bg-surface shadow-soft"
          >
            <div className="group flex items-center justify-between border-b border-border-light bg-gradient-to-r from-primary/5 to-transparent px-6 py-4">
              <div className="flex items-center gap-4">
                <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-lg font-bold text-primary">
                  {t.itineraryPage.dayBadge.replace("{n}", String(displayOrdinal))}
                </div>
                <div>
                  <h2 className="font-semibold text-foreground">
                    {t.itineraryPage.dayHeading.replace("{n}", String(displayOrdinal))}
                  </h2>
                  {day.theme && !/^Day\s*\d+$/i.test(day.theme.trim()) ? (
                    <p className="mt-0.5 text-xs text-muted">{day.theme}</p>
                  ) : null}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="rounded-full bg-cream px-2.5 py-1 text-xs text-muted">
                  {day.items.length}
                  {t.itineraryPage.stops}
                </span>
                {canCollaborator(currentRole, "edit") && itinerary.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveDay(day.dayNumber, displayOrdinal)}
                    aria-label={t.itineraryPage.deleteDayAria.replace("{n}", String(displayOrdinal))}
                    title={t.itineraryPage.deleteDay}
                    className="pointer-events-none rounded-lg border border-border-light bg-surface p-2 text-muted opacity-0 transition-opacity duration-150 hover:border-danger/40 hover:text-danger focus-visible:pointer-events-auto focus-visible:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                )}
              </div>
            </div>

            <div className="relative flex flex-col gap-2 p-4">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={(event) => handleDragEnd(event, day.dayNumber, day.items)}
              >
                <SortableContext
                  items={day.items.map((item) => item.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="flex flex-col gap-2">
                    {day.items.map((item, index) => (
                      <SortableActivityItem
                        key={item.id}
                        item={item}
                        dayNumber={day.dayNumber}
                        itemIndex={index}
                        itemsLength={day.items.length}
                        removeItineraryItem={handleRemoveItem}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>

              <AnimatePresence>
                {addingToDay === day.dayNumber && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden mt-1"
                  >
                    <div className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
                      <div className="flex items-center justify-between">
                        <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                          <Plus className="size-4 text-primary" />
                          {t.itineraryPage.addBlockTitle}
                        </h4>
                        <button
                          type="button"
                          onClick={() => setAddingToDay(null)}
                          className="cursor-pointer rounded-lg p-1 text-muted transition-colors hover:bg-border-light hover:text-foreground"
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <label className="col-span-2 text-xs font-medium text-muted">
                          {t.itineraryPage.activityTitle}
                          <input
                            data-testid="activity-title-input"
                            value={newTitle}
                            onChange={(event) => setNewTitle(event.target.value)}
                            placeholder={t.itineraryPage.activityTitlePh}
                            className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-light focus:outline-none focus:ring-2 focus:ring-primary/30"
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                handleAddItem(day.dayNumber);
                              }
                            }}
                            autoFocus
                          />
                        </label>
                        <label className="text-xs font-medium text-muted">
                          {t.itineraryPage.activityTime}
                          <div className="mt-1 flex items-center gap-2">
                            <Clock className="size-4 text-muted" />
                            <input
                              data-testid="activity-time-input"
                              type="time"
                              value={newTime}
                              onChange={(event) => setNewTime(event.target.value)}
                              className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                            />
                          </div>
                        </label>
                        <label className="text-xs font-medium text-muted">
                          {t.itineraryPage.activityType}
                          <select
                            value={newType}
                            onChange={(event) =>
                              setNewType(event.target.value as TripPlanItem["type"])
                            }
                            className="mt-1 w-full cursor-pointer rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                          >
                            {typeOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <label className="text-xs font-medium text-muted">
                        {t.itineraryPage.activityLocation}
                        <input
                          data-testid="activity-location-input"
                          value={newLocation}
                          onChange={(event) => setNewLocation(event.target.value)}
                          placeholder={t.itineraryPage.activityLocationPh}
                          className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-light focus:outline-none focus:ring-2 focus:ring-primary/30"
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              handleAddItem(day.dayNumber);
                            }
                          }}
                        />
                      </label>
                      <label className="text-xs font-medium text-muted">
                        {t.itineraryPage.notesPh}
                        <input
                          data-testid="activity-notes-input"
                          value={newNotes}
                          onChange={(event) => setNewNotes(event.target.value)}
                          placeholder={t.itineraryPage.notesPh}
                          className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-light focus:outline-none focus:ring-2 focus:ring-primary/30"
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              handleAddItem(day.dayNumber);
                            }
                          }}
                        />
                      </label>
                      <button
                        data-testid="activity-save-button"
                        onClick={() => handleAddItem(day.dayNumber)}
                        disabled={!newTitle.trim()}
                        className="flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Check className="size-4" />
                        {t.itineraryPage.saveItem}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {addingToDay !== day.dayNumber && canCollaborator(currentRole, "edit") && (
                <div className="relative mt-1 h-11 overflow-hidden rounded-xl border border-dashed border-border text-muted transition-colors hover:border-primary/40">
                  <button
                    type="button"
                    data-testid="strip-add-day-button"
                    aria-label={t.itineraryPage.stripSplitAddDayHover}
                    title={t.itineraryPage.stripSplitAddDayHover}
                    onClick={() => {
                      if (!requireAuthenticated("/itinerary")) {
                        return;
                      }
                      insertDayAfter(day.dayNumber);
                    }}
                    className="absolute inset-y-0 left-0 z-10 flex w-1/2 items-center justify-center bg-transparent text-xs font-medium text-transparent transition-colors hover:bg-primary/5 hover:text-primary focus-visible:bg-primary/5 focus-visible:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
                  >
                    <span className="pointer-events-none px-2 text-center">
                      {t.itineraryPage.stripSplitAddDayHover}
                    </span>
                  </button>
                  <button
                    type="button"
                    data-testid="add-activity-button"
                    aria-label={t.itineraryPage.stripSplitAddActivityHover}
                    title={t.itineraryPage.stripSplitAddActivityHover}
                    onClick={() => {
                      if (!requireAuthenticated("/itinerary")) {
                        return;
                      }
                      setAddingToDay(day.dayNumber);
                      setNewTitle("");
                      setNewLocation("");
                      setNewNotes("");
                    }}
                    className="absolute inset-y-0 right-0 z-10 flex w-1/2 items-center justify-center bg-transparent text-xs font-medium text-transparent transition-colors hover:bg-primary/5 hover:text-primary focus-visible:bg-primary/5 focus-visible:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
                  >
                    <span className="pointer-events-none px-2 text-center">
                      {t.itineraryPage.stripSplitAddActivityHover}
                    </span>
                  </button>
                  <div
                    className="pointer-events-none absolute inset-0 flex items-center justify-center text-muted"
                    aria-hidden
                  >
                    <Plus className="size-4" />
                  </div>
                </div>
              )}
            </div>
          </motion.div>
          );
        })}
          </>
        )}
            </div>
          </div>

          {libraryScopeTab === "sharedTrips" && (
            <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
              <ItineraryCollaborationSidebar />
            </aside>
          )}
        </div>
      </div>

      <AnimatePresence>
        {shareOpen && (
          <motion.div
            data-testid="share-collaboration-dialog"
            className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-soft-lg" initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }}>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="flex items-center gap-2 font-semibold text-foreground">
                  <Users className="size-4 text-primary" />
                  {t.itineraryPage.shareDialogTitle}
                </h2>
                <button type="button" onClick={() => setShareOpen(false)} className="rounded-lg p-1 text-muted hover:bg-border-light">
                  <X className="size-4" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-xs text-muted">{t.itineraryPage.shareLinkLabel}</p>
                  <div className="rounded-xl border border-border bg-cream/40 px-3 py-2 text-xs text-muted">
                    {shareLink ||
                      (inviteCode ? `/itinerary?invite=${inviteCode}` : t.itineraryPage.noShareLink)}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs text-muted">{t.itineraryPage.inviteCodeLabel}</p>
                  <div className="rounded-xl border border-border bg-cream/40 px-3 py-2 font-mono text-sm">
                    {inviteCode || t.itineraryPage.noInviteCode}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs text-muted">{t.itineraryPage.collaboratorsLabel}</p>
                  <div className="space-y-2">
                    {collaborators.length ? collaborators.map((member) => (
                      <div key={member.userId} className="flex items-center justify-between gap-3 rounded-xl bg-primary/5 px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm text-foreground">{member.user.name || member.user.email}</p>
                          <p className="truncate text-[11px] text-muted">{member.user.email}</p>
                        </div>
                        {canManageShare && member.role !== "owner" ? (
                          <div className="flex items-center gap-2">
                            <select
                              value={member.role}
                              onChange={(event) =>
                                void updateTripCollaboratorRole(
                                  member.tripId,
                                  member.userId,
                                  event.target.value as "editor" | "viewer",
                                ).then((updated) =>
                                  setCollaborators((items) =>
                                    items.map((item) => (item.userId === updated.userId ? updated : item)),
                                  ),
                                )
                              }
                              className="rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                            >
                              <option value="editor">{t.itineraryPage.roleEditor}</option>
                              <option value="viewer">{t.itineraryPage.roleViewer}</option>
                            </select>
                            <button
                              type="button"
                              onClick={() =>
                                void removeTripCollaborator(member.tripId, member.userId).then(() =>
                                  setCollaborators((items) =>
                                    items.filter((item) => item.userId !== member.userId),
                                  ),
                                )
                              }
                              className="text-xs text-danger"
                            >
                              {t.itineraryPage.removeCollaborator}
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted">{roleLabel(member.role)}</span>
                        )}
                      </div>
                    )) : (
                      <p className="rounded-xl border border-dashed border-border-light px-3 py-4 text-center text-sm text-muted">
                        {t.itineraryPage.noCollaborators}
                      </p>
                    )}
                  </div>
                </div>
                {canManageShare && (
                  <div className="mt-2 space-y-2">
                    <p className="text-xs text-muted">{t.itineraryPage.inviteUser}</p>
                    <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                      <input
                        value={collabEmail}
                        onChange={(event) => setCollabEmail(event.target.value)}
                        placeholder={t.itineraryPage.inviteEmailPh}
                        className="rounded-lg border border-border bg-surface px-3 py-2 text-xs"
                      />
                      <select
                        value={collabRole}
                        onChange={(event) => setCollabRole(event.target.value as "editor" | "viewer")}
                        className="rounded-lg border border-border bg-surface px-3 py-2 text-xs"
                      >
                        <option value="editor">{t.itineraryPage.roleEditor}</option>
                        <option value="viewer">{t.itineraryPage.roleViewer}</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => void handleAddCollaborator()}
                        disabled={!collabEmail.trim()}
                        className="rounded-lg bg-primary px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
                      >
                        {t.itineraryPage.invite}
                      </button>
                    </div>
                    {collabError && <p className="mt-2 text-xs text-danger">{collabError}</p>}
                  </div>
                )}
                <div className="rounded-xl bg-cream/40 px-3 py-3 text-xs text-muted">
                  {canManageShare
                    ? t.itineraryPage.shareOwnerHint
                    : t.itineraryPage.shareLimitedHint}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {renameTarget && (
          <motion.div
            data-testid="library-rename-trip-dialog"
            role="presentation"
            className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/20 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !renameSaving && closeRenameDialog()}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="library-rename-trip-heading"
              className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-soft-lg"
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 id="library-rename-trip-heading" className="font-semibold text-foreground">
                  {t.itineraryPage.renameTripDialogTitle}
                </h2>
                <button
                  type="button"
                  disabled={renameSaving}
                  onClick={() => closeRenameDialog()}
                  className="rounded-lg p-1 text-muted hover:bg-border-light disabled:opacity-50"
                  aria-label={t.itineraryPage.renameTripCancel}
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleSaveLibraryRename();
                }}
              >
                <div>
                  <label htmlFor="library-rename-trip-input" className="mb-2 block text-xs text-muted">
                    {t.itineraryPage.renameTripLabel}
                  </label>
                  <input
                    id="library-rename-trip-input"
                    value={renameDraft}
                    onChange={(event) => setRenameDraft(event.target.value)}
                    placeholder={t.itineraryPage.renameTripPlaceholder}
                    disabled={renameSaving}
                    className="w-full rounded-xl border border-border-light bg-cream/40 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/40 disabled:opacity-60"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium text-muted">{t.itineraryPage.tripCoverLabel}</p>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="relative h-20 w-32 shrink-0 overflow-hidden rounded-lg border border-border-light bg-surface-elevated">
                      {renameCoverUrl ? (
                        <Image
                          src={renameCoverUrl}
                          alt={t.itineraryPage.tripCoverAlt}
                          fill
                          className="object-cover"
                          unoptimized
                          sizes="128px"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center px-1 text-center text-[10px] text-muted">
                          {t.itineraryPage.tripCoverChoose}
                        </div>
                      )}
                    </div>
                    <input
                      ref={libraryEditCoverInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => void handleLibraryEditCoverFiles(event.target.files)}
                    />
                    <button
                      type="button"
                      onClick={() => libraryEditCoverInputRef.current?.click()}
                      disabled={renameSaving}
                      className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground hover:bg-cream/50 disabled:opacity-50"
                    >
                      <ImagePlus className="size-4 shrink-0" aria-hidden />
                      {t.itineraryPage.tripCoverChoose}
                    </button>
                    {renameCoverUrl ? (
                      <button
                        type="button"
                        onClick={clearLibraryEditCover}
                        disabled={renameSaving}
                        className="text-xs font-medium text-danger hover:underline disabled:opacity-50"
                      >
                        {t.itineraryPage.tripCoverRemove}
                      </button>
                    ) : null}
                  </div>
                  {coverImageHint ? (
                    <p className="mt-2 text-xs text-danger">{coverImageHint}</p>
                  ) : null}
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={renameSaving}
                    onClick={() => closeRenameDialog()}
                    className="rounded-xl border border-border-light bg-surface px-4 py-2 text-xs font-medium text-muted hover:bg-cream/50 disabled:opacity-50"
                  >
                    {t.itineraryPage.renameTripCancel}
                  </button>
                  <button
                    type="submit"
                    disabled={renameSaving}
                    className="rounded-xl bg-primary px-4 py-2 text-xs font-medium text-white hover:bg-primary-dark disabled:opacity-50"
                  >
                    {t.itineraryPage.renameTripSave}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
