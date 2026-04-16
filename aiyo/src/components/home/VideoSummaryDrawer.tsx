'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Video } from '@/lib/types';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MapPin, Clock, Plus, Map as MapIcon, Play, ExternalLink, Check, Loader2 } from 'lucide-react';
import { useMapStore } from '@/stores/useMapStore';
import { useTripStore } from '@/stores/useTripStore';

interface VideoSummaryDrawerProps {
  video: Video | null;
  open: boolean;
  onClose: () => void;
}

export default function VideoSummaryDrawer({ video, open, onClose }: VideoSummaryDrawerProps) {
  const router = useRouter();
  const { addPins } = useMapStore();
  const { itinerary, addDay, addItineraryItem } = useTripStore();
  const [toast, setToast] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [adding, setAdding] = useState(false);

  if (!video) return null;

  const handleSyncToMap = () => {
    setSyncing(true);
    addPins(video.extractedLocations);
    setTimeout(() => {
      setSyncing(false);
      onClose();
      router.push('/map');
    }, 600);
  };

  const handleAddToItinerary = () => {
    setAdding(true);
    const newDayNum = itinerary.length + 1;
    addDay();
    video.extractedLocations.forEach((loc, i) => {
      addItineraryItem(newDayNum, {
        id: `vid_${video.id}_${i}_${Date.now()}`,
        time: `${(9 + i * 2).toString().padStart(2, '0')}:00`,
        title: loc.name,
        type: 'attraction',
        notes: loc.description,
        location: loc,
      });
    });
    setToast('✅ 已將影片景點加入行程！');
    setTimeout(() => {
      setAdding(false);
      setToast(null);
      onClose();
      router.push('/itinerary');
    }, 1500);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-foreground/10 z-40"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 h-screen w-full max-w-lg bg-surface z-50 shadow-soft-lg flex flex-col"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-border-light">
              <h2 className="font-semibold text-foreground">影片分析</h2>
              <button onClick={onClose} className="p-1.5 rounded-full text-muted hover:text-foreground hover:bg-border-light transition-colors cursor-pointer">
                <X className="size-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <div className="aspect-video bg-gradient-to-br from-foreground/5 to-foreground/10 flex items-center justify-center relative">
                <div className="size-16 rounded-full bg-white/90 shadow-lg flex items-center justify-center cursor-pointer hover:scale-105 transition-transform">
                  <Play className="size-7 text-primary ml-1" fill="currentColor" />
                </div>
                <div className="absolute bottom-3 right-3 px-2 py-1 bg-foreground/70 text-white text-xs rounded-md">{video.duration}</div>
              </div>
              <div className="p-6 flex flex-col gap-6">
                <div>
                  <h3 className="font-bold text-lg text-foreground leading-snug mb-2">{video.title}</h3>
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <ExternalLink className="size-3" /><span>{video.source}</span><span>•</span><span>{video.duration}</span>
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">📝 摘要</h4>
                  <p className="text-sm text-muted leading-relaxed">{video.summary}</p>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2"><Clock className="size-4 text-primary" />時間戳記</h4>
                  <div className="flex flex-col gap-1.5">
                    {video.timestamps.map((ts, i) => (
                      <button key={i} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-primary/8 transition-colors text-left cursor-pointer group">
                        <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded-md min-w-[52px] text-center">{ts.time}</span>
                        <span className="text-sm text-muted group-hover:text-foreground transition-colors">{ts.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                    <MapPin className="size-4 text-secondary" />抽取景點
                    <span className="text-xs text-muted font-normal">({video.extractedLocations.length} 個)</span>
                  </h4>
                  <div className="flex flex-col gap-2">
                    {video.extractedLocations.map((loc, i) => (
                      <div key={i} className="flex items-start gap-3 px-3 py-2.5 rounded-xl bg-cream/50 border border-border-light">
                        <div className="size-8 rounded-lg bg-secondary/15 flex items-center justify-center flex-shrink-0 mt-0.5"><MapPin className="size-4 text-secondary" /></div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">{loc.name}</p>
                          <p className="text-xs text-muted mt-0.5">{loc.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-2 pb-4">
                  <button onClick={handleAddToItinerary} disabled={adding} className="flex items-center justify-center gap-2 w-full py-3 bg-gradient-to-r from-primary to-primary-dark text-white rounded-xl font-medium text-sm hover:shadow-md transition-all cursor-pointer hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed">
                    {adding ? <><Loader2 className="size-4 animate-spin" />加入中...</> : <><Plus className="size-4" />加入行程</>}
                  </button>
                  <button onClick={handleSyncToMap} disabled={syncing} className="flex items-center justify-center gap-2 w-full py-3 bg-tertiary/15 text-foreground rounded-xl font-medium text-sm hover:bg-tertiary/25 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed">
                    {syncing ? <><Loader2 className="size-4 animate-spin" />同步中...</> : <><MapIcon className="size-4" />同步到地圖</>}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
          {toast && (
            <motion.div initial={{ opacity: 0, y: 20, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }} className="fixed bottom-8 left-1/2 z-[60] px-5 py-3 bg-foreground text-white rounded-2xl shadow-lg text-sm font-medium flex items-center gap-2">
              <Check className="size-4 text-tertiary" />{toast}
            </motion.div>
          )}
        </>
      )}
    </AnimatePresence>
  );
}
