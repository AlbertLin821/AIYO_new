type HoursAssessment = "open" | "closing_soon" | "closed" | "unknown";

function minute(time: string): number | null {
  if (time === "24:00") return 1440;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

const weekdays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function appliesOnDate(rule: string, date: string | null | undefined): boolean | null {
  if (rule === "Mo-Su" || rule === "Mo,Tu,We,Th,Fr,Sa,Su") return true;
  if (!date) return null;
  const day = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== date) return null;
  const index = weekdays.findIndex((name) => name === rule);
  if (index >= 0) return day.getUTCDay() === index;
  const range = rule.match(/^(Mo|Tu|We|Th|Fr|Sa|Su)-(Mo|Tu|We|Th|Fr|Sa|Su)$/);
  if (!range) return null;
  const first = weekdays.indexOf(range[1]);
  const last = weekdays.indexOf(range[2]);
  const current = day.getUTCDay();
  return first <= last ? current >= first && current <= last : current >= first || current <= last;
}

/** Evaluates simple OSM daily or weekday hours; complex and holiday rules remain unconfirmed. */
export function assessDailyOpeningHours(hours: string | undefined, start: string, date?: string | null): HoursAssessment {
  if (!hours) return "unknown";
  const value = hours.trim();
  if (value === "24/7") return "open";
  const daily = value.match(/^(?:(Mo|Tu|We|Th|Fr|Sa|Su|(?:Mo|Tu|We|Th|Fr|Sa|Su)-(?:Mo|Tu|We|Th|Fr|Sa|Su)|Mo,Tu,We,Th,Fr,Sa,Su)\s+)?((?:[01]\d|2[0-3]):[0-5]\d)-(24:00|(?:[01]\d|2[0-3]):[0-5]\d)$/);
  if (!daily) return "unknown";
  const open = minute(daily[2]);
  const close = minute(daily[3]);
  const visit = minute(start);
  if (open === null || close === null || visit === null || open === close) return "unknown";
  if (daily[1]) {
    const applies = appliesOnDate(daily[1], date);
    if (applies === null || close < open) return "unknown";
    if (!applies) return "closed";
  }
  const untilClose = close > open
    ? visit >= open && visit < close ? close - visit : -1
    : visit >= open ? 1440 + close - visit : visit < close ? close - visit : -1;
  if (untilClose < 0) return "closed";
  return untilClose < 30 ? "closing_soon" : "open";
}
