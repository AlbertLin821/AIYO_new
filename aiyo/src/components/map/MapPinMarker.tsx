"use client";

import { useId } from "react";

import {
  MAP_PIN_OUTER_PATH,
  MAP_PIN_VIEWBOX_H,
  MAP_PIN_VIEWBOX_W,
} from "@/components/map/mapPinIcon";

type MapPinMarkerProps = {
  fill: string;
  selected?: boolean;
  /** 1-based itinerary stop order when this pin is linked to the ordered plan. */
  stopOrder?: number;
  className?: string;
  /** When true, hide from assistive tech (e.g. parent button already has `aria-label`). */
  decorative?: boolean;
  "data-testid"?: string;
  "aria-label"?: string;
};

export function MapPinMarker({
  fill,
  selected = false,
  stopOrder,
  className,
  decorative = false,
  "data-testid": dataTestId,
  "aria-label": ariaLabel,
}: MapPinMarkerProps) {
  const reactId = useId();
  const maskId = `map-pin-mask-${reactId.replace(/:/g, "")}`;
  const strokeW = selected ? 2.75 : 2;
  const baseW = selected ? 40 : 34;
  const baseH = Math.round((MAP_PIN_VIEWBOX_H / MAP_PIN_VIEWBOX_W) * baseW);

  return (
    <div className="relative inline-block" style={{ width: baseW, height: baseH }}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${MAP_PIN_VIEWBOX_W} ${MAP_PIN_VIEWBOX_H}`}
        width={baseW}
        height={baseH}
        className={className}
        data-testid={dataTestId}
        aria-hidden={decorative ? true : undefined}
        aria-label={decorative ? undefined : ariaLabel}
        role={decorative ? undefined : "img"}
        style={{
          overflow: "visible",
          filter: "drop-shadow(0 2px 4px rgba(0,0,0,.3))",
          transform: selected ? "scale(1.08)" : undefined,
          transformOrigin: "50% 100%",
        }}
      >
        {!decorative && ariaLabel ? <title>{ariaLabel}</title> : null}
        <defs>
          <mask id={maskId}>
            <path fill="white" d={MAP_PIN_OUTER_PATH} />
            <circle cx="24" cy="20" r="7.75" fill="black" />
          </mask>
        </defs>
        <path
          fill={fill}
          stroke="#ffffff"
          strokeWidth={strokeW}
          strokeLinejoin="round"
          d={MAP_PIN_OUTER_PATH}
          mask={`url(#${maskId})`}
        />
      </svg>
      {stopOrder != null ? (
        <span
          className="pointer-events-none absolute left-1/2 top-0 z-[1] flex min-w-[15px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white bg-white px-[3px] text-[9px] font-extrabold leading-none shadow-sm"
          style={{ color: fill }}
          aria-hidden
        >
          {stopOrder > 999 ? "⋯" : stopOrder}
        </span>
      ) : null}
    </div>
  );
}
