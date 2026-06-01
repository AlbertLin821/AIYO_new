import { resolveGoogleMapsApiKey } from "@/lib/googleMapsEnv";

export type GoogleMapsProbeStatus = "ok" | "denied" | "error" | "skipped";

export interface GoogleMapsApiProbe {
  status: GoogleMapsProbeStatus;
  detail?: string;
}

export interface GoogleMapsSetupCheckResult {
  keyConfigured: boolean;
  keyPrefix: string | null;
  geocoding: GoogleMapsApiProbe;
  staticMaps: GoogleMapsApiProbe;
  likelyIssue: "none" | "missing_key" | "billing_or_disabled" | "api_key_restrictions";
  userSteps: string[];
}

async function probeGeocoding(apiKey: string): Promise<GoogleMapsApiProbe> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", "Taipei");
  url.searchParams.set("key", apiKey);

  try {
    const response = await fetch(url, { cache: "no-store" });
    const body = (await response.json()) as {
      status?: string;
      error_message?: string;
    };
    if (body.status === "OK") {
      return { status: "ok" };
    }
    if (body.status === "REQUEST_DENIED") {
      return {
        status: "denied",
        detail: body.error_message ?? "REQUEST_DENIED",
      };
    }
    return {
      status: "error",
      detail: body.error_message ?? body.status ?? "unknown",
    };
  } catch (error) {
    return {
      status: "error",
      detail: error instanceof Error ? error.message : "fetch_failed",
    };
  }
}

async function probeStaticMaps(apiKey: string): Promise<GoogleMapsApiProbe> {
  const url = new URL("https://maps.googleapis.com/maps/api/staticmap");
  url.searchParams.set("center", "25.033,121.565");
  url.searchParams.set("zoom", "10");
  url.searchParams.set("size", "100x100");
  url.searchParams.set("key", apiKey);

  try {
    const response = await fetch(url, { cache: "no-store" });
    const contentType = response.headers.get("content-type") ?? "";
    if (response.ok && contentType.startsWith("image/")) {
      return { status: "ok" };
    }
    const text = await response.text();
    try {
      const body = JSON.parse(text) as { error_message?: string; status?: string };
      if (body.status === "REQUEST_DENIED") {
        return {
          status: "denied",
          detail: body.error_message ?? "REQUEST_DENIED",
        };
      }
      return {
        status: "error",
        detail: body.error_message ?? text.slice(0, 200),
      };
    } catch {
      return {
        status: "error",
        detail: text.slice(0, 200) || `HTTP ${response.status}`,
      };
    }
  } catch (error) {
    return {
      status: "error",
      detail: error instanceof Error ? error.message : "fetch_failed",
    };
  }
}

function buildUserSteps(
  likelyIssue: GoogleMapsSetupCheckResult["likelyIssue"],
): string[] {
  if (likelyIssue === "missing_key") {
    return [
      "在 aiyo/.env.local 設定 GOOGLE_MAPS_API_KEY 與 NEXT_PUBLIC_GOOGLE_MAPS_API_KEY（兩者請用同一組金鑰）。",
      "重新啟動 npm run dev。",
    ];
  }
  if (likelyIssue === "billing_or_disabled") {
    return [
      "開啟 Google Cloud Console → 選對專案 → APIs & Services → Library。",
      "啟用「Maps JavaScript API」、「Geocoding API」、「Maps Static API」（至少前兩項）。",
      "確認帳單已啟用（Billing linked）。",
      "Credentials → 你的 API 金鑰 → 若有限制，Application restrictions 加入 http://localhost:3000/* 與 http://127.0.0.1:3000/*。",
    ];
  }
  if (likelyIssue === "api_key_restrictions") {
    return [
      "Cloud Console → Credentials → 點選此 API 金鑰。",
      "API restrictions：改為「Don't restrict key」（僅本機除錯）或勾選「Maps JavaScript API」。",
      "ApiTargetBlockedMapError 常見原因：金鑰只允許 Geocoding，未允許 Maps JavaScript API。",
      "儲存後等 1–5 分鐘，硬重新整理瀏覽器（Ctrl+Shift+R）。",
    ];
  }
  return [
    "金鑰後端探測正常；若瀏覽器仍出現 ApiTargetBlockedMapError，請確認 HTTP referrer 含 localhost，且 Maps JavaScript API 已啟用。",
  ];
}

export async function runGoogleMapsSetupCheck(
  env: NodeJS.ProcessEnv = process.env,
): Promise<GoogleMapsSetupCheckResult> {
  const apiKey = resolveGoogleMapsApiKey(env);
  if (!apiKey) {
    return {
      keyConfigured: false,
      keyPrefix: null,
      geocoding: { status: "skipped" },
      staticMaps: { status: "skipped" },
      likelyIssue: "missing_key",
      userSteps: buildUserSteps("missing_key"),
    };
  }

  const [geocoding, staticMaps] = await Promise.all([
    probeGeocoding(apiKey),
    probeStaticMaps(apiKey),
  ]);

  let likelyIssue: GoogleMapsSetupCheckResult["likelyIssue"] = "none";
  if (geocoding.status === "denied" && staticMaps.status === "denied") {
    likelyIssue = "billing_or_disabled";
  } else if (geocoding.status === "ok" || staticMaps.status === "ok") {
    // Geocoding/Static OK but browser Map still blocked → JS API not in key restrictions
    likelyIssue = "api_key_restrictions";
  } else if (geocoding.status === "denied") {
    likelyIssue = "billing_or_disabled";
  }

  return {
    keyConfigured: true,
    keyPrefix: `${apiKey.slice(0, 12)}…`,
    geocoding,
    staticMaps,
    likelyIssue,
    userSteps: buildUserSteps(likelyIssue),
  };
}
