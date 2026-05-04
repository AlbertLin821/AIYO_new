"use client";

import { useDeferredValue, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarDays,
  Check,
  Clock,
  Folder,
  FolderPlus,
  GripVertical,
  LayoutGrid,
  List,
  MapPin,
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
  listItineraryFolders,
  listTripsForLibrary,
  listTripCollaborators,
  moveTripToFolder,
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
import { useTripStore } from "@/stores/useTripStore";
import type { TripPlanDay, TripPlanItem } from "@/types";

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
    destination,
    days,
    budget,
    lastUpdatedAt,
    addDay,
    addItineraryItem,
    removeItineraryItem,
    reorderItineraryItem,
  } = useTripStore();
  const { inviteCode, shareLink } = useCollabStore();
  const [addingToDay, setAddingToDay] = useState<number | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newTime, setNewTime] = useState("10:00");
  const [newLocation, setNewLocation] = useState("");
  const [newType, setNewType] = useState<TripPlanItem["type"]>("attraction");
  const [newNotes, setNewNotes] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [folderFormOpen, setFolderFormOpen] = useState(false);
  const [folderFilter, setFolderFilter] = useState<string>("all");
  const [sortOption, setSortOption] = useState<ItinerarySortOption>("updatedAt_desc");
  const [itinerarySearch, setItinerarySearch] = useState("");
  const deferredItinerarySearch = useDeferredValue(itinerarySearch);
  const [browseTab, setBrowseTab] = useState<"recent" | "mine">("recent");
  const [folderViewMode, setFolderViewMode] = useState<"grid" | "list">("grid");
  const [folders, setFolders] = useState<ItineraryFolderDto[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [folderError, setFolderError] = useState<string | null>(null);
  const [tripLibrary, setTripLibrary] = useState<ItineraryListItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [tripSwitching, setTripSwitching] = useState(false);
  const [collaborators, setCollaborators] = useState<TripCollaboratorDto[]>([]);
  const [collabEmail, setCollabEmail] = useState("");
  const [collabRole, setCollabRole] = useState<"editor" | "viewer">("viewer");
  const [collabError, setCollabError] = useState<string | null>(null);
  const itemIdCounter = useRef(0);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
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

  function handleAddDay() {
    if (!requireAuthenticated("/itinerary")) {
      return;
    }
    addDay();
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
      const rows = await listTripsForLibrary(browseTab);
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
  }, [status, browseTab]);

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
    if (folderFilter === folder.id) {
      setFolderFilter("all");
    }
    void loadTripLibrary();
  }

  async function handleMoveCurrentTrip(folderId: string | null) {
    if (!tripId || !requireAuthenticated("/itinerary")) {
      return;
    }
    await moveTripToFolder(tripId, folderId);
    setCurrentFolderId(folderId);
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

  const folderOptions = [
    { id: "all", name: t.itineraryPage.allTrips },
    { id: "unfiled", name: t.itineraryPage.unfiledFolder },
    ...folders,
  ];

  const effectiveSort: ItinerarySortOption =
    browseTab === "recent" ? "updatedAt_desc" : sortOption;

  const folderScopedLibrary = tripLibrary.filter((item) => {
    if (browseTab === "recent") {
      return true;
    }
    return (
      folderFilter === "all" ||
      (folderFilter === "unfiled" ? !item.folderId : item.folderId === folderFilter)
    );
  });

  const visibleItineraries = sortItineraries(
    filterItineraries(folderScopedLibrary, deferredItinerarySearch),
    effectiveSort,
  );
  const myId = session?.user?.id;
  const currentRole =
    collaborators.find((member) => member.userId === myId)?.role ||
    (status === "authenticated" ? "owner" : "viewer");
  const canManageShare = canCollaborator(currentRole, "managePermissions");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
                <CalendarDays className="size-7 text-primary" />
                {t.itineraryPage.title}
              </h1>
              <p className="mt-2 text-sm text-muted">
                {destination} · {days}
                {t.itineraryPage.metaDays} · NT${budget.toLocaleString()}
              </p>
              {lastUpdatedAt && (
                <p className="mt-1 text-xs text-muted-light">
                  {t.itineraryPage.updatedPrefix} {new Date(lastUpdatedAt).toLocaleString("zh-TW")}
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShareOpen(true)}
                className="flex items-center gap-2 rounded-xl border border-border-light bg-surface px-4 py-2 text-sm font-medium text-foreground shadow-soft transition-colors hover:bg-cream/60"
              >
                <Share2 className="size-4 text-primary" />
                {t.itineraryPage.share}
              </button>
              <button
                type="button"
                onClick={handleAddDay}
                disabled={status !== "authenticated"}
                className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white shadow-soft transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="size-4" />
                {t.itineraryPage.addDay}
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

        <div className="mb-8 flex gap-8 border-b border-border-light text-sm font-semibold">
          <span className="-mb-px border-b-2 border-foreground px-2 pb-4 text-foreground">{t.itineraryPage.folderLibraryTitle}</span>
          <span className="pb-4 text-muted">Examples</span>
          <span className="hidden pb-4 text-muted sm:inline">Design systems</span>
          <span className="hidden pb-4 text-muted md:inline">Image templates</span>
          <span className="hidden pb-4 text-muted lg:inline">Video templates</span>
          <button
            type="button"
            onClick={() =>
              document.getElementById("itinerary-editor")?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
            className="ml-auto pb-4 text-muted transition-colors hover:text-foreground"
          >
            {t.itineraryPage.editorSectionTitle}
          </button>
        </div>

        <section>
          <div className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="inline-flex w-fit rounded-full border border-border-light bg-surface p-1 shadow-soft">
              <button
                type="button"
                onClick={() => setBrowseTab("recent")}
                className={cn(
                  "rounded-full px-5 py-2 text-sm font-semibold transition-colors",
                  browseTab === "recent" ? "bg-foreground text-white" : "text-muted hover:text-foreground",
                )}
              >
                {t.itineraryPage.browseRecent}
              </button>
              <button
                type="button"
                onClick={() => setBrowseTab("mine")}
                className={cn(
                  "rounded-full px-5 py-2 text-sm font-semibold transition-colors",
                  browseTab === "mine" ? "bg-foreground text-white" : "text-muted hover:text-foreground",
                )}
              >
                {t.itineraryPage.browseMine}
              </button>
            </div>

            <div className="flex w-full flex-col gap-2 lg:ml-auto lg:max-w-md">
              <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border-light bg-surface px-3 py-3 shadow-soft">
                <Search className="size-4 shrink-0 text-muted-light" />
                <input
                  value={itinerarySearch}
                  onChange={(event) => setItinerarySearch(event.target.value)}
                  placeholder={t.itineraryPage.searchFolders}
                  className="min-w-0 flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-light focus:outline-none"
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1 rounded-full border border-border-light bg-surface p-1 shadow-soft">
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
                <button
                  type="button"
                  onClick={() => setFolderFormOpen((open) => !open)}
                  className="flex shrink-0 items-center justify-center gap-2 rounded-lg border border-border-light bg-surface px-3 py-2 text-xs font-medium text-foreground shadow-soft hover:bg-cream/60"
                >
                  <FolderPlus className="size-4" />
                  {t.itineraryPage.createFolder}
                </button>
              </div>
            </div>
          </div>

          {browseTab === "mine" && (
            <div className="mb-5 flex flex-wrap items-center gap-3 text-xs">
              <span className="text-muted">{t.itineraryPage.filterFolder}</span>
              <select
                value={folderFilter}
                onChange={(event) => setFolderFilter(event.target.value)}
                className="rounded-lg border border-border-light bg-surface px-3 py-2 text-foreground"
              >
                {folderOptions.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
              <span className="text-muted">{t.itineraryPage.filterSort}</span>
              <select
                value={sortOption}
                onChange={(event) => setSortOption(event.target.value as ItinerarySortOption)}
                className="rounded-lg border border-border-light bg-surface px-3 py-2 text-foreground"
              >
                <option value="updatedAt_desc">{t.itineraryPage.sortUpdatedDesc}</option>
                <option value="createdAt_desc">{t.itineraryPage.sortCreatedDesc}</option>
                <option value="destination_asc">{t.itineraryPage.sortDestinationAsc}</option>
                <option value="days_asc">{t.itineraryPage.sortDaysAsc}</option>
                <option value="title_asc">{t.itineraryPage.sortTitleAsc}</option>
              </select>
              {tripId && (
                <>
                  <span className="text-muted">{t.itineraryPage.filterCurrentTripFolder}</span>
                  <select
                    value={currentFolderId || ""}
                    onChange={(event) => void handleMoveCurrentTrip(event.target.value || null)}
                    className="rounded-lg border border-border-light bg-surface px-3 py-2 text-foreground"
                  >
                    <option value="">{t.itineraryPage.unfiledFolder}</option>
                    {folders.map((folder) => (
                      <option key={folder.id} value={folder.id}>
                        {folder.name}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>
          )}

          {(folderError || libraryError) && (
            <p className="mb-4 rounded-xl border border-danger/20 bg-danger/10 px-3 py-2 text-xs text-danger">
              {folderError || libraryError}
            </p>
          )}

          {tripSwitching && (
            <p className="mb-3 text-xs text-primary">{t.itineraryPage.switchingTrip}</p>
          )}

          {folderFormOpen && (
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

          {folders.length > 0 && (
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
                <button
                  key={item.id}
                  type="button"
                  disabled={tripSwitching}
                  onClick={() => void handleSelectTripFromLibrary(item)}
                  className="group flex min-h-[212px] flex-col overflow-hidden rounded-lg border border-border-light bg-surface text-left shadow-soft transition-colors hover:border-primary/30 hover:bg-surface-hover disabled:pointer-events-none disabled:opacity-50"
                >
                  <div className="flex flex-1 items-center justify-center bg-surface-elevated py-10">
                    <Folder className="size-16 text-border-strong transition-colors group-hover:text-primary" strokeWidth={1.2} />
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
              ))}
              {visibleItineraries.length === 0 && (
                <div className="col-span-full rounded-2xl border border-dashed border-border-light bg-surface/60 px-4 py-12 text-center text-sm text-muted">
                  {t.itineraryPage.emptyLibrary}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {visibleItineraries.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={tripSwitching}
                  onClick={() => void handleSelectTripFromLibrary(item)}
                  className="flex w-full items-center gap-4 rounded-xl border border-border-light bg-surface px-4 py-3 text-left shadow-soft transition-colors hover:border-primary/30 disabled:pointer-events-none disabled:opacity-50"
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
              ))}
              {visibleItineraries.length === 0 && (
                <div className="rounded-xl border border-dashed border-border-light bg-surface/60 px-4 py-10 text-center text-sm text-muted">
                  {t.itineraryPage.emptyLibrary}
                </div>
              )}
            </div>
          )}
        </section>

        <div className="mt-10 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-8">
            <h2 className="text-lg font-semibold text-foreground">{t.itineraryPage.editorSectionTitle}</h2>
            <div id="itinerary-editor" className="flex flex-col gap-6">
        {itinerary.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border-light bg-surface px-6 py-12 text-center shadow-soft">
            <p className="text-base font-medium text-foreground">{t.itinerary.emptyTitle}</p>
            <p className="mt-2 text-sm text-muted">{t.itinerary.emptyHint}</p>
            <p className="mt-2 text-xs text-muted-light">{t.itineraryPage.emptyStateHint}</p>
            <button
              type="button"
              onClick={handleAddDay}
              disabled={status !== "authenticated"}
              className="mt-6 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="size-4" />
              {t.itineraryPage.addDay}
            </button>
          </div>
        )}
        {itinerary.map((day: TripPlanDay, dayIndex) => (
          <motion.div
            key={day.dayNumber}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: dayIndex * 0.06 }}
            className="relative z-10 overflow-hidden rounded-2xl border border-border-light bg-surface shadow-soft"
          >
            <div className="flex items-center justify-between border-b border-border-light bg-gradient-to-r from-primary/5 to-transparent px-6 py-4">
              <div className="flex items-center gap-4">
                <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-lg font-bold text-primary">
                  {t.itineraryPage.dayBadge.replace("{n}", String(day.dayNumber))}
                </div>
                <div>
                  <h2 className="font-semibold text-foreground">
                    {t.itineraryPage.dayHeading.replace("{n}", String(day.dayNumber))}
                  </h2>
                  {day.theme && <p className="mt-0.5 text-xs text-muted">{day.theme}</p>}
                </div>
              </div>
              <span className="rounded-full bg-cream px-2.5 py-1 text-xs text-muted">
                {day.items.length}
                {t.itineraryPage.stops}
              </span>
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
                        <input
                          data-testid="activity-title-input"
                          value={newTitle}
                          onChange={(event) => setNewTitle(event.target.value)}
                          placeholder={t.itineraryPage.activityTitlePh}
                          className="col-span-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-light focus:outline-none focus:ring-2 focus:ring-primary/30"
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              handleAddItem(day.dayNumber);
                            }
                          }}
                          autoFocus
                        />
                        <div className="flex items-center gap-2">
                          <Clock className="size-4 text-muted" />
                          <input
                            data-testid="activity-time-input"
                            type="time"
                            value={newTime}
                            onChange={(event) => setNewTime(event.target.value)}
                            className="flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                          />
                        </div>
                        <select
                          value={newType}
                          onChange={(event) =>
                            setNewType(event.target.value as TripPlanItem["type"])
                          }
                          className="cursor-pointer rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                        >
                          {typeOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <input
                        data-testid="activity-location-input"
                        value={newLocation}
                        onChange={(event) => setNewLocation(event.target.value)}
                        placeholder="地點，例如：台南市中西區"
                        className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-light focus:outline-none focus:ring-2 focus:ring-primary/30"
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            handleAddItem(day.dayNumber);
                          }
                        }}
                      />
                      <input
                        data-testid="activity-notes-input"
                        value={newNotes}
                        onChange={(event) => setNewNotes(event.target.value)}
                        placeholder={t.itineraryPage.notesPh}
                        className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-light focus:outline-none focus:ring-2 focus:ring-primary/30"
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            handleAddItem(day.dayNumber);
                          }
                        }}
                      />
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

              {addingToDay !== day.dayNumber && (
                <button
                  data-testid="add-activity-button"
                  onClick={() => {
                    if (!requireAuthenticated("/itinerary")) {
                      return;
                    }
                    setAddingToDay(day.dayNumber);
                    setNewTitle("");
                    setNewLocation("");
                    setNewNotes("");
                  }}
                  className="mt-1 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3 text-sm text-muted transition-all hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                >
                  <Plus className="size-4" />
                  {t.itineraryPage.addItemToDay.replace("{n}", String(day.dayNumber))}
                </button>
              )}
            </div>
          </motion.div>
        ))}
            </div>
          </div>

          <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
            <ItineraryCollaborationSidebar tripId={tripId} />
          </aside>
        </div>
      </div>

      <AnimatePresence>
        {shareOpen && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-soft-lg" initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }}>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="flex items-center gap-2 font-semibold text-foreground">
                  <Users className="size-4 text-primary" />
                  分享 / 協作
                </h2>
                <button type="button" onClick={() => setShareOpen(false)} className="rounded-lg p-1 text-muted hover:bg-border-light">
                  <X className="size-4" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-xs text-muted">分享連結</p>
                  <div className="rounded-xl border border-border bg-cream/40 px-3 py-2 text-xs text-muted">
                    {shareLink ||
                      (inviteCode ? `/itinerary?invite=${inviteCode}` : "尚未建立分享連結")}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs text-muted">邀請代碼</p>
                  <div className="rounded-xl border border-border bg-cream/40 px-3 py-2 font-mono text-sm">
                    {inviteCode || "尚未建立"}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs text-muted">目前協作者</p>
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
                              <option value="editor">editor</option>
                              <option value="viewer">viewer</option>
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
                              移除
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted">{member.role}</span>
                        )}
                      </div>
                    )) : (
                      <p className="rounded-xl border border-dashed border-border-light px-3 py-4 text-center text-sm text-muted">
                        目前沒有其他協作者。
                      </p>
                    )}
                  </div>
                </div>
                {canManageShare && (
                  <div className="rounded-xl border border-border-light bg-cream/30 p-3">
                    <p className="mb-2 text-xs text-muted">邀請使用者</p>
                    <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                      <input
                        value={collabEmail}
                        onChange={(event) => setCollabEmail(event.target.value)}
                        placeholder="user@example.com"
                        className="rounded-lg border border-border bg-surface px-3 py-2 text-xs"
                      />
                      <select
                        value={collabRole}
                        onChange={(event) => setCollabRole(event.target.value as "editor" | "viewer")}
                        className="rounded-lg border border-border bg-surface px-3 py-2 text-xs"
                      >
                        <option value="editor">editor</option>
                        <option value="viewer">viewer</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => void handleAddCollaborator()}
                        disabled={!collabEmail.trim()}
                        className="rounded-lg bg-primary px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
                      >
                        邀請
                      </button>
                    </div>
                    {collabError && <p className="mt-2 text-xs text-danger">{collabError}</p>}
                  </div>
                )}
                <div className="rounded-xl bg-cream/40 px-3 py-3 text-xs text-muted">
                  {canManageShare
                    ? "owner 可以邀請、移除協作者並管理權限。"
                    : "目前角色只能檢視或編輯，不能管理權限。"}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
