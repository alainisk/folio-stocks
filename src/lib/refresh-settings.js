export const DEFAULT_REFRESH_MINUTES = 15;
export const REFRESH_MINUTE_OPTIONS = Array.from(
  { length: 15 },
  (_, i) => i + 1,
);

export function refreshDelay(lastCheck, minutes, now = Date.now()) {
  return lastCheck ? Math.max(0, lastCheck + minutes * 60_000 - now) : 0;
}
