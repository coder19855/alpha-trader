const IST_TIMEZONE = 'Asia/Kolkata';
const SESSION_OPEN = { hour: 9, minute: 15 };
const SESSION_CLOSE = { hour: 15, minute: 30 };

function getIstSessionClock(now = Date.now()): {
  weekday: string;
  mins: number;
} {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: IST_TIMEZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(now));

  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);

  return { weekday, mins: hour * 60 + minute };
}

/** NSE cash session: Mon–Fri 09:15–15:30 IST (matches server). */
export function isIndianMarketOpen(now = Date.now()): boolean {
  const { weekday, mins } = getIstSessionClock(now);
  if (weekday === 'Sat' || weekday === 'Sun') return false;

  const openMins = SESSION_OPEN.hour * 60 + SESSION_OPEN.minute;
  const closeMins = SESSION_CLOSE.hour * 60 + SESSION_CLOSE.minute;
  return mins >= openMins && mins <= closeMins;
}

export const NSE_SESSION_LABEL = '09:15–15:30 IST';