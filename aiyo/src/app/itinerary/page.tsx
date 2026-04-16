'use client';

import { useState } from 'react';
import { useTripStore } from '@/stores/useTripStore';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import {
  Plus, Trash2, MapPin, Clock, Train, FileText,
  GripVertical, CalendarDays, MoreHorizontal, X, Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ItineraryItem, ItineraryDay } from '@/lib/types';

const typeConfig: Record<string, { icon: string; label: string; color: string }> = {
  attraction: { icon: '🏛️', label: '景點', color: 'border-l-primary' },
  restaurant: { icon: '🍽️', label: '餐廳', color: 'border-l-secondary' },
  shopping: { icon: '🛍️', label: '購物', color: 'border-l-peach' },
  activity: { icon: '🎯', label: '活動', color: 'border-l-lavender' },
  transport: { icon: '🚄', label: '交通', color: 'border-l-tertiary' },
  hotel: { icon: '🏨', label: '住宿', color: 'border-l-muted' },
};

const typeOptions: { value: ItineraryItem['type']; label: string }[] = [
  { value: 'attraction', label: '🏛️ 景點' },
  { value: 'restaurant', label: '🍽️ 餐廳' },
  { value: 'shopping', label: '🛍️ 購物' },
  { value: 'activity', label: '🎯 活動' },
  { value: 'transport', label: '🚄 交通' },
  { value: 'hotel', label: '🏨 住宿' },
];

