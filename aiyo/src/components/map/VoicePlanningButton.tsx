"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Mic } from "lucide-react";
import { zhTW as t } from "@/locales/zh-TW";
import { applyPlanningUpdateToStores, extractPlanningUpdateFromText } from "@/lib/planningContext";
import {
  fetchOllamaStatusForVoicePlan,
  generatePlanFromVoice,
  VOICE_PLAN_CLIENT_TIMEOUT_MS,
} from "@/services/aiClient";
import { useChatStore } from "@/stores/useChatStore";
import { useToastStore } from "@/stores/useToastStore";
import { useTripStore } from "@/stores/useTripStore";
import { useUIStore } from "@/stores/useUIStore";
import { useUserStore } from "@/stores/useUserStore";

const VOICE_DEBUG_TAG = "[AIYO 語音規劃]";

type SpeechRecognitionAlternativeLike = {
  transcript: string;
};

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
  length: number;
};

type SpeechRecognitionEventLike = Event & {
  results: {
    [index: number]: SpeechRecognitionResultLike;
    length: number;
  };
};

type BrowserSpeechRecognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: Event & { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionCtor = new () => BrowserSpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function buildTimestamp(): string {
  return new Date().toLocaleTimeString("zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function VoicePlanningButton() {
  const { voiceState, setVoiceState, setChatBubbleOpen } = useUIStore();
  const appendMessage = useChatStore((state) => state.appendMessage);
  const pushToast = useToastStore((state) => state.pushToast);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const isMountedRef = useRef(true);
  const lastTranscriptRef = useRef("");
  const voiceStateRef = useRef(voiceState);
  const voiceRequestIdRef = useRef(0);
  const recognitionCancelledRef = useRef(false);
  const planningAbortControllerRef = useRef<AbortController | null>(null);
  const planningAbortReasonRef = useRef<"cancel" | "superseded" | "timeout" | null>(null);
  const planningTimeoutRef = useRef<number | null>(null);
  const [replaceConfirmOpen, setReplaceConfirmOpen] = useState(false);
  const pendingTranscriptRef = useRef("");

  useEffect(() => {
    voiceStateRef.current = voiceState;
  }, [voiceState]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      abortPlanningRequest("cancel");
      recognitionRef.current?.stop();
    };
  }, []);

  function clearPlanningRequest() {
    if (planningTimeoutRef.current !== null) {
      window.clearTimeout(planningTimeoutRef.current);
      planningTimeoutRef.current = null;
    }
    planningAbortControllerRef.current = null;
    planningAbortReasonRef.current = null;
  }

  function abortPlanningRequest(reason: "cancel" | "superseded" | "timeout") {
    if (planningTimeoutRef.current !== null) {
      window.clearTimeout(planningTimeoutRef.current);
      planningTimeoutRef.current = null;
    }
    const controller = planningAbortControllerRef.current;
    if (controller && !controller.signal.aborted) {
      planningAbortReasonRef.current = reason;
      controller.abort();
    }
  }

  function itineraryHasPersistedContent() {
    return useTripStore.getState().itinerary.some((day) => day.items.length > 0);
  }

  function requestSubmitTranscript(transcript: string) {
    const trimmed = transcript.trim();
    if (!trimmed) {
      return;
    }
    if (!itineraryHasPersistedContent()) {
      void submitTranscript(trimmed);
      return;
    }
    pendingTranscriptRef.current = trimmed;
    setReplaceConfirmOpen(true);
  }

  function cancelReplaceConfirm() {
    pendingTranscriptRef.current = "";
    setReplaceConfirmOpen(false);
  }

  function confirmReplaceAndSubmit() {
    const transcript = pendingTranscriptRef.current.trim();
    pendingTranscriptRef.current = "";
    setReplaceConfirmOpen(false);
    if (transcript) {
      void submitTranscript(transcript);
    }
  }

  async function submitTranscript(transcript: string) {
    abortPlanningRequest("superseded");
    const planningExtract = extractPlanningUpdateFromText(transcript);
    applyPlanningUpdateToStores(planningExtract);
    const trip = useTripStore.getState();
    const profile = useUserStore.getState();

    const requestId = (voiceRequestIdRef.current += 1);
    const controller = new AbortController();

    planningAbortControllerRef.current = controller;
    planningAbortReasonRef.current = null;
    planningTimeoutRef.current = window.setTimeout(() => {
      if (requestId !== voiceRequestIdRef.current || controller.signal.aborted) {
        return;
      }
      planningAbortReasonRef.current = "timeout";
      controller.abort();
    }, VOICE_PLAN_CLIENT_TIMEOUT_MS);

    voiceStateRef.current = "processing";
    setVoiceState("processing");

    console.info(VOICE_DEBUG_TAG, "送出行程規劃請求", {
      transcriptPreview: transcript.slice(0, 200),
      transcriptLength: transcript.length,
      planningExtract,
      tripContext: {
        destination: trip.destination,
        days: trip.days,
        budget: trip.budget,
        interestsCount: profile.interests?.length ?? 0,
        transportPreference: profile.preferredTransport,
      },
    });

    try {
      const ollamaStatusBefore = await fetchOllamaStatusForVoicePlan();
      console.info(VOICE_DEBUG_TAG, "Ollama 狀態（請求前）", ollamaStatusBefore);

      const { plan, meta } = await generatePlanFromVoice({
        transcript,
        destination: trip.destination,
        days: trip.days,
        budget: trip.budget,
        interests: profile.interests,
        transportPreference: profile.preferredTransport,
      }, {
        signal: controller.signal,
        timeoutMs: VOICE_PLAN_CLIENT_TIMEOUT_MS,
      });

      console.info(VOICE_DEBUG_TAG, "API 回應 meta", meta ?? null);
      console.info(VOICE_DEBUG_TAG, "行程摘要", {
        summaryPreview: plan.summary?.slice(0, 160) ?? "",
        dayCount: plan.days?.length ?? 0,
      });

      if (!isMountedRef.current || requestId !== voiceRequestIdRef.current) {
        return;
      }

      const ollamaStatusAfter = await fetchOllamaStatusForVoicePlan();
      console.info(VOICE_DEBUG_TAG, "Ollama 狀態（請求後）", ollamaStatusAfter);

      useUserStore.getState().updateProfile({
        destination: useTripStore.getState().destination,
        travelDays: useTripStore.getState().days,
        budget: useTripStore.getState().budget,
      });
      const tripAfterPlan = useTripStore.getState();
      tripAfterPlan.replaceTripPlan(plan, {
        destination: tripAfterPlan.destination,
        days: tripAfterPlan.days,
        budget: tripAfterPlan.budget,
      });

      appendMessage({
        id: `voice_user_${Date.now()}`,
        role: "user",
        content: transcript,
        timestamp: buildTimestamp(),
      });
      appendMessage({
        id: `voice_assistant_${Date.now()}`,
        role: "assistant",
        content: plan.summary,
        timestamp: buildTimestamp(),
      });

      setChatBubbleOpen(true);
      pushToast({
        variant: "success",
        title: t.voice.successTitle,
        description: t.voice.successDescTemplate.replace(
          "{days}",
          String(plan.days.length),
        ),
      });
    } catch (error) {
      console.error(VOICE_DEBUG_TAG, "行程規劃失敗", error);
      if (!isMountedRef.current || requestId !== voiceRequestIdRef.current) {
        return;
      }

      const abortReason = planningAbortReasonRef.current;
      if (controller.signal.aborted && abortReason && abortReason !== "timeout") {
        return;
      }

      const description =
        error instanceof Error ? error.message : t.voice.failedGenericNetwork;
      pushToast({
        variant: "error",
        title: t.voice.failedTitle,
        description,
      });
    } finally {
      if (isMountedRef.current && requestId === voiceRequestIdRef.current) {
        clearPlanningRequest();
        voiceStateRef.current = "idle";
        setVoiceState("idle");
      }
    }
  }

  function stopRecognition() {
    recognitionCancelledRef.current = true;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    abortPlanningRequest("cancel");
    clearPlanningRequest();
    voiceRequestIdRef.current += 1;
    voiceStateRef.current = "idle";
    setVoiceState("idle");
  }

  function handleVoiceClick() {
    if (voiceState !== "idle") {
      stopRecognition();
      return;
    }

    const RecognitionCtor = getSpeechRecognitionCtor();
    if (!RecognitionCtor) {
      pushToast({
        variant: "warning",
        title: t.voice.browserUnsupportedTitle,
        description: t.voice.browserUnsupportedDesc,
      });
      return;
    }

    const recognition = new RecognitionCtor();
    recognitionCancelledRef.current = false;
    lastTranscriptRef.current = "";
    recognition.lang = "zh-TW";
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      const transcript = Array.from({ length: event.results.length }, (_, index) => {
        const result = event.results[index];
        return result?.[0]?.transcript || "";
      })
        .join(" ")
        .trim();

      lastTranscriptRef.current = transcript;

      const finalResult = event.results[event.results.length - 1];
      const isFinal = Boolean(finalResult?.isFinal);
      if (isFinal) {
        console.info(VOICE_DEBUG_TAG, "語音辨識 final", { transcript });
      } else {
        console.debug(VOICE_DEBUG_TAG, "語音辨識 interim", { transcript });
      }

      if (finalResult?.isFinal && transcript) {
        recognition.stop();
        recognitionRef.current = null;
        void requestSubmitTranscript(transcript);
      }
    };

    recognition.onerror = (event) => {
      recognitionRef.current = null;
      recognitionCancelledRef.current = false;
      voiceRequestIdRef.current += 1;
      abortPlanningRequest("cancel");
      clearPlanningRequest();
      voiceStateRef.current = "idle";
      setVoiceState("idle");
      pushToast({
        variant: "error",
        title: t.voice.recognitionErrorTitle,
        description:
          event.error === "not-allowed"
            ? t.voice.recognitionDenied
            : t.voice.recognitionOther,
      });
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      if (recognitionCancelledRef.current) {
        recognitionCancelledRef.current = false;
        return;
      }
      if (voiceStateRef.current === "processing") {
        return;
      }

      if (lastTranscriptRef.current.trim()) {
        return;
      }

      voiceStateRef.current = "idle";
      setVoiceState("idle");
      pushToast({
        variant: "info",
        title: t.voice.noSpeechTitle,
        description: t.voice.noSpeechDesc,
      });
    };

    recognitionRef.current = recognition;
    voiceStateRef.current = "listening";
    setVoiceState("listening");
    recognition.start();
  }

  const isActive = voiceState !== "idle";

  return (
    <div className="absolute bottom-6 left-1/2 z-30 flex max-lg:bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] -translate-x-1/2 flex-col items-center gap-3">
      <AnimatePresence>
        {isActive && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="flex items-center gap-2 rounded-2xl bg-surface px-4 py-2 shadow-soft-lg"
          >
            {voiceState === "listening" ? (
              <>
                <div className="flex h-5 items-end gap-0.5">
                  {[0, 1, 2, 3, 4].map((index) => (
                    <motion.div
                      key={index}
                      className="w-1 rounded-full bg-lavender"
                      animate={{ height: [8, 20, 8] }}
                      transition={{
                        duration: 0.6,
                        repeat: Infinity,
                        delay: index * 0.1,
                        ease: "easeInOut",
                      }}
                    />
                  ))}
                </div>
                <span className="text-sm font-medium text-foreground">{t.voice.listening}</span>
              </>
            ) : (
              <>
                <Loader2 className="size-4 animate-spin text-lavender" />
                <span className="text-sm font-medium text-foreground">{t.voice.processing}</span>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative">
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
          type="button"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => void handleVoiceClick()}
          aria-label={
            voiceState === "processing"
              ? t.voice.processingAria
              : voiceState === "listening"
                ? t.voice.listeningAria
                : t.voice.idleAria
          }
          aria-pressed={isActive ? true : undefined}
          className={`relative flex size-16 items-center justify-center rounded-full shadow-soft-lg transition-colors duration-300 ${
            isActive
              ? "bg-gradient-to-br from-lavender to-primary text-white"
              : "bg-gradient-to-br from-lavender/80 to-primary/80 text-white hover:from-lavender hover:to-primary"
          }`}
        >
          {voiceState === "processing" ? (
            <Loader2 className="size-7 animate-spin" />
          ) : (
            <Mic className="size-7" />
          )}
        </motion.button>
      </div>

      {!isActive && (
        <p className="max-w-xs text-center text-xs font-medium text-muted">{t.voice.footnote}</p>
      )}

      {replaceConfirmOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="voice-replace-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-foreground/25"
            aria-label={t.common.closeDialog}
            onClick={() => cancelReplaceConfirm()}
          />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border-light bg-surface p-6 shadow-soft-lg">
            <h2 id="voice-replace-title" className="text-base font-semibold text-foreground">
              {t.voice.replaceTripConfirmTitle}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{t.voice.replaceTripConfirmBody}</p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => cancelReplaceConfirm()}
                className="rounded-xl border border-border-light px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-cream/60"
              >
                {t.voice.replaceTripCancel}
              </button>
              <button
                type="button"
                onClick={() => confirmReplaceAndSubmit()}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
              >
                {t.voice.replaceTripConfirmAction}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
