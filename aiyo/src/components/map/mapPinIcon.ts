/**
 * Teardrop map-pin geometry (tip at bottom center of viewBox) with circular cutout.
 * Used by mock map, legacy Google Marker icons, and AdvancedMarker custom content.
 */

export const MAP_PIN_VIEWBOX_W = 48;
export const MAP_PIN_VIEWBOX_H = 56;

/** Outer teardrop path — symmetric, rounded top, tip near (24, {MAP_PIN_VIEWBOX_H}). */
export const MAP_PIN_OUTER_PATH =
  "M24 3.5C13.18 3.5 4.5 12.18 4.5 23c0 13.25 19.5 32.5 19.5 32.5S43.5 36.25 43.5 23C43.5 12.18 34.82 3.5 24 3.5z";

function escapeSvgText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function mapPinSvgString(
  fill: string,
  strokeWidth: number,
  maskId: string,
  stopLabel?: number,
): string {
  const fontSize = stopLabel == null ? 0 : stopLabel > 99 ? 8 : stopLabel > 9 ? 9 : 10;
  const labelSvg =
    stopLabel == null
      ? ""
      : `<text x="24" y="15" text-anchor="middle" dominant-baseline="central" font-size="${fontSize}" font-weight="800" fill="#ffffff" stroke="rgba(0,0,0,0.3)" stroke-width="0.35" paint-order="stroke fill">${escapeSvgText(String(stopLabel))}</text>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MAP_PIN_VIEWBOX_W} ${MAP_PIN_VIEWBOX_H}" ` +
    `preserveAspectRatio="xMidYMax meet" width="100%" height="100%">` +
    "<defs>" +
    `<mask id="${maskId}"><path fill="white" d="${MAP_PIN_OUTER_PATH}"/>` +
    `<circle cx="24" cy="20" r="7.75" fill="black"/></mask>` +
    "</defs>" +
    `<path fill="${fill}" stroke="#ffffff" stroke-width="${strokeWidth}" stroke-linejoin="round" ` +
    `d="${MAP_PIN_OUTER_PATH}" mask="url(#${maskId})"/>` +
    `${labelSvg}</svg>`
  );
}

let maskIdCounter = 0;

function nextMaskId(): string {
  maskIdCounter += 1;
  return `aiyo-map-pin-hole-${maskIdCounter}`;
}

export function encodeMapPinDataUrl(fill: string, selected: boolean, stopLabel?: number): string {
  const strokeW = selected ? 2.75 : 2;
  const svg = mapPinSvgString(fill, strokeW, nextMaskId(), stopLabel);
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

/** DOM node for {@link google.maps.marker.AdvancedMarkerElement} `content`. */
export function createMapPinElement(fill: string, selected: boolean, stopLabel?: number): HTMLElement {
  const wrap = document.createElement("div");
  const baseW = selected ? 40 : 34;
  const baseH = Math.round((MAP_PIN_VIEWBOX_H / MAP_PIN_VIEWBOX_W) * baseW);
  wrap.style.width = `${baseW}px`;
  wrap.style.height = `${baseH}px`;
  wrap.style.cursor = "pointer";
  wrap.style.transformOrigin = "50% 100%";
  if (selected) {
    wrap.style.transform = "scale(1.08)";
  }
  wrap.style.filter = "drop-shadow(0 2px 4px rgba(0,0,0,.3))";
  const strokeW = selected ? 2.75 : 2;
  wrap.innerHTML = mapPinSvgString(fill, strokeW, nextMaskId(), stopLabel);
  return wrap;
}
