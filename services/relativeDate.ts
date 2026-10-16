const DAY_MS = 24 * 60 * 60 * 1000;

function plural(count: number, unit: string): string {
  return `il y a ${count} ${unit}${count > 1 && !unit.endsWith('s') ? 's' : ''}`;
}

/** "aujourd'hui", "hier", "il y a 3 jours", "il y a 2 semaines", "il y a 4 mois", "il y a 1 an". */
export function relativeDate(value: string | null | undefined, now = new Date()): string | null {
  const time = value ? Date.parse(value) : NaN;
  if (!Number.isFinite(time)) return null;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (time >= startOfToday) return 'aujourd’hui';
  const days = Math.ceil((startOfToday - time) / DAY_MS);
  if (days <= 1) return 'hier';
  if (days < 7) return plural(days, 'jour');
  if (days < 30) return plural(Math.floor(days / 7), 'semaine');
  if (days < 365) return plural(Math.floor(days / 30), 'mois');
  return plural(Math.floor(days / 365), 'an');
}
