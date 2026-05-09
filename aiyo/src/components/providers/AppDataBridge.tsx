"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { zhTW as t } from "@/locales/zh-TW";
import { clearPersistedState } from "@/services/persistence";
import { ApiRequestError } from "@/services/apiClient";
import { mergeTripItineraryPins } from "@/services/mapSync";
import { syncService } from "@/services/syncService";
import { useChatStore } from "@/stores/useChatStore";
import { useCollabStore } from "@/stores/useCollabStore";
import { useMapStore } from "@/stores/useMapStore";
import { EMPTY_TRIP_STATE, useTripStore } from "@/stores/useTripStore";
import { getSyncMutationSource, withSyncMutationSource } from "@/stores/syncMutationSource";
import { useToastStore } from "@/stores/useToastStore";
import { useUIStore } from "@/stores/useUIStore";
import { useUserStore } from "@/stores/useUserStore";

export default function AppDataBridge() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const collabRoomId = useCollabStore((state) => state.roomId);
  const pushToast = useToastStore((state) => state.pushToast);
  const initializedRef = useRef(false);
  const userKey =
    status === "authenticated"
      ? (session?.user?.id || session?.user?.email || "guest")
      : null;

  useEffect(() => {
    if (status !== "authenticated" || !userKey || initializedRef.current) {
      return;
    }

    let mounted = true;
    initializedRef.current = true;

    void syncService
      .loadBootstrap()
      .then((snapshot) => {
        if (!mounted) {
          return;
        }
        syncService.applyBootstrap(snapshot, {
          source: "initial-bootstrap",
          forceTrip: true,
        });
        syncService.startRealtime(snapshot.collaboration?.roomId || null);
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : "";
        const unauthorizedApi =
          error instanceof ApiRequestError &&
          (error.status === 401 || error.code === "unauthorized");
        if (
          unauthorizedApi ||
          message.includes("Authentication required") ||
          message.includes("unauthorized") ||
          message.includes("尚未登入") ||
          message.includes("登入已失效") ||
          message.includes("帳號不存在")
        ) {
          clearPersistedState();
          withSyncMutationSource("bootstrap", () => {
            useChatStore.getState().clearMessages();
            useMapStore.getState().clearPins();
            useTripStore.setState(EMPTY_TRIP_STATE);
          });
          useCollabStore.setState({
            roomId: null,
            members: [],
            comments: [],
            presence: [],
            inviteCode: "",
            shareLink: "",
            connectionStatus: "idle",
          });
          useUserStore.setState({
            name: "",
            email: "",
            travelPreferences: [],
            budget: 0,
            destination: "",
            travelDays: 1,
            preferredTransport: "",
            travelPace: "moderate",
            interests: [],
            isFirstVisit: true,
            updateProfile: useUserStore.getState().updateProfile,
            setFirstVisit: useUserStore.getState().setFirstVisit,
          });
          useUIStore.setState({ showOnboarding: true });
          void signOut({ callbackUrl: "/login" });
          return;
        }

        pushToast({
          variant: "error",
          title: t.bootstrap.failedTitle,
          description: message || t.bootstrap.failedDesc,
        });
      });

    const unsubscribeTrip = useTripStore.subscribe((state, previousState) => {
      if (getSyncMutationSource() !== "local-user-edit") {
        return;
      }
      if (
        state.tripId !== previousState.tripId ||
        state.title !== previousState.title ||
        state.destination !== previousState.destination ||
        state.days !== previousState.days ||
        state.budget !== previousState.budget ||
        state.lastUpdatedAt !== previousState.lastUpdatedAt ||
        JSON.stringify(state.itinerary) !== JSON.stringify(previousState.itinerary)
      ) {
        syncService.scheduleTripSync("trip-store");
      }

      if (
        JSON.stringify(state.itinerary) !== JSON.stringify(previousState.itinerary)
      ) {
        const merged = mergeTripItineraryPins(useMapStore.getState().pins, state.itinerary);
        useMapStore.getState().setPins(merged, "local-user-edit");
      }
    });

    const unsubscribeMap = useMapStore.subscribe((state, previousState) => {
      if (getSyncMutationSource() !== "local-user-edit") {
        return;
      }
      if (JSON.stringify(state.pins) !== JSON.stringify(previousState.pins)) {
        syncService.scheduleTripSync("map-store");
      }
    });

    return () => {
      mounted = false;
      unsubscribeTrip();
      unsubscribeMap();
      syncService.stopRealtime();
      initializedRef.current = false;
    };
  }, [pushToast, status, userKey]);

  useEffect(() => {
    if (status !== "authenticated" || !collabRoomId) {
      return;
    }

    const activeSection = pathname?.startsWith("/itinerary") ? "itinerary" : "workspace";

    void syncService.sendPresenceHeartbeat({
      roomId: collabRoomId,
      activeSection,
      selectedEntityId: useTripStore.getState().tripId || undefined,
    });

    const interval = window.setInterval(() => {
      void syncService.sendPresenceHeartbeat({
        roomId: collabRoomId,
        activeSection,
        selectedEntityId: useTripStore.getState().tripId || undefined,
      });
    }, 10000);

    return () => window.clearInterval(interval);
  }, [collabRoomId, pathname, status]);

  return null;
}
