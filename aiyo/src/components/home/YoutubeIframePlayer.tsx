"use client";

import { useEffect, useId, useRef, useState } from "react";

type YTPlayerInstance = {
  destroy: () => void;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  playVideo: () => void;
};

type YTNamespace = {
  Player: new (elementId: string, options: Record<string, unknown>) => YTPlayerInstance;
};

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let iframeApiPromise: Promise<void> | null = null;

function loadYouTubeIframeApi(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }
  if (window.YT?.Player) {
    return Promise.resolve();
  }
  if (iframeApiPromise) {
    return iframeApiPromise;
  }
  iframeApiPromise = new Promise((resolve, reject) => {
    const prior = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prior?.();
      resolve();
    };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      tag.async = true;
      tag.onerror = () => reject(new Error("Failed to load YouTube iframe API"));
      document.body.appendChild(tag);
    } else if (window.YT?.Player) {
      queueMicrotask(() => resolve());
    } else {
      const timer = window.setInterval(() => {
        if (window.YT?.Player) {
          window.clearInterval(timer);
          resolve();
        }
      }, 30);
      window.setTimeout(() => {
        window.clearInterval(timer);
        if (window.YT?.Player) {
          resolve();
        } else {
          reject(new Error("YouTube iframe API timeout"));
        }
      }, 15000);
    }
  });
  return iframeApiPromise;
}

export type YoutubeIframePlayerProps = {
  videoId: string;
  /** 每次使用者點擊時間戳時遞增，即使秒數相同也會觸發 seek。 */
  seekToken: number;
  seekSeconds: number;
  className?: string;
};

export default function YoutubeIframePlayer({
  videoId,
  seekToken,
  seekSeconds,
  className,
}: YoutubeIframePlayerProps) {
  const reactId = useId().replace(/:/g, "");
  const containerId = `yt_embed_${reactId}`;
  const playerRef = useRef<YTPlayerInstance | null>(null);
  const [playerReady, setPlayerReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPlayerReady(false);
    void loadYouTubeIframeApi()
      .then(() => {
        if (cancelled || !window.YT?.Player) {
          return;
        }
        try {
          playerRef.current?.destroy();
        } catch {
          /* ignore */
        }
        playerRef.current = null;

        const origin =
          typeof window !== "undefined"
            ? `${window.location.protocol}//${window.location.host}`
            : undefined;

        playerRef.current = new window.YT.Player(containerId, {
          videoId,
          width: "100%",
          height: "100%",
          playerVars: {
            rel: 0,
            modestbranding: 1,
            enablejsapi: 1,
            ...(origin ? { origin } : {}),
          },
          events: {
            onReady: (event: { target: YTPlayerInstance }) => {
              if (cancelled) {
                return;
              }
              const p = event.target;
              const s = Math.max(0, Math.floor(seekSeconds));
              p.seekTo(s, true);
              try {
                p.playVideo();
              } catch {
                /* autoplay may be blocked until gesture */
              }
              setPlayerReady(true);
            },
          },
        });
      })
      .catch(() => {
        if (!cancelled) {
          setPlayerReady(false);
        }
      });

    return () => {
      cancelled = true;
      setPlayerReady(false);
      try {
        playerRef.current?.destroy();
      } catch {
        /* ignore */
      }
      playerRef.current = null;
    };
  }, [videoId, containerId]);

  useEffect(() => {
    if (!playerReady || !playerRef.current) {
      return;
    }
    const s = Math.max(0, Math.floor(seekSeconds));
    playerRef.current.seekTo(s, true);
    try {
      playerRef.current.playVideo();
    } catch {
      /* ignore */
    }
  }, [playerReady, seekToken, seekSeconds]);

  return <div id={containerId} className={className ?? "absolute inset-0 h-full w-full"} />;
}
