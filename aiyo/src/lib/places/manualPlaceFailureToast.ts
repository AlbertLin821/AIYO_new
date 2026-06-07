import { zhTW as t } from "@/locales/zh-TW";
import type { ManualPlaceFailureReason } from "@/services/resolveManualPlaceLocation";

export function manualPlaceFailureToast(
  reason: ManualPlaceFailureReason,
  itemAlreadySaved: boolean,
): { title: string; description: string } {
  const title = t.itineraryPage.addActivityGeocodeFailedTitle;
  switch (reason) {
    case "missing_api_key":
      return { title, description: t.itineraryPage.addActivityGeocodeFailedApiKeyDesc };
    case "unauthorized":
      return { title, description: t.itineraryPage.addActivityGeocodeFailedLoginDesc };
    case "query_too_short":
      return { title, description: t.itineraryPage.addActivityGeocodeFailedQueryShortDesc };
    case "invalid_request":
      return { title, description: t.itineraryPage.addActivityGeocodeFailedProviderDesc };
    case "provider_error":
      return { title, description: t.itineraryPage.addActivityGeocodeFailedProviderDesc };
    case "not_found":
    default:
      return {
        title,
        description: itemAlreadySaved
          ? t.itineraryPage.addActivityGeocodeFailedDesc
          : t.itineraryPage.addActivityGeocodeFailedNotFoundDesc,
      };
  }
}
