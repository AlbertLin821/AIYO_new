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
  className?: string;
  /** When true, hide from assistive tech (e.g. parent button already has `aria-label`). */
  decorative?: boolean;
  "data-testid"?: string;
  "aria-label"?: string;
};

export function MapPinMarker({
  fill,
  selected = false,
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
  );
}
