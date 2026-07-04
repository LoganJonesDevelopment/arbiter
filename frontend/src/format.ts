export function cents(n: number): string {
  if (n >= 1) return `$${n.toFixed(4)}`;
  return `${(n * 100).toFixed(1)}¢`;
}

export function fmtNum(n: number): string {
  if (!n && n !== 0) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toFixed(0);
}

export function formatRelative(date: Date, nowMs: number = Date.now()): string {
  const diffMin = Math.floor((nowMs - date.getTime()) / 60000);
  if (diffMin < 1) return '<1m';
  if (diffMin < 60) return `${diffMin}m`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h`;
  return `${Math.floor(diffHrs / 24)}d`;
}
