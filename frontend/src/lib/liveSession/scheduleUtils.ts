/** Format a Date for `<input type="datetime-local" />` in local time. */
export function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Earliest selectable schedule time (default: 5 minutes from now). */
export function minScheduleDatetimeLocal(minutesAhead = 5): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() + minutesAhead);
  d.setSeconds(0, 0);
  return toDatetimeLocalValue(d);
}

/** Suggested default: 1 hour from now, rounded to next 15 minutes. */
export function defaultScheduleDatetimeLocal(): string {
  const d = new Date();
  d.setHours(d.getHours() + 1);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15);
  d.setSeconds(0, 0);
  return toDatetimeLocalValue(d);
}

export function validateScheduleDatetime(value: string): { ok: true; iso: string } | { ok: false; message: string } {
  if (!value.trim()) {
    return { ok: false, message: "Choose a date and time for your session." };
  }
  const when = new Date(value);
  if (Number.isNaN(when.getTime())) {
    return { ok: false, message: "Invalid date or time." };
  }
  if (when.getTime() <= Date.now()) {
    return { ok: false, message: "Scheduled time must be in the future." };
  }
  return { ok: true, iso: when.toISOString() };
}

export function formatScheduleDisplay(value: string): string {
  const when = new Date(value);
  if (Number.isNaN(when.getTime())) return value;
  return when.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
