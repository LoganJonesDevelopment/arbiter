import { memo } from 'react';
import type { Opportunity, OppDetails } from '../api';
import type { SortField } from '../App';

interface Props {
  opportunities: Opportunity[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  sortField: SortField;
  onSort: (field: SortField) => void;
}

const typeLabels: Record<string, string> = {
  multi_outcome_arb: 'MULTI',
  tailing: 'TAIL',
  cross_exchange_arb: 'CROSS',
};

export function OpportunityTable({ opportunities, selectedId, onSelect, sortField, onSort }: Props) {
  if (opportunities.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-text-secondary text-[13px]">
        No executable opportunities found. Uncheck "Executable only" to see all.
      </div>
    );
  }

  return (
    <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
      <colgroup>
        <col style={{ width: '3px' }} />
        <col style={{ width: '52px' }} />
        <col />
        <col style={{ width: '56px' }} />
        <col style={{ width: '72px' }} />
        <col style={{ width: '72px' }} />
        <col style={{ width: '72px' }} />
        <col style={{ width: '52px' }} />
        <col style={{ width: '44px' }} />
        <col style={{ width: '28px' }} />
      </colgroup>
      <thead className="sticky top-0 z-10 bg-panel">
        <tr className="border-b border-border">
          <th />
          <ColHeader label="TYPE" />
          <ColHeader label="ACTION" />
          <ColHeader label="SCORE" field="score" align="right" active={sortField === 'score'} onSort={onSort} />
          <ColHeader label="NET EDGE" field="net_edge" align="right" active={sortField === 'net_edge'} onSort={onSort} />
          <ColHeader label="PROFIT" field="profit" align="right" active={sortField === 'profit'} onSort={onSort} />
          <ColHeader label="LIQ" field="liquidity" align="right" active={sortField === 'liquidity'} onSort={onSort} />
          <ColHeader label="RESOLVES" align="right" />
          <ColHeader label="AGE" field="age" align="right" active={sortField === 'age'} onSort={onSort} />
          <th />
        </tr>
      </thead>
      <tbody>
        {opportunities.map((opp) => (
          <TableRow
            key={opp.id}
            opp={opp}
            selected={opp.id === selectedId}
            onSelect={onSelect}
          />
        ))}
      </tbody>
    </table>
  );
}

function ColHeader({
  label,
  field,
  align,
  active,
  onSort,
}: {
  label: string;
  field?: SortField;
  align?: 'left' | 'right';
  active?: boolean;
  onSort?: (f: SortField) => void;
}) {
  const clickable = !!field && !!onSort;

  return (
    <th
      className={`h-[28px] px-2 text-[11px] font-medium tracking-[0.04em] uppercase text-text-secondary select-none whitespace-nowrap ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${clickable ? 'cursor-pointer hover:text-text-primary' : ''}`}
      onClick={clickable ? () => onSort!(field!) : undefined}
    >
      <span className={active ? 'text-text-primary' : ''}>
        {label}
        {active && <span className="ml-0.5 text-[9px]">{'\u25BE'}</span>}
      </span>
    </th>
  );
}

