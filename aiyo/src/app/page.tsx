'use client';

import { useRef } from 'react';
import VideoSearchBar from '@/components/home/VideoSearchBar';
import VideoCard from '@/components/home/VideoCard';
import VideoSummaryDrawer from '@/components/home/VideoSummaryDrawer';
import { useVideoStore } from '@/stores/useVideoStore';
import { Sparkles, TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';

export default function HomePage() {
  const { videos, selectedVideo, setSelectedVideo } = useVideoStore();
  // Preserve last video ref for exit animation
  const videoRef = useRef(selectedVideo);
  if (selectedVideo) videoRef.current = selectedVideo;

  return (
    <div className="min-h-screen p-6 lg:p-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 text-primary rounded-full text-xs font-medium mb-4">
          <Sparkles className="size-3" />
          AI 智慧旅遊影片分析
        </div>
        <h1 className="text-3xl font-bold text-foreground mb-2">
          探索旅遊靈感
        </h1>
        <p className="text-muted text-sm max-w-md mx-auto">
          貼上 YouTube 影片連結，AI 會自動分析摘要、抽取景點，幫你快速整理旅遊資訊
        </p>
      </motion.div>

      {/* Search */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-10"
      >
        <VideoSearchBar />
      </motion.div>

      {/* Recommended Videos */}
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-2 mb-5">
          <TrendingUp className="size-4 text-secondary" />
          <h2 className="font-semibold text-foreground">推薦旅遊影片</h2>
          <span className="text-xs text-muted bg-border-light px-2 py-0.5 rounded-full">
            {videos.length} 部
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {videos.map((video, index) => (
            <VideoCard
              key={video.id}
              video={video}
              index={index}
              onClick={() => setSelectedVideo(video)}
            />
          ))}
        </div>
      </div>

      {/* Video Summary Drawer — uses global store, ref preserves data during exit animation */}
      <VideoSummaryDrawer
        video={videoRef.current}
        open={selectedVideo !== null}
        onClose={() => setSelectedVideo(null)}
      />
    </div>
  );
}
