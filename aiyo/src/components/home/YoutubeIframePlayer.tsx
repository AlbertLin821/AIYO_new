"use client";

export type YoutubeIframePlayerProps = {
  videoId: string;
  /** 每次使用者點擊時間戳時遞增，即使秒數相同也會觸發重新載入對應片段。 */
  seekToken: number;
  seekSeconds: number;
  className?: string;
};

/**
 * 使用標準 embed iframe（非 IFrame Player API），讓版面用 CSS 控制寬高，
 * 避免 API 在抽屜動畫／flex 版面下量到錯誤尺寸而出現閃一下後全黑。
 */
export default function YoutubeIframePlayer({
  videoId,
  seekToken,
  seekSeconds,
  className,
}: YoutubeIframePlayerProps) {
  const start = Math.max(0, Math.floor(seekSeconds));
  /** 點「跳到對應時間」後需從該秒直接開播；未靜音時多數瀏覽器會擋 autoplay，故搭配 mute=1。 */
  const jumpedFromTimestamp = seekToken > 0;
  const params = new URLSearchParams({
    rel: "0",
    modestbranding: "1",
    autoplay: jumpedFromTimestamp ? "1" : "0",
    playsinline: "1",
    ...(jumpedFromTimestamp ? { mute: "1" } : {}),
  });
  if (start > 0) {
    params.set("start", String(start));
  }
  const src = `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?${params.toString()}`;

  return (
    <iframe
      key={`${videoId}-${seekToken}-${start}`}
      title="YouTube 影片"
      src={src}
      className={className ?? "absolute inset-0 h-full w-full min-h-0 border-0"}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      referrerPolicy="strict-origin-when-cross-origin"
      allowFullScreen
    />
  );
}
