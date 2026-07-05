import type { Opportunity, OpportunitiesResponse, Stats } from '../api';
import statsRaw from './stats.json?raw';
import opportunitiesRaw from './opportunities.json?raw';

const stats = JSON.parse(statsRaw) as Stats;
const opportunities = JSON.parse(opportunitiesRaw) as Opportunity[];

export function getStats(): Stats {
  return stats;
}

export interface OpportunityQuery {
  type?: string;
  status?: string;
  sort_by?: string;
  limit?: number;
  offset?: number;
  executable_only?: boolean;
  max_days?: number;
}

export function queryOpportunities(params?: OpportunityQuery): OpportunitiesResponse {
  const status = params?.status ?? 'active';
  const executableOnly = params?.executable_only ?? true;
  const limit = Math.min(Math.max(params?.limit ?? 50, 1), 200);
  const offset = Math.max(params?.offset ?? 0, 0);

  let rows = opportunities.filter((o) => o.status === status);
  if (params?.type) {
    rows = rows.filter((o) => o.type === params.type);
  }
  if (executableOnly) {
    rows = rows.filter((o) => o.details.executable === true);
  }
  if (params?.max_days !== undefined) {
    const cutoff = Date.now() + params.max_days * 86_400_000;
    rows = rows.filter((o) => o.end_date !== null && Date.parse(o.end_date) <= cutoff);
  }

  const total = rows.length;
  const sortBy = params?.sort_by ?? 'score';
  const sorted = [...rows];
  if (sortBy === 'first_seen' || sortBy === 'last_seen') {
    sorted.sort((a, b) => Date.parse(b[sortBy]) - Date.parse(a[sortBy]));
  } else if (sortBy === 'edge') {
    sorted.sort((a, b) => b.edge_pct - a.edge_pct);
  } else {
    sorted.sort((a, b) => (b.score - a.score) || (b.edge_pct - a.edge_pct));
  }

  return {
    items: sorted.slice(offset, offset + limit),
    total,
    offset,
    limit,
  };
}

export function scanResponse() {
  return { status: 'demo mode: scanning disabled' };
}
