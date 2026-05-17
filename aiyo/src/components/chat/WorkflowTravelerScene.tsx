"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { WorkflowPhaseKey } from "@/lib/workflowSteps";

type WorkflowTravelerSceneProps = {
  progressPercent: number;
  phase?: string;
  status?: "running" | "waiting_input" | "completed" | "pending" | "failed";
  className?: string;
  compact?: boolean;
};

function TravelerCharacter({
  mode,
  compact,
}: {
  mode: "walk" | "wave" | "celebrate";
  compact?: boolean;
}) {
  const scale = compact ? 0.82 : 1;

  return (
    <motion.div
      className="relative origin-bottom"
      style={{ scale }}
      animate={
        mode === "walk"
          ? { y: [0, -4, 0] }
          : mode === "wave"
            ? { rotate: [0, -2, 2, 0] }
            : { y: [0, -6, 0], scale: [1, 1.05, 1] }
      }
      transition={{
        duration: mode === "walk" ? 0.55 : 1.2,
        repeat: Infinity,
        ease: "easeInOut",
      }}
      aria-hidden
    >
      <svg width="52" height="58" viewBox="0 0 52 58" fill="none" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="26" cy="54" rx="14" ry="3" fill="#5a7ea3" fillOpacity="0.18" />
        <rect x="30" y="22" width="12" height="16" rx="4" fill="#7d9bb8" />
        <rect x="32" y="24" width="8" height="3" rx="1.5" fill="#9fb8d5" />
        <path d="M14 28c0-6 5.4-11 12-11s12 5 12 11v14H14V28z" fill="#5a7ea3" />
        <circle cx="26" cy="16" r="11" fill="#f8d4b8" />
        <circle cx="22" cy="15" r="1.4" fill="#334155" />
        <circle cx="30" cy="15" r="1.4" fill="#334155" />
        <path
          d="M22 19.5c2 2.5 6 2.5 8 0"
          stroke="#334155"
          strokeWidth="1.4"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="20" cy="17" r="2" fill="#fda4af" fillOpacity="0.45" />
        <circle cx="32" cy="17" r="2" fill="#fda4af" fillOpacity="0.45" />
        {mode === "wave" ? (
          <motion.g
            animate={{ rotate: [0, 18, 0, 18, 0] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
            style={{ transformOrigin: "36px 30px" }}
          >
            <rect x="34" y="26" width="5" height="12" rx="2.5" fill="#f8d4b8" transform="rotate(-12 36 32)" />
          </motion.g>
        ) : null}
        <motion.g
          animate={mode === "walk" ? { rotate: [22, -12, 22] } : { rotate: 8 }}
          transition={
            mode === "walk"
              ? { duration: 0.42, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0.3 }
          }
          style={{ transformOrigin: "18px 40px" }}
        >
          <rect x="14" y="38" width="7" height="14" rx="3.5" fill="#4a6d91" />
        </motion.g>
        <motion.g
          animate={mode === "walk" ? { rotate: [-12, 22, -12] } : { rotate: -8 }}
          transition={
            mode === "walk"
              ? { duration: 0.42, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0.3 }
          }
          style={{ transformOrigin: "34px 40px" }}
        >
          <rect x="30" y="38" width="7" height="14" rx="3.5" fill="#4a6d91" />
        </motion.g>
        {mode === "celebrate" ? (
          <motion.path
            d="M8 8l3 3M44 10l-3 3M26 2v4"
            stroke="#f59e0b"
            strokeWidth="2"
            strokeLinecap="round"
            animate={{ opacity: [0.4, 1, 0.4], scale: [0.9, 1.1, 0.9] }}
            transition={{ duration: 1, repeat: Infinity }}
          />
        ) : null}
        {mode === "walk" || mode === "celebrate" ? (
          <rect x="8" y="30" width="10" height="12" rx="3" fill="#d97706" stroke="#b45309" strokeWidth="1" />
        ) : null}
      </svg>
    </motion.div>
  );
}

function phaseToAccessory(phase?: string): string {
  switch (phase as WorkflowPhaseKey | undefined) {
    case "understand":
      return "正在讀你的旅遊願望清單";
    case "plan":
      return "規劃下一站到哪裡查資料";
    case "research":
      return "沿路搜集景點與交通情報";
    case "compose":
      return "把行程裝進行李箱";
    case "waiting_user":
      return "等你一起出發";
    default:
      return "旅程進行中";
  }
}

export default function WorkflowTravelerScene({
  progressPercent,
  phase,
  status = "running",
  className,
  compact = false,
}: WorkflowTravelerSceneProps) {
  const clampedProgress = Math.min(100, Math.max(8, progressPercent));
  const mode =
    status === "completed"
      ? "celebrate"
      : status === "waiting_input"
        ? "wave"
        : "walk";
  const isWalking = mode === "walk";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      className={cn(
        "relative overflow-hidden rounded-2xl border border-primary/10 bg-gradient-to-b from-sky-50/90 to-primary/[0.06]",
        compact ? "px-3 py-2.5" : "px-4 py-3",
        className,
      )}
      aria-hidden
    >
      <motion.div
        className="pointer-events-none absolute -right-6 top-2 size-16 rounded-full bg-white/50 blur-xl"
        animate={{ x: [0, 8, 0], opacity: [0.5, 0.8, 0.5] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="pointer-events-none absolute -left-4 bottom-1 size-12 rounded-full bg-primary/10 blur-lg"
        animate={{ x: [0, -6, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className={cn("flex items-center gap-3", compact ? "min-h-[72px]" : "min-h-[88px]")}>
        <motion.div
          className="relative min-w-0 flex-1"
          style={{ height: compact ? 56 : 64 }}
        >
          <div className="absolute inset-x-0 bottom-2 h-2 overflow-hidden rounded-full bg-white/80">
            <div className="h-full w-full bg-[repeating-linear-gradient(90deg,#cbd5e1_0,#cbd5e1_6px,transparent_6px,transparent_12px)] opacity-60" />
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary/30 to-primary/50"
              initial={{ width: 0 }}
              animate={{ width: `${clampedProgress}%` }}
              transition={{ duration: 0.45, ease: "easeOut" }}
            />
          </div>

          <motion.div
            className="absolute bottom-0 z-10"
            style={{ left: `calc(${clampedProgress}% - ${compact ? 22 : 26}px)` }}
            animate={isWalking ? { x: [0, 2, 0, -2, 0] } : undefined}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          >
            <TravelerCharacter mode={mode} compact={compact} />
          </motion.div>

          <motion.div
            className="absolute bottom-5 opacity-70"
            style={{ left: "12%" }}
            animate={{ y: [0, -2, 0] }}
            transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
            aria-hidden
          >
            <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
              <ellipse cx="10" cy="11" rx="8" ry="5" fill="#e2e8f0" />
              <ellipse cx="18" cy="10" rx="9" ry="6" fill="#f8fafc" />
              <ellipse cx="14" cy="8" rx="7" ry="5" fill="#fff" />
            </svg>
          </motion.div>
          <motion.div
            className="absolute bottom-4 opacity-65"
            style={{ right: "16%" }}
            animate={{ y: [0, -3, 0] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
            aria-hidden
          >
            <svg width="18" height="22" viewBox="0 0 18 22" fill="none">
              <rect x="7" y="14" width="4" height="8" rx="1" fill="#a8a29e" />
              <circle cx="9" cy="10" r="8" fill="#86efac" fillOpacity="0.85" />
              <circle cx="6" cy="8" r="5" fill="#4ade80" fillOpacity="0.7" />
              <circle cx="12" cy="7" r="5" fill="#bbf7d0" fillOpacity="0.8" />
            </svg>
          </motion.div>
        </motion.div>

        {!compact ? (
          <p className="max-w-[7.5rem] shrink-0 text-[11px] leading-4 text-primary/90">
            {phaseToAccessory(phase)}
          </p>
        ) : null}
      </div>
    </motion.div>
  );
}
