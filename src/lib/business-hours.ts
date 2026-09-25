export const DEFAULT_WEEKDAY_HOURS = '4:00 p. m. a 10:00 p. m.';
export const DEFAULT_WEEKEND_HOURS = '11:00 a. m. a 6:00 p. m.';

export const DEFAULT_BUSINESS_HOURS = formatBusinessHours(
  DEFAULT_WEEKDAY_HOURS,
  DEFAULT_WEEKEND_HOURS,
);

export function formatBusinessHours(weekdays: string, weekends: string) {
  return `Lunes a viernes: ${weekdays.trim()}\nSábado y domingo: ${weekends.trim()}`;
}

export function parseBusinessHours(value: string) {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const weekdayLine = lines.find((line) => /^lunes a viernes\s*[:·-]/i.test(line));
  const weekendLine = lines.find((line) => /^s[aá]bado y domingo\s*[:·-]/i.test(line));
  const withoutLabel = (line: string | undefined, fallback: string) =>
    line?.replace(/^[^:·-]+\s*[:·-]\s*/u, '').trim() || fallback;

  return {
    weekdays: withoutLabel(weekdayLine, DEFAULT_WEEKDAY_HOURS),
    weekends: withoutLabel(weekendLine, DEFAULT_WEEKEND_HOURS),
  };
}
