"use client";

import { m } from "@/lib/motion";

export type TravelerCharacterMode = "walk" | "wave" | "celebrate";

export type TravelerCharacterSize = "default" | "compact" | "icon";

const SIZE_SCALE: Record<TravelerCharacterSize, number> = {
  default: 1,
  compact: 0.82,
  icon: 0.34,
};

export default function TravelerCharacter({
  mode,
  size = "default",
}: {
  mode: TravelerCharacterMode;
  size?: TravelerCharacterSize;
}) {
  const scale = SIZE_SCALE[size];

  return (
    <m.div
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
          <m.g
            animate={{ rotate: [0, 18, 0, 18, 0] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
            style={{ transformOrigin: "36px 30px" }}
          >
            <rect x="34" y="26" width="5" height="12" rx="2.5" fill="#f8d4b8" transform="rotate(-12 36 32)" />
          </m.g>
        ) : null}
        <m.g
          animate={mode === "walk" ? { rotate: [22, -12, 22] } : { rotate: 8 }}
          transition={
            mode === "walk"
              ? { duration: 0.42, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0.3 }
          }
          style={{ transformOrigin: "18px 40px" }}
        >
          <rect x="14" y="38" width="7" height="14" rx="3.5" fill="#4a6d91" />
        </m.g>
        <m.g
          animate={mode === "walk" ? { rotate: [-12, 22, -12] } : { rotate: -8 }}
          transition={
            mode === "walk"
              ? { duration: 0.42, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0.3 }
          }
          style={{ transformOrigin: "34px 40px" }}
        >
          <rect x="30" y="38" width="7" height="14" rx="3.5" fill="#4a6d91" />
        </m.g>
        {mode === "celebrate" ? (
          <m.path
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
    </m.div>
  );
}
