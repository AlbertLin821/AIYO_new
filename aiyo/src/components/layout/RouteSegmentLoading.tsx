export default function RouteSegmentLoading() {
  return (
    <div
      className="min-h-[min(60vh,480px)] animate-pulse space-y-4 p-4"
      aria-hidden
    >
      <div className="h-9 w-40 max-w-[45%] rounded-xl bg-border-light" />
      <div className="h-32 rounded-2xl bg-border-light/90" />
      <div className="h-32 rounded-2xl bg-border-light/70" />
      <div className="h-24 rounded-2xl bg-border-light/50" />
    </div>
  );
}
