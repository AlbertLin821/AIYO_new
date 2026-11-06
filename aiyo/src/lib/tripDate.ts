export function parseTripStartDate(value: string | null | undefined): Date | null {
  if (value == null || value === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("validation_error");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("validation_error");
  }
  return date;
}

export function tripDayDate(startDate: string | null | undefined, dayNumber: number): string | null {
  if (!startDate || !Number.isInteger(dayNumber) || dayNumber < 1) return null;
  const date = parseTripStartDate(startDate);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + dayNumber - 1);
  return date.toISOString().slice(0, 10);
}
