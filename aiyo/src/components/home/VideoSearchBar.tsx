'use client';

import { useState } from 'react';
import { Search, Link2, Loader2 } from 'lucide-react';
import { useVideoStore } from '@/stores/useVideoStore';

export default function VideoSearchBar() {
  const [input, setInput] = useState('');
  const { isSearching, setIsSearching } = useVideoStore();

  const handleSearch = () => {
    if (!input.trim()) return;
    setIsSearching(true);
    // Mock search with delay
    setTimeout(() => {
      setIsSearching(false);
    }, 1500);
  };

  const isUrl = input.startsWith('http') || input.startsWith('www') || input.includes('youtube.com') || input.includes('youtu.be');

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="relative flex items-center gap-2">
        <div className="relative flex-1">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted">
            {isUrl ? <Link2 className="size-4" /> : <Search className="size-4" />}
          </div>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="貼上 YouTube 連結或搜尋旅遊關鍵字..."
            className="w-full pl-11 pr-4 py-3.5 rounded-2xl border border-border bg-surface text-foreground placeholder:text-muted-light focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all text-sm shadow-soft"
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={isSearching || !input.trim()}
          className="px-5 py-3.5 bg-gradient-to-r from-primary to-primary-dark text-white rounded-2xl font-medium text-sm hover:shadow-md transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2"
        >
          {isSearching ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              分析中
            </>
          ) : isUrl ? (
            '分析影片'
          ) : (
            '搜尋'
          )}
        </button>
      </div>
      <p className="text-xs text-muted mt-2 text-center">
        支援 YouTube 連結分析或關鍵字搜尋旅遊影片
      </p>
    </div>
  );
}
