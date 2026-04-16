'use client';

import type { Video } from '@/lib/types';
import { Play, Clock, ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';

interface VideoCardProps {
  video: Video;
  index: number;
  onClick: () => void;
}

// Rotating soft gradient backgrounds for thumbnails (since we have no real images)
const gradients = [
  'from-primary/20 via-lavender/20 to-secondary/20',
  'from-secondary/20 via-peach/20 to-tertiary/20',
  'from-tertiary/20 via-primary/20 to-lavender/20',
  'from-lavender/20 via-secondary/20 to-peach/20',
  'from-peach/20 via-tertiary/20 to-primary/20',
  'from-primary/20 via-peach/20 to-secondary/20',
];

const thumbnailIcons = ['🗼', '🏯', '⛩️', '🏖️', '🎌', '🛕'];

export default function VideoCard({ video, index, onClick }: VideoCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.08 }}
      onClick={onClick}
      className="group bg-surface rounded-2xl overflow-hidden shadow-soft hover:shadow-soft-lg transition-all duration-300 cursor-pointer hover:-translate-y-1"
    >
      {/* Thumbnail Area */}
      <div className={`relative aspect-video bg-gradient-to-br ${gradients[index % gradients.length]} flex items-center justify-center`}>
        <span className="text-5xl">{thumbnailIcons[index % thumbnailIcons.length]}</span>

        {/* Duration badge */}
        <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-foreground/70 text-white text-xs font-medium rounded-md flex items-center gap-1">
          <Clock className="size-3" />
          {video.duration}
        </div>

        {/* Play overlay */}
        <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/10 transition-all duration-300 flex items-center justify-center">
          <div className="size-12 rounded-full bg-white/90 shadow-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 scale-75 group-hover:scale-100">
            <Play className="size-5 text-primary ml-0.5" fill="currentColor" />
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="p-4">
        <h3 className="font-semibold text-sm text-foreground leading-snug line-clamp-2 mb-1.5 group-hover:text-primary transition-colors">
          {video.title}
        </h3>
        <p className="text-xs text-muted line-clamp-2 mb-3 leading-relaxed">
          {video.description}
        </p>

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted flex items-center gap-1">
            <ExternalLink className="size-3" />
            {video.source}
          </span>
          <div className="flex items-center gap-1">
            {video.extractedLocations.slice(0, 3).map((loc, i) => (
              <span
                key={i}
                className="text-[10px] px-1.5 py-0.5 bg-tertiary/20 text-foreground/70 rounded-full"
              >
                {loc.name}
              </span>
            ))}
            {video.extractedLocations.length > 3 && (
              <span className="text-[10px] text-muted">+{video.extractedLocations.length - 3}</span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
