const BASE = '/api';

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }
  return res.json();
}

export interface Stats {
  events: number;
  markets: number;
  polymarket_events: number;
  kalshi_events: number;
  active_opportunities: number;
  executable_opportunities: number;
  multi_outcome_opportunities: number;
  tailing_opportunities: number;
  cross_exchange_opportunities: number;
  last_scan: string | null;
}

export type OppType = 'multi_outcome_arb' | 'tailing' | 'cross_exchange_arb';
export type Quality = 'high' | 'medium' | 'low' | 'theoretical';

export interface MultiOutcomeMarket {
  market_id: string;
  question: string;
  yes_price: number;
  volume: number;
  liquidity: number;
}

export interface MultiOutcomeDetails {
  type: 'multi_outcome_arb';
  event_id: string;
  event_title: string;
  slug: string;
  category: string;
  direction: string;
  num_legs: number;
  total_markets: number;
  inactive_markets: number;
  is_complete: boolean;
  price_sum: number;
  raw_edge_pct: number;
  fee_adjusted_edge_pct: number;
  total_fees: number;
  profit_per_share: number;
  est_profit_at_100: number;
  trade_description: string;
  total_volume: number;
  min_liquidity: number;
  has_thin_leg: boolean;
  quality: Quality;
  executable: boolean;
  markets: MultiOutcomeMarket[];
}

export interface TailingDetails {
  type: 'tailing';
  event_id: string;
  event_title: string;
  slug: string;
  category: string;
  market_id: string;
  question: string;
  likely_outcome: string;
  price: number;
  raw_edge_pct: number;
  fee_adjusted_edge_pct: number;
  profit_per_share: number;
  est_profit_at_100: number;
  trade_description: string;
  volume: number;
  liquidity: number;
  momentum: string;
  price_move: number;
  quality: Quality;
  executable: boolean;
}

export interface CrossExchangeDetails {
  type: 'cross_exchange_arb';
  match_confidence: number;
  market_match_confidence?: number;
  event_title: string;
  slug: string;
  poly_event_id: string;
  kalshi_event_id: string;
  kalshi_ticker: string;
  poly_market_id: string;
  kalshi_market_id: string;
  poly_question: string;
  kalshi_question: string;
  buy_yes_exchange: string;
  buy_no_exchange: string;
  buy_yes_price: number;
  buy_no_price: number;
  poly_fee: number;
  kalshi_fee: number;
  total_fees: number;
  max_shares: number;
  strategy: string;
  total_cost: number;
  gross_profit: number;
  net_profit: number;
  edge_pct: number;
  poly_yes: number;
  poly_no: number;
  kalshi_yes: number;
  kalshi_no: number;
  poly_volume: number;
  kalshi_volume: number;
  poly_liquidity: number;
  kalshi_liquidity: number;
  quality?: Quality;
  executable?: boolean;
}

export type OppDetails = MultiOutcomeDetails | TailingDetails | CrossExchangeDetails;

export interface Opportunity {
  id: number;
  opp_key: string;
  type: OppType;
  event_id: string;
  edge_pct: number;
  details: OppDetails;
  action_summary: string;
  score: number;
  end_date: string | null;
  days_to_resolution: number | null;
  markets_involved: string[];
  first_seen: string;
  last_seen: string;
  status: string;
}

export interface OpportunitiesResponse {
  items: Opportunity[];
  total: number;
  offset: number;
  limit: number;
}

export async function fetchStats(): Promise<Stats> {
  return fetchJson(`${BASE}/stats`);
}

export async function fetchOpportunities(params?: {
  type?: string;
  status?: string;
  sort_by?: string;
  limit?: number;
  offset?: number;
  executable_only?: boolean;
  max_days?: number;
}): Promise<OpportunitiesResponse> {
  const search = new URLSearchParams();
  if (params?.type) search.set('type', params.type);
  if (params?.status) search.set('status', params.status);
  if (params?.sort_by) search.set('sort_by', params.sort_by);
  if (params?.limit) search.set('limit', String(params.limit));
  if (params?.offset) search.set('offset', String(params.offset));
  if (params?.executable_only !== undefined) search.set('executable_only', String(params.executable_only));
  if (params?.max_days) search.set('max_days', String(params.max_days));
  return fetchJson(`${BASE}/opportunities?${search}`);
}

export interface MarketData {
  id: string;
  question: string;
  outcomes: string[];
  outcome_prices: number[];
  volume: number;
  liquidity: number;
  active: boolean;
  closed: boolean;
}

export interface EventData {
  id: string;
  title: string;
  slug: string;
  category: string;
  neg_risk: boolean;
  markets_count: number;
  markets: MarketData[];
}

export async function fetchEventDetail(eventId: string): Promise<EventData> {
  return fetchJson(`${BASE}/events/${eventId}`);
}

export async function fetchMarketHistory(marketId: string, hours = 24) {
  return fetchJson(`${BASE}/markets/${marketId}/history?hours=${hours}`);
}

export async function triggerScan() {
  return fetchJson(`${BASE}/scan`, { method: 'POST' });
}
