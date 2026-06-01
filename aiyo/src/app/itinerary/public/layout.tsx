import { Suspense } from "react";
import RouteSegmentLoading from "@/components/layout/RouteSegmentLoading";

export default function PublicItinerarySegmentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <Suspense fallback={<RouteSegmentLoading />}>{children}</Suspense>;
}
