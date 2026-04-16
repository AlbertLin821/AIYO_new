'use client';

import { useState } from 'react';
import { MapPin, Navigation, ZoomIn, ZoomOut, Layers } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTripStore } from '@/stores/useTripStore';
import { useMapStore } from '@/stores/useMapStore';

export default function MapView() {
  const [hoveredPin, setHoveredPin] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const { destination } = useTripStore();
  const { pins } = useMapStore();

  // Compute bounding box for dynamic positioning
  const lats = pins.map((p) => p.lat);
  const lngs = pins.map((p) => p.lng);
  const latRange = lats.length > 0
    ? { min: Math.min(...lats) - 0.012, max: Math.max(...lats) + 0.012 }
    : { min: 35.6, max: 35.75 };
  const lngRange = lngs.length > 0
    ? { min: Math.min(...lngs) - 0.012, max: Math.max(...lngs) + 0.012 }
    : { min: 139.65, max: 139.82 };

  const getPos = (lat: number, lng: number) => ({
    x: ((lng - lngRange.min) / (lngRange.max - lngRange.min)) * 70 + 15,
    y: (1 - (lat - latRange.min) / (latRange.max - latRange.min)) * 70 + 15,
  });

  return (
    <div className="relative w-full h-full rounded-2xl overflow-hidden bg-gradient-to-br from-primary/5 via-cream to-tertiary/5 map-grid">
      {/* Map Controls */}
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
        <button onClick={() => setZoom((z) => Math.min(z + 0.2, 2))} className="size-9 bg-surface rounded-xl shadow-soft flex items-center justify-center text-muted hover:text-foreground transition-colors cursor-pointer">
          <ZoomIn className="size-4" />
        </button>
        <button onClick={() => setZoom((z) => Math.max(z - 0.2, 0.6))} className="size-9 bg-surface rounded-xl shadow-soft flex items-center justify-center text-muted hover:text-foreground transition-colors cursor-pointer">
          <ZoomOut className="size-4" />
        </button>
        <button className="size-9 bg-surface rounded-xl shadow-soft flex items-center justify-center text-muted hover:text-foreground transition-colors cursor-pointer">
          <Layers className="size-4" />
        </button>
        <button className="size-9 bg-surface rounded-xl shadow-soft flex items-center justify-center text-muted hover:text-foreground transition-colors cursor-pointer">
          <Navigation className="size-4" />
        </button>
      </div>

      {/* Map Label */}
      <div className="absolute top-4 left-4 z-10 px-3 py-1.5 bg-surface/90 backdrop-blur-sm rounded-xl shadow-soft text-xs font-medium text-foreground flex items-center gap-2">
        <MapPin className="size-3 text-secondary" />
        {destination} 旅遊地圖
        <span className="text-muted">• {pins.length} 個景點</span>
      </div>

      {/* Map Content */}
      <div className="relative w-full h-full transition-transform duration-300" style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}>
        {/* Route Lines */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-[1]">
          {pins.length > 1 && pins.slice(0, -1).map((pin, i) => {
            const from = getPos(pin.lat, pin.lng);
            const to = getPos(pins[i + 1].lat, pins[i + 1].lng);
            return (
              <line key={`route-${i}`} x1={`${from.x}%`} y1={`${from.y}%`} x2={`${to.x}%`} y2={`${to.y}%`} stroke="#7C9CBF" strokeWidth="1.5" strokeDasharray="6 4" opacity="0.35" />
            );
          })}
        </svg>

        {/* Pins */}
        {pins.map((pin, i) => {
          const pos = getPos(pin.lat, pin.lng);
          return (
            <motion.div
              key={pin.id}
              initial={{ scale: 0, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20, delay: i * 0.05 }}
              className="absolute z-[2] -translate-x-1/2 -translate-y-full"
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              onMouseEnter={() => setHoveredPin(pin.id)}
              onMouseLeave={() => setHoveredPin(null)}
            >
              <div className="relative cursor-pointer group">
                <div className="size-8 rounded-full flex items-center justify-center shadow-md transition-transform group-hover:scale-110" style={{ backgroundColor: pin.color || '#7C9CBF' }}>
                  <MapPin className="size-4 text-white" fill="white" />
                </div>
                <div className="absolute inset-0 rounded-full opacity-30 animate-ping" style={{ backgroundColor: pin.color || '#7C9CBF', animationDuration: '3s' }} />
                {hoveredPin === pin.id && (
                  <motion.div initial={{ opacity: 0, y: 4, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-surface rounded-xl shadow-soft-lg whitespace-nowrap z-10">
                    <p className="text-xs font-semibold text-foreground">{pin.name}</p>
                    <p className="text-[10px] text-muted mt-0.5">{pin.description}</p>
                    <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-surface" />
                  </motion.div>
                )}
              </div>
            </motion.div>
          );
        })}

        {/* Empty state */}
        {pins.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-muted text-sm">
            <div className="text-center">
              <MapPin className="size-8 mx-auto mb-2 opacity-30" />
              <p>尚無景點標記</p>
              <p className="text-xs mt-1">從影片分析中同步景點到地圖</p>
            </div>
          </div>
        )}

        <div className="absolute bottom-8 left-8 text-muted/20 text-[10px] font-mono">35.6762° N, 139.6503° E</div>
      </div>
    </div>
  );
}
