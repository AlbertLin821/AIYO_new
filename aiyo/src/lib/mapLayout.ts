/** Right itinerary panel width on `/map` (matches ItineraryPanel `sm:w-[380px]`). */
export const MAP_ITINERARY_PANEL_WIDTH_PX = 380;

/** Gap between map controls and the panel edge when the panel is open. */
export const MAP_CONTROLS_PANEL_GAP_REM = 1;

export const MAP_CONTROLS_OFFSET_WITH_PANEL = `calc(${MAP_CONTROLS_PANEL_GAP_REM}rem + ${MAP_ITINERARY_PANEL_WIDTH_PX}px)`;
