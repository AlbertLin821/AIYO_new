# Google Maps Technical Debt

Date: 2026-05-10

## Referrer allowlist

Google Maps API key referrer restrictions must include the local and deployment origins used by AIYO. Do not place the API key value in reports or committed artifacts.

- `http://localhost:3101/*`
- `http://localhost:3000/*`
- future production deployment domain, for example `https://<production-domain>/*`

## Marker API migration

`google.maps.Marker` is deprecated in favor of `google.maps.marker.AdvancedMarkerElement`. The current map still works, but the migration should be scheduled after the data-quality stabilization work so UI behavior can be verified separately.

Suggested follow-up:

1. Load the marker library with Google Maps JS API.
2. Replace `new google.maps.Marker(...)` with `new google.maps.marker.AdvancedMarkerElement(...)`.
3. Re-run `tests/e2e/map-marker-info-card.spec.ts` and a browser visual check for desktop/mobile.
