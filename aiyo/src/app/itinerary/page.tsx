"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarDays,
  Check,
  Clock,
  GripVertical,
  MapPin,
  Plus,
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
import { sortItineraries, type ItineraryListItem, type ItinerarySortOption } from "@/lib/itinerary-sort";
import { canCollaborator } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { zhTW as t } from "@/locales/zh-TW";
import {
  addTripCollaborator,
  createItineraryFolder,
  deleteItineraryFolder,
  listItineraryFolders,
  listTripCollaborators,
  moveTripToFolder,
  removeTripCollaborator,
  updateItineraryFolder,
  updateTripCollaboratorRole,
  type ItineraryFolderDto,
  type TripCollaboratorDto,
} from "@/services/itineraryClient";
import { buildPinsFromTripPlan } from "@/services/mapSync";
import { useCollabStore } from "@/stores/useCollabStore";
import { useMapStore } from "@/stores/useMapStore";
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
}: {
  item: TripPlanItem;
  dayNumber: number;
  itemIndex: number;
  itemsLength: number;
  removeItineraryItem: (dayNumber: number, itemId: string) => void;
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

  return (
    <div
      ref={setNodeRef}
      data-testid="activity-card"
      style={style}
      className={cn(
        "flex items-start gap-3 px-4 py-3 rounded-xl border-l-4 hover:bg-cream/40 transition-colors group bg-surface",
        colorClass,
        isDragging && "shadow-soft-lg border border-primary/20 bg-cream/70 opacity-90",
      )}
    >
      <div
        {...attributes}
        {...listeners}
        className="pt-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab hover:text-primary focus:outline-none touch-none"
      >
        <GripVertical className="size-4 text-muted" />
      </div>

      <div className="flex flex-col items-center gap-1 min-w-[50px]">
        <span className="text-xs font-mono font-semibold text-primary bg-primary/8 px-2 py-0.5 rounded-md">
          {item.time}
        </span>
        {itemIndex < itemsLength - 1 && item.transport && (
          <div className="flex items-center gap-1 text-[10px] text-muted mt-1">
            <Train className="size-3" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
          <span className="text-[10px] px-1.5 py-0.5 bg-border-light text-muted rounded-full">
            {typeLabel(item.type)}
          </span>
        </div>
        {item.transport && (
          <p className="text-xs text-muted flex items-center gap-1 mb-1">
            <Train className="size-3" />
            {item.transport}
          </p>
        )}
        {item.notes && <p className="text-xs text-muted mb-1">{item.notes}</p>}
        {item.location && (
          <p className="text-[11px] text-primary/70 flex items-center gap-1 mt-1">
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
        className="p-1.5 rounded-lg text-muted hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer opacity-0 group-hover:opacity-100 relative z-20"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

export default function ItineraryPage() {
  const router = useRouter();
  const { status } = useSession();
  const {
    itinerary,
    tripId,
    title,
    destination,
    days,
    budget,
    lastUpdatedAt,
    addDay,
    addItineraryItem,
    removeItineraryItem,
    reorderItineraryItem,
  } = useTripStore();
  const setPins = useMapStore((state) => state.setPins);
  const { inviteCode, shareLink } = useCollabStore();
  const [addingToDay, setAddingToDay] = useState<number | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newTime, setNewTime] = useState("10:00");
  const [newLocation, setNewLocation] = useState("");
  const [newType, setNewType] = useState<TripPlanItem["type"]>("attraction");
  const [newNotes, setNewNotes] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [folderFilter, setFolderFilter] = useState<string>("all");
  const [sortOption, setSortOption] = useState<ItinerarySortOption>("updatedAt_desc");
  const [folders, setFolders] = useState<ItineraryFolderDto[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [folderError, setFolderError] = useState<string | null>(null);
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

  function syncToMap() {
    if (!requireAuthenticated(`/itinerary`)) {
      return;
    }
    setSyncing(true);
    setPins(buildPinsFromTripPlan(itinerary));
    window.setTimeout(() => setSyncing(false), 300);
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

  useEffect(() => {
    void refreshFolders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    if (shareOpen) {
      void refreshCollaborators();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareOpen, tripId]);

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
  }

  async function handleRenameFolder(folder: ItineraryFolderDto) {
    const name = window.prompt("重新命名資料夾", folder.name)?.trim();
    if (!name || name === folder.name) {
      return;
    }
    const updated = await updateItineraryFolder(folder.id, { name });
    setFolders((items) => items.map((item) => (item.id === updated.id ? updated : item)));
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
  }

  async function handleMoveCurrentTrip(folderId: string | null) {
    if (!tripId || !requireAuthenticated("/itinerary")) {
      return;
    }
    await moveTripToFolder(tripId, folderId);
    setCurrentFolderId(folderId);
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

  const folderOptions = [
    { id: "all", name: "全部行程" },
    { id: "unfiled", name: "未分類" },
    ...folders,
  ];

  const itineraryCards: ItineraryListItem[] = [
    {
      id: tripId || "current-trip",
      title: title || `${destination || "未命名"} 行程`,
      destination: destination || "尚未設定",
      days,
      folderId: currentFolderId || undefined,
      createdAt: lastUpdatedAt || new Date().toISOString(),
      updatedAt: lastUpdatedAt || new Date().toISOString(),
    },
    {
      id: "sample-taipei",
      title: "台北三日遊",
      destination: "台北",
      days: 3,
      folderId: folders[0]?.id,
      createdAt: "2026-01-05T10:00:00.000Z",
      updatedAt: "2026-04-12T10:00:00.000Z",
    },
    {
      id: "sample-taichung",
      title: "台中美食兩日遊",
      destination: "台中",
      days: 2,
      folderId: folders[0]?.id,
      createdAt: "2026-02-10T10:00:00.000Z",
      updatedAt: "2026-03-18T10:00:00.000Z",
    },
    {
      id: "sample-tokyo",
      title: "日本東京五日遊",
      destination: "東京",
      days: 5,
      folderId: folders[1]?.id,
      createdAt: "2026-03-01T10:00:00.000Z",
      updatedAt: "2026-03-20T10:00:00.000Z",
    },
  ];
  const visibleItineraries = sortItineraries(
    itineraryCards.filter((item) =>
      folderFilter === "all" ||
      (folderFilter === "unfiled" ? !item.folderId : item.folderId === folderFilter),
    ),
    sortOption,
  );
  const currentRole = collaborators.find((member) => member.role === "owner")?.role || "owner";
  const canManageShare = canCollaborator(currentRole, "managePermissions");

  return (
    <div className="min-h-screen p-6 lg:p-8 max-w-5xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <CalendarDays className="size-6 text-primary" />
              {t.itineraryPage.title}
            </h1>
            <p className="text-sm text-muted mt-1">
              {destination} · {days}
              {t.itineraryPage.metaDays} · NT${budget.toLocaleString()}
            </p>
            {lastUpdatedAt && (
              <p className="text-xs text-muted mt-1">
                {t.itineraryPage.updatedPrefix}{" "}
                {new Date(lastUpdatedAt).toLocaleString("zh-TW")}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={syncToMap}
              disabled={status !== "authenticated"}
              className="px-4 py-2 bg-primary/10 text-primary rounded-xl text-sm font-medium hover:bg-primary/20 transition-colors cursor-pointer"
            >
              {syncing ? t.itineraryPage.syncing : t.itineraryPage.syncMap}
            </button>
            <button
              onClick={() => setShareOpen(true)}
              className="px-4 py-2 bg-surface border border-border-light text-foreground rounded-xl text-sm font-medium hover:bg-cream/50 transition-colors cursor-pointer flex items-center gap-2"
            >
              <Share2 className="size-4" />
              分享
            </button>
            <button
              onClick={handleAddDay}
              disabled={status !== "authenticated"}
              className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors cursor-pointer flex items-center gap-2 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="size-4" />
              {t.itineraryPage.addDay}
            </button>
          </div>
        </div>
      </motion.div>

      <div className="mb-8 rounded-2xl border border-border-light bg-surface p-4 shadow-soft">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-foreground">我的多個行程</h2>
            <p className="mt-1 text-xs text-muted">依資料夾與排序方式瀏覽目前與範例行程。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={folderFilter}
              onChange={(event) => setFolderFilter(event.target.value)}
              className="rounded-xl border border-border bg-cream/40 px-3 py-2 text-xs text-foreground"
            >
              {folderOptions.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
            <select
              value={sortOption}
              onChange={(event) => setSortOption(event.target.value as ItinerarySortOption)}
              className="rounded-xl border border-border bg-cream/40 px-3 py-2 text-xs text-foreground"
            >
              <option value="updatedAt_desc">最近編輯</option>
              <option value="createdAt_desc">最新建立</option>
              <option value="destination_asc">地點 A-Z</option>
              <option value="days_asc">天數少到多</option>
              <option value="title_asc">名稱 A-Z</option>
            </select>
          </div>
        </div>
        <div className="mb-4 grid gap-3 md:grid-cols-[1fr_auto]">
          <input
            value={newFolderName}
            onChange={(event) => setNewFolderName(event.target.value)}
            placeholder="建立新資料夾，例如：台灣旅遊"
            className="rounded-xl border border-border bg-cream/40 px-3 py-2 text-xs text-foreground placeholder:text-muted-light"
          />
          <button
            type="button"
            onClick={() => void handleCreateFolder()}
            disabled={status !== "authenticated" || !newFolderName.trim()}
            className="rounded-xl bg-primary px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            建立資料夾
          </button>
        </div>
        {folderError && (
          <p className="mb-3 rounded-xl border border-danger/20 bg-danger/10 px-3 py-2 text-xs text-danger">
            {folderError}
          </p>
        )}
        {folders.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {folders.map((folder) => (
              <div key={folder.id} className="inline-flex items-center gap-2 rounded-full bg-primary/5 px-3 py-1.5 text-xs">
                <span>{folder.name}</span>
                <button type="button" onClick={() => void handleRenameFolder(folder)} className="text-primary hover:text-primary-dark">
                  改名
                </button>
                <button type="button" onClick={() => void handleDeleteFolder(folder)} className="text-danger hover:text-danger">
                  刪除
                </button>
              </div>
            ))}
          </div>
        )}
        {tripId && (
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>目前行程資料夾</span>
            <select
              value={currentFolderId || ""}
              onChange={(event) => void handleMoveCurrentTrip(event.target.value || null)}
              className="rounded-xl border border-border bg-cream/40 px-3 py-2 text-foreground"
            >
              <option value="">未分類</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {visibleItineraries.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => item.id === (tripId || "current-trip") && window.scrollTo({ top: 0, behavior: "smooth" })}
              className="rounded-xl border border-border-light bg-cream/30 p-4 text-left transition-colors hover:border-primary/30 hover:bg-primary/5"
            >
              <p className="text-sm font-semibold text-foreground">{item.title}</p>
              <p className="mt-1 text-xs text-muted">{item.destination} · {item.days} 天</p>
              <p className="mt-3 text-[11px] text-muted">
                最近編輯 {new Date(item.updatedAt).toLocaleDateString("zh-TW")}
              </p>
            </button>
          ))}
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
                    {shareLink || `/collaborate?tripId=${tripId || "current"}`}
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

      <div className="flex flex-col gap-6">
        {itinerary.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border-light bg-cream/40 px-6 py-12 text-center">
            <p className="text-base font-medium text-foreground">{t.itinerary.emptyTitle}</p>
            <p className="mt-2 text-sm text-muted">{t.itinerary.emptyHint}</p>
            <p className="mt-2 text-xs text-muted">{t.itineraryPage.emptyStateHint}</p>
            <button
              type="button"
              onClick={handleAddDay}
              disabled={status !== "authenticated"}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-dark cursor-pointer"
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
            className="bg-surface rounded-2xl shadow-soft overflow-hidden border border-border-light relative z-10"
          >
            <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-primary/5 to-transparent border-b border-border-light">
              <div className="flex items-center gap-4">
                <div className="size-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-lg">
                  {t.itineraryPage.dayBadge.replace("{n}", String(day.dayNumber))}
                </div>
                <div>
                  <h2 className="font-semibold text-foreground">
                    {t.itineraryPage.dayHeading.replace("{n}", String(day.dayNumber))}
                  </h2>
                  {day.theme && <p className="text-xs text-muted mt-0.5">{day.theme}</p>}
                </div>
              </div>
              <span className="text-xs text-muted bg-cream px-2.5 py-1 rounded-full">
                {day.items.length}
                {t.itineraryPage.stops}
              </span>
            </div>

            <div className="p-4 flex flex-col gap-2 relative">
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
                    <div className="p-4 rounded-xl border border-primary/30 bg-primary/5 flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                          <Plus className="size-4 text-primary" />
                          {t.itineraryPage.addBlockTitle}
                        </h4>
                        <button
                          onClick={() => setAddingToDay(null)}
                          className="p-1 rounded-lg text-muted hover:text-foreground hover:bg-border-light transition-colors cursor-pointer"
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
                          className="col-span-2 px-3 py-2 rounded-xl border border-border bg-surface text-sm text-foreground placeholder:text-muted-light focus:outline-none focus:ring-2 focus:ring-primary/30"
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
                            className="flex-1 px-3 py-2 rounded-xl border border-border bg-surface text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                          />
                        </div>
                        <select
                          value={newType}
                          onChange={(event) =>
                            setNewType(event.target.value as TripPlanItem["type"])
                          }
                          className="px-3 py-2 rounded-xl border border-border bg-surface text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer"
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
                        className="px-3 py-2 rounded-xl border border-border bg-surface text-sm text-foreground placeholder:text-muted-light focus:outline-none focus:ring-2 focus:ring-primary/30"
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
                        className="px-3 py-2 rounded-xl border border-border bg-surface text-sm text-foreground placeholder:text-muted-light focus:outline-none focus:ring-2 focus:ring-primary/30"
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
                        className="flex items-center justify-center gap-2 py-2.5 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
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
                  className="flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-border hover:border-primary/40 hover:bg-primary/5 text-muted hover:text-primary text-sm transition-all cursor-pointer mt-1"
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
  );
}
