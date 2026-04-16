'use client';

import { useTripStore } from '@/stores/useTripStore';
import { useMapStore } from '@/stores/useMapStore';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronDown, ChevronUp, MapPin, Clock, Train, FileText, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';

const typeIcons: Record<string, string> = {
  attraction: '🏛️',
  restaurant: '🍽️',
  shopping: '🛍️',
  activity: '🎯',
  transport: '🚄',
  hotel: '🏨',
};

const typeColors: Record<string, string> = {
  attraction: 'bg-primary/10 text-primary',
  restaurant: 'bg-secondary/10 text-secondary',
  shopping: 'bg-peach/30 text-foreground',
  activity: 'bg-lavender/15 text-lavender',
  transport: 'bg-tertiary/15 text-foreground',
  hotel: 'bg-muted/10 text-muted',
};

export default function ItineraryPanel() {
  const { itinerary } = useTripStore();
  const { panelOpen, setPanelOpen } = useMapStore();
  const [expandedDay, setExpandedDay] = useState<number>(1);

  return (
    <AnimatePresence>
      {panelOpen && (
        <motion.div
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 280 }}
          className="absolute right-0 top-0 h-full w-[360px] bg-surface/95 backdrop-blur-md z-20 shadow-soft-lg flex flex-col border-l border-border-light"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border-light">
            <div>
              <h3 className="font-semibold text-foreground text-sm">行程規劃</h3>
              <p className="text-xs text-muted mt-0.5">{itinerary.length} 天行程</p>
            </div>
            <button
              onClick={() => setPanelOpen(false)}
              className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-border-light transition-colors cursor-pointer"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Itinerary Days */}
          <div className="flex-1 overflow-y-auto">
            {itinerary.map((day) => (
              <div key={day.day} className="border-b border-border-light last:border-b-0">
                {/* Day Header */}
                <button
                  onClick={() => setExpandedDay(expandedDay === day.day ? -1 : day.day)}
                  className="w-full flex items-center justify-between px-5 py-3 hover:bg-cream/50 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                      D{day.day}
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-medium text-foreground">第 {day.day} 天</p>
                      {day.theme && (
                        <p className="text-[11px] text-muted">{day.theme}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted bg-border-light px-1.5 py-0.5 rounded-full">
                      {day.items.length} 項
                    </span>
                    {expandedDay === day.day ? (
                      <ChevronUp className="size-4 text-muted" />
                    ) : (
                      <ChevronDown className="size-4 text-muted" />
                    )}
                  </div>
                </button>

                {/* Day Items */}
                <AnimatePresence>
                  {expandedDay === day.day && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 pb-3 flex flex-col gap-1">
                        {day.items.map((item, i) => (
                          <div
                            key={item.id}
                            className="flex items-start gap-3 px-3 py-2.5 rounded-xl hover:bg-cream/60 transition-colors group"
                          >
                            {/* Timeline dot */}
                            <div className="flex flex-col items-center gap-1 pt-1">
                              <div className={cn('size-2 rounded-full', i === 0 ? 'bg-primary' : 'bg-border')} />
                              {i < day.items.length - 1 && (
                                <div className="w-px h-8 bg-border-light" />
                              )}
                            </div>

                            {/* Item content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-xs font-mono text-primary">{item.time}</span>
                                <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full', typeColors[item.type])}>
                                  {typeIcons[item.type]} {item.type === 'attraction' ? '景點' : item.type === 'restaurant' ? '餐廳' : item.type === 'shopping' ? '購物' : item.type === 'activity' ? '活動' : item.type === 'transport' ? '交通' : '住宿'}
                                </span>
                              </div>
                              <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
                              {item.transport && (
                                <p className="text-[11px] text-muted flex items-center gap-1 mt-0.5">
                                  <Train className="size-3" /> {item.transport}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}

                        {/* Add item button */}
                        <button className="flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-border hover:border-primary/40 hover:bg-primary/5 text-muted hover:text-primary text-xs transition-all cursor-pointer mt-1">
                          <Plus className="size-3" />
                          新增活動
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
