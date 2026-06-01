export default function TripPageLoading() {
  return (
    <div className="flex h-[100dvh] max-lg:h-[calc(100dvh-3.5rem-env(safe-area-inset-bottom,0px))] items-center justify-center bg-background">
      <div className="size-10 animate-pulse rounded-2xl border-2 border-border bg-surface" />
    </div>
  );
}
