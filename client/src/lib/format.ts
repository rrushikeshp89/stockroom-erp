const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const money0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const number = new Intl.NumberFormat('en-US');

export const fmtMoney = (n?: number | null) => (n == null ? '—' : money.format(n));
export const fmtMoney0 = (n?: number | null) => (n == null ? '—' : money0.format(n));
export const fmtNum = (n?: number | null) => (n == null ? '—' : number.format(n));
export const fmtPct = (n?: number | null, digits = 1) => (n == null ? '—' : `${(n * 100).toFixed(digits)}%`);

export function fmtCompactMoney(n?: number | null) {
  if (n == null) return '—';
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`;
  return money0.format(n);
}

export function fmtDate(iso?: string | null, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) {
  if (!iso) return '—';
  const d = iso.length === 10 ? new Date(`${iso}T12:00:00`) : new Date(iso);
  return d.toLocaleDateString('en-US', opts);
}

export const fmtDateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

export function timeAgo(iso?: string | null) {
  if (!iso) return '—';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return fmtDate(iso);
}

export function relativeDay(date?: string | null) {
  if (!date) return '—';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(`${date.slice(0, 10)}T00:00:00`);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return fmtDate(date);
}

export const initials = (name?: string | null) =>
  (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