function SortableActivityItem({ item, day, itemIdx, itemsLength, removeItineraryItem }: { item: ItineraryItem, day: number, itemIdx: number, itemsLength: number, removeItineraryItem: (d: number, id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 1,
    position: 'relative' as const,
  };

  const config = typeConfig[item.type] || typeConfig.attraction;
  
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-start gap-3 px-4 py-3 rounded-xl border-l-3 hover:bg-cream/40 transition-colors group bg-surface',
        config.color,
        isDragging && 'shadow-soft-lg border border-primary/20 bg-cream/70 opacity-90'
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
        <span className="text-xs font-mono font-semibold text-primary bg-primary/8 px-2 py-0.5 rounded-md">{item.time}</span>
        {itemIdx < itemsLength - 1 && item.transport && (
          <div className="flex items-center gap-1 text-[10px] text-muted mt-1"><Train className="size-3" /></div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm">{config.icon}</span>
          <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
          <span className="text-[10px] px-1.5 py-0.5 bg-border-light text-muted rounded-full">{config.label}</span>
        </div>
        {item.transport && <p className="text-xs text-muted flex items-center gap-1 mb-1"><Train className="size-3" />{item.transport}</p>}
        {item.notes && <p className="text-xs text-muted flex items-center gap-1 mb-1"><FileText className="size-3" />{item.notes}</p>}
        {item.location && <p className="text-[11px] text-primary/70 flex items-center gap-1 mt-1"><MapPin className="size-3" />{item.location.name}</p>}
      </div>
      <button 
        onClick={() => removeItineraryItem(day, item.id)} 
        className="p-1.5 rounded-lg text-muted hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer opacity-0 group-hover:opacity-100 relative z-20"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

export default function ItineraryPage() {
  const { itinerary, destination, days, budget, addDay, addItineraryItem, removeItineraryItem, reorderItineraryItem } = useTripStore();
  const [addingToDay, setAddingToDay] = useState<number | null>(null);
  
  // Form states
  const [newTitle, setNewTitle] = useState('');
  const [newTime, setNewTime] = useState('10:00');
  const [newType, setNewType] = useState<ItineraryItem['type']>('attraction');
  const [newNotes, setNewNotes] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Ensure 8px drag before taking over, so clicks on drag handle element work if needed
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleAddItem = (dayNum: number) => {
    if (!newTitle.trim()) return;
    addItineraryItem(dayNum, {
      id: `item_new_${Date.now()}`,
      time: newTime,
      title: newTitle.trim(),
      type: newType,
      notes: newNotes.trim() || undefined,
    });
    setNewTitle('');
    setNewTime('10:00');
    setNewType('attraction');
    setNewNotes('');
    setAddingToDay(null);
  };

  const handleDragEnd = (event: DragEndEvent, dayNum: number, items: ItineraryItem[]) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex((i) => i.id === active.id);
      const newIndex = items.findIndex((i) => i.id === over.id);
      reorderItineraryItem(dayNum, oldIndex, newIndex);
    }
  };

  return (
    <div className="min-h-screen p-6 lg:p-8 max-w-5xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <CalendarDays className="size-6 text-primary" /> 行程管理
            </h1>
            <p className="text-sm text-muted mt-1">
              {destination} {days}天行程 • 預算 NT${budget.toLocaleString()}
            </p>
          </div>
          <button onClick={addDay} className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors cursor-pointer flex items-center gap-2 hover:shadow-md">
            <Plus className="size-4" /> 新增一天
          </button>
        </div>
      </motion.div>

      <div className="flex flex-col gap-6">
        {itinerary.map((day, dIdx) => (
          <motion.div 
            key={day.day} 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ delay: dIdx * 0.08 }} 
            className="bg-surface rounded-2xl shadow-soft overflow-hidden border border-border-light relative z-10"
          >
            <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-primary/5 to-transparent border-b border-border-light">
              <div className="flex items-center gap-4">
                <div className="size-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-lg">D{day.day}</div>
                <div>
                  <h2 className="font-semibold text-foreground">第 {day.day} 天</h2>
                  {day.theme && <p className="text-xs text-muted mt-0.5">{day.theme}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted bg-cream px-2.5 py-1 rounded-full">{day.items.length} 個活動</span>
                <button className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-border-light transition-colors cursor-pointer">
                  <MoreHorizontal className="size-4" />
                </button>
              </div>
            </div>

            <div className="p-4 flex flex-col gap-2 relative">
              {/* @dnd-kit handles Context and Sortable sorting list */}
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={(e) => handleDragEnd(e, day.day, day.items)}
              >
                <SortableContext
                  items={day.items.map(i => i.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="flex flex-col gap-2">
                    {day.items.map((item, idx) => (
                      <SortableActivityItem
                        key={item.id}
                        item={item}
                        day={day.day}
                        itemIdx={idx}
                        itemsLength={day.items.length}
                        removeItineraryItem={removeItineraryItem}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>

              <AnimatePresence>
                {addingToDay === day.day && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden mt-1"
                  >
                    <div className="p-4 rounded-xl border border-primary/30 bg-primary/5 flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                          <Plus className="size-4 text-primary" /> 新增活動
                        </h4>
                        <button onClick={() => setAddingToDay(null)} className="p-1 rounded-lg text-muted hover:text-foreground hover:bg-border-light transition-colors cursor-pointer">
                          <X className="size-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <input
                          value={newTitle}
                          onChange={(e) => setNewTitle(e.target.value)}
                          placeholder="活動名稱 *"
                          className="col-span-2 px-3 py-2 rounded-xl border border-border bg-surface text-sm text-foreground placeholder:text-muted-light focus:outline-none focus:ring-2 focus:ring-primary/30"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleAddItem(day.day);
                          }}
                          autoFocus
                        />
                        <div className="flex items-center gap-2">
                          <Clock className="size-4 text-muted" />
                          <input
                            type="time"
                            value={newTime}
                            onChange={(e) => setNewTime(e.target.value)}
                            className="flex-1 px-3 py-2 rounded-xl border border-border bg-surface text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                          />
                        </div>
                        <select
                          value={newType}
                          onChange={(e) => setNewType(e.target.value as ItineraryItem['type'])}
                          className="px-3 py-2 rounded-xl border border-border bg-surface text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer"
                        >
                          {typeOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                      <input
                        value={newNotes}
                        onChange={(e) => setNewNotes(e.target.value)}
                        placeholder="備註（選填）"
                        className="px-3 py-2 rounded-xl border border-border bg-surface text-sm text-foreground placeholder:text-muted-light focus:outline-none focus:ring-2 focus:ring-primary/30"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddItem(day.day);
                        }}
                      />
                      <button
                        onClick={() => handleAddItem(day.day)}
                        disabled={!newTitle.trim()}
                        className="flex items-center justify-center gap-2 py-2.5 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Check className="size-4" /> 確認新增
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {addingToDay !== day.day && (
                <button
                  onClick={() => {
                    setAddingToDay(day.day);
                    setNewTitle('');
                    setNewNotes('');
                  }}
                  className="flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-border hover:border-primary/40 hover:bg-primary/5 text-muted hover:text-primary text-sm transition-all cursor-pointer mt-1"
                >
                  <Plus className="size-4" /> 新增活動到第 {day.day} 天
                </button>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
