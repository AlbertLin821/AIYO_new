'use client';

import { useUIStore } from '@/stores/useUIStore';
import { Mic, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function VoicePlanningButton() {
  const { voiceState, setVoiceState } = useUIStore();

  const handleVoiceClick = () => {
    if (voiceState === 'idle') {
      setVoiceState('listening');
      // Simulate listening → processing → back to idle
      setTimeout(() => setVoiceState('processing'), 3000);
      setTimeout(() => setVoiceState('idle'), 5500);
    } else {
      setVoiceState('idle');
    }
  };

  const isActive = voiceState !== 'idle';

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-3">
      {/* Status label */}
      <AnimatePresence>
        {isActive && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="px-4 py-2 bg-surface rounded-2xl shadow-soft-lg flex items-center gap-2"
          >
            {voiceState === 'listening' && (
              <>
                <div className="flex items-end gap-0.5 h-5">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <motion.div
                      key={i}
                      className="w-1 bg-lavender rounded-full"
                      animate={{ height: [8, 20, 8] }}
                      transition={{
                        duration: 0.6,
                        repeat: Infinity,
                        delay: i * 0.1,
                        ease: 'easeInOut',
                      }}
                    />
                  ))}
                </div>
                <span className="text-sm font-medium text-foreground">AI 正在聆聽...</span>
              </>
            )}
            {voiceState === 'processing' && (
              <>
                <Loader2 className="size-4 text-lavender animate-spin" />
                <span className="text-sm font-medium text-foreground">分析中，正在規劃行程...</span>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Button */}
      <div className="relative">
        {/* Pulse rings */}
        {isActive && (
          <>
            <motion.div
              className="absolute inset-0 rounded-full bg-lavender/20"
              animate={{ scale: [1, 1.6, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            <motion.div
              className="absolute inset-0 rounded-full bg-lavender/15"
              animate={{ scale: [1, 2, 1], opacity: [0.3, 0, 0.3] }}
              transition={{ duration: 2, repeat: Infinity, delay: 0.3 }}
            />
          </>
        )}

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleVoiceClick}
          className={`relative size-16 rounded-full flex items-center justify-center shadow-soft-lg cursor-pointer transition-colors duration-300 ${
            isActive
              ? 'bg-gradient-to-br from-lavender to-primary text-white'
              : 'bg-gradient-to-br from-lavender/80 to-primary/80 text-white hover:from-lavender hover:to-primary'
          }`}
        >
          {voiceState === 'processing' ? (
            <Loader2 className="size-7 animate-spin" />
          ) : (
            <Mic className="size-7" />
          )}
        </motion.button>
      </div>

      {/* Label */}
      {!isActive && (
        <p className="text-xs text-muted font-medium">
          語音規劃行程
        </p>
      )}
    </div>
  );
}
