const BASE = '/api';

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function fetchStats() {
  return fetchJson(`${BASE}/stats`);
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
  return fetchJson(`${BASE}/opportunities?${search}`);
}

export async function fetchEventDetail(eventId: string) {
  return fetchJson(`${BASE}/events/${eventId}`);
}

export async function fetchMarketHistory(marketId: string, hours = 24) {
  return fetchJson(`${BASE}/markets/${marketId}/history?hours=${hours}`);
}

export async function triggerScan() {
  return fetchJson(`${BASE}/scan`, { method: 'POST' });
}