const TableRow = memo(function TableRow({
  opp,
  selected,
  onSelect,
}: {
  opp: Opportunity;
  selected: boolean;
  onSelect: (id: number | null) => void;
}) {
  const d = opp.details;
  const quality = getQuality(d);
  const netEdge = getNetEdge(d);
  const profit = getProfit(d);
  const liquidity = getLiquidity(d);

  const barColor = qualityBarColor[quality] || 'transparent';
  const selectedBg = selected
    ? `rgba(${quality === 'high' ? '63,185,80' : quality === 'medium' ? '210,153,34' : '218,109,37'}, 0.05)`
    : undefined;

  return (
    <tr
      className={`h-[32px] border-b border-border cursor-pointer transition-[background-color] duration-150 ${
        selected ? '' : 'hover:bg-panel-raised'
      }`}
      style={{ backgroundColor: selectedBg }}
      onClick={() => onSelect(selected ? null : opp.id)}
    >
      <td className="p-0 relative">
        <div
          className="absolute inset-y-0 left-0"
          style={{ width: '3px', backgroundColor: barColor }}
        />
      </td>

      <td className="px-2">
        <TypeBadge type={opp.type} />
      </td>

      <td className="px-2 truncate text-[12px] text-text-secondary" title={opp.action_summary}>
        {opp.action_summary}
      </td>

      <td className="px-2 text-right font-data tabular text-[12px] font-bold" style={{ color: scoreColor(opp.score) }}>
        {opp.score > 0 ? opp.score.toFixed(1) : '\u2014'}
      </td>

      <td className="px-2 text-right font-data tabular text-[12px]" style={{ color: edgeColor(netEdge) }}>
        {netEdge.toFixed(2)}%
      </td>

      <td className="px-2 text-right font-data tabular text-[11px] text-text-secondary">
        {profit > 0 ? `$${profit.toFixed(2)}` : '\u2014'}
      </td>

      <td className="px-2 text-right font-data tabular text-[11px]" style={{ color: liquidity < 2000 ? '#d29922' : '#8b949e' }}>
        ${fmtNum(liquidity)}
      </td>

      <td className="px-2 text-right font-data tabular text-[10px]" style={{ color: resolvesColor(opp.days_to_resolution) }}>
        {formatDaysToRes(opp.days_to_resolution)}
      </td>

      <td className="px-2 text-right text-[10px] text-text-tertiary">
        {formatAge(opp.first_seen)}
      </td>

      <td className="px-1 text-center">
        <a
          href={getLinkUrl(opp)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-text-tertiary hover:text-text-link text-[11px]"
          title="Open on exchange"
        >
          &#x2197;
        </a>
      </td>
    </tr>
  );
});

const qualityBarColor: Record<string, string> = {
  high: '#3fb950',
  medium: '#d29922',
  low: '#da6d25',
  theoretical: 'transparent',
};

function TypeBadge({ type }: { type: string }) {
  const label = typeLabels[type] || type;
  const colors: Record<string, { color: string; bg: string }> = {
    multi_outcome_arb: { color: '#a78bfa', bg: 'rgba(167,139,250,0.15)' },
    tailing: { color: '#fbbf24', bg: 'rgba(251,191,36,0.15)' },
    cross_exchange_arb: { color: '#22d3ee', bg: 'rgba(34,211,238,0.15)' },
  };
  const c = colors[type] || { color: '#8b949e', bg: 'rgba(139,148,158,0.15)' };

  return (
    <span
      className="inline-block px-1 py-px text-[10px] font-semibold tracking-[0.04em] uppercase leading-none"
      style={{ color: c.color, background: c.bg, borderRadius: '2px' }}
    >
      {label}
    </span>
  );
}

function getQuality(d: OppDetails): string {
  if ('quality' in d && d.quality) return d.quality;
  if (d.type === 'cross_exchange_arb') {
    if (d.net_profit > 0.02) return 'high';
    if (d.net_profit > 0) return 'medium';
    return 'theoretical';
  }
  return 'theoretical';
}

function getNetEdge(d: OppDetails): number {
  if ('fee_adjusted_edge_pct' in d) return d.fee_adjusted_edge_pct;
  if (d.type === 'cross_exchange_arb') return d.edge_pct;
  return 0;
}

function getProfit(d: OppDetails): number {
  if ('est_profit_at_100' in d) return d.est_profit_at_100;
  if (d.type === 'cross_exchange_arb') return d.net_profit * (100 / d.total_cost);
  return 0;
}

function getLiquidity(d: OppDetails): number {
  if ('min_liquidity' in d) return d.min_liquidity;
  if ('liquidity' in d) return d.liquidity;
  if (d.type === 'cross_exchange_arb') return Math.min(d.poly_liquidity || 0, d.kalshi_liquidity || 0);
  return 0;
}

function scoreColor(score: number): string {
  if (score > 5) return '#3fb950';
  if (score > 1) return '#56d364';
  if (score > 0.1) return '#d29922';
  return '#484f58';
}

function edgeColor(edge: number): string {
  if (edge > 2) return '#3fb950';
  if (edge > 0) return '#d29922';
  return '#f85149';
}

function fmtNum(n: number): string {
  if (!n && n !== 0) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toFixed(0);
}

function formatDaysToRes(days: number | null): string {
  if (days === null || days === undefined) return '\u2014';
  if (days < 1) return '<1d';
  if (days < 30) return `${Math.round(days)}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

function resolvesColor(days: number | null): string {
  if (days === null || days === undefined) return '#484f58';
  if (days <= 7) return '#3fb950';
  if (days <= 30) return '#d29922';
  if (days <= 90) return '#8b949e';
  return '#484f58';
}

function formatAge(iso: string): string {
  const d = new Date(iso + 'Z');
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return '<1m';
  if (diffMin < 60) return `${diffMin}m`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h`;
  return `${Math.floor(diffHrs / 24)}d`;
}

function getLinkUrl(opp: Opportunity): string {
  const d = opp.details;
  if ('slug' in d && d.slug) {
    return `https://polymarket.com/event/${d.slug}`;
  }
  return '#';
}
