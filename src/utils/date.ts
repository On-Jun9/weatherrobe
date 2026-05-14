export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function tomorrowIso(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function nowIso(): string {
  return new Date().toISOString();
}
