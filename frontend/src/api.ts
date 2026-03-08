const BASE = '/api';

export async function fetchStats() {
  const res = await fetch(`${BASE}/stats`);
  return res.json();
}

export async function fetchOpportunities(params?: {
  type?: string;
  status?: string;
  sort_by?: string;
  limit?: number;
}) {
  const search = new URLSearchParams();
  if (params?.type) search.set('type', params.type);
  if (params?.status) search.set('status', params.status);
  if (params?.sort_by) search.set('sort_by', params.sort_by);
  if (params?.limit) search.set('limit', String(params.limit));
  const res = await fetch(`${BASE}/opportunities?${search}`);
  return res.json();
}

export async function fetchEventDetail(eventId: string) {
  const res = await fetch(`${BASE}/events/${eventId}`);
  return res.json();
}

export async function fetchMarketHistory(marketId: string, hours = 24) {
  const res = await fetch(`${BASE}/markets/${marketId}/history?hours=${hours}`);
  return res.json();
}

export async function triggerScan() {
  const res = await fetch(`${BASE}/scan`, { method: 'POST' });
  return res.json();
}
