import { geocodeWithGoogle } from "@/server/geo/geocodeService";

const WEATHER_CODES: Record<number, string> = {
  0: "晴朗",
  1: "大致晴朗",
  2: "多雲",
  3: "陰",
  45: "起霧",
  48: "霧",
  51: "毛毛雨",
  61: "小雨",
  63: "中雨",
  65: "大雨",
  80: "陣雨",
  95: "雷雨",
};

function describeCode(code: number): string {
  return WEATHER_CODES[code] ?? `代碼${code}`;
}

export type DailyForecastLine = {
  date: string;
  summary: string;
  precipProbMax?: number;
};

export async function fetchDestinationWeatherSummary(input: {
  destination: string;
  startDate?: string;
  endDate?: string;
}): Promise<{ ok: true; lines: DailyForecastLine[] } | { ok: false; reason: string }> {
  const dest = input.destination?.trim();
  if (!dest) {
    return { ok: false, reason: "destination is empty." };
  }

  const geo = await geocodeWithGoogle(dest);
  if (!geo.ok) {
    return { ok: false, reason: geo.reason };
  }

  const { lat, lng } = geo.result;
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    daily: "weathercode,precipitation_probability_max",
    timezone: "auto",
  });
  if (input.startDate?.trim()) {
    params.set("start_date", input.startDate.trim());
  }
  if (input.endDate?.trim()) {
    params.set("end_date", input.endDate.trim());
  } else if (input.startDate?.trim()) {
    params.set("end_date", input.startDate.trim());
  } else {
    const today = new Date();
    const iso = today.toISOString().slice(0, 10);
    params.set("start_date", iso);
    params.set("end_date", iso);
  }

  const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      return { ok: false, reason: `Open-Meteo HTTP ${response.status}` };
    }
    const payload = (await response.json()) as {
      daily?: {
        time?: string[];
        weathercode?: number[];
        precipitation_probability_max?: number[];
      };
    };
    const times = payload.daily?.time || [];
    const codes = payload.daily?.weathercode || [];
    const precips = payload.daily?.precipitation_probability_max || [];
    const lines: DailyForecastLine[] = [];
    for (let i = 0; i < times.length; i += 1) {
      const code = codes[i];
      const date = times[i];
      if (!date || code === undefined) {
        continue;
      }
      const precip = precips[i];
      const summary = describeCode(code);
      lines.push({
        date,
        summary,
        precipProbMax: precip !== undefined ? Math.round(precip) : undefined,
      });
    }
    if (!lines.length) {
      return { ok: false, reason: "Open-Meteo returned no daily rows." };
    }
    return { ok: true, lines };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Open-Meteo request failed.";
    return { ok: false, reason: message };
  }
}

export function formatWeatherForPrompt(
  result: Extract<Awaited<ReturnType<typeof fetchDestinationWeatherSummary>>, { ok: true }>,
): string {
  return result.lines
    .map((row) => {
      const p =
        row.precipProbMax !== undefined ? `，降雨機率最高約 ${row.precipProbMax}%` : "";
      return `${row.date}：${row.summary}${p}`;
    })
    .join("\n");
}
