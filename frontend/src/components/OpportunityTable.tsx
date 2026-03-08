import { memo } from 'react';
import type { Opportunity, Quality, OppDetails } from '../api';
import { getOppQuality, getRawEdge, getNetEdge, getProfit, getVolume, getLiquidity } from '../App';
import type { SortField, SortDir } from '../App';

interface Props {
  opportunities: Opportunity[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  sortField: SortField;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
}

const qualityBarColor: Record<Quality, string> = {
  high: '#3fb950',
  medium: '#d29922',
  low: '#da6d25',
  theoretical: 'transparent',
};

const typeLabels: Record<string, string> = {
  multi_outcome_arb: 'MULTI',
  tailing: 'TAIL',
  cross_exchange_arb: 'CROSS',
};

export function OpportunityTable({ opportunities, selectedId, onSelect, sortField, sortDir, onSort }: Props) {
  if (opportunities.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-text-secondary text-[13px]">
        No opportunities. Run a scan or adjust filters.
      </div>
    );
  }

  return (
    <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
      <colgroup>
        <col style={{ width: '3px' }} />
        <col style={{ width: '52px' }} />
        <col style={{ width: '68px' }} />
        <col />
        <col style={{ width: '72px' }} />
        <col style={{ width: '80px' }} />
        <col style={{ width: '72px' }} />
        <col style={{ width: '72px' }} />
        <col style={{ width: '72px' }} />
        <col style={{ width: '44px' }} />
        <col style={{ width: '28px' }} />
      </colgroup>
      <thead className="sticky top-0 z-10 bg-panel">
        <tr className="border-b border-border">
          <th />
          <ColHeader label="TYPE" />
          <ColHeader label="SOURCE" />
          <ColHeader label="TITLE" />
          <ColHeader label="RAW" field="raw_edge" align="right" sortField={sortField} sortDir={sortDir} onSort={onSort} />
          <ColHeader label="NET EDGE" field="net_edge" align="right" sortField={sortField} sortDir={sortDir} onSort={onSort} />
          <ColHeader label="PROFIT" field="profit" align="right" sortField={sortField} sortDir={sortDir} onSort={onSort} />
          <ColHeader label="VOL" field="volume" align="right" sortField={sortField} sortDir={sortDir} onSort={onSort} />
          <ColHeader label="LIQ" field="liquidity" align="right" sortField={sortField} sortDir={sortDir} onSort={onSort} />
          <ColHeader label="AGE" field="age" align="right" sortField={sortField} sortDir={sortDir} onSort={onSort} />
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
  sortField,
  sortDir,
  onSort,
}: {
  label: string;
  field?: SortField;
  align?: 'left' | 'right';
  sortField?: SortField;
  sortDir?: SortDir;
  onSort?: (f: SortField) => void;
}) {
  const isActive = field && sortField === field;
  const clickable = !!field && !!onSort;

  return (
    <th
      className={`h-[28px] px-2 text-[11px] font-medium tracking-[0.04em] uppercase text-text-secondary select-none whitespace-nowrap ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${clickable ? 'cursor-pointer hover:text-text-primary' : ''}`}
      onClick={clickable ? () => onSort!(field!) : undefined}
    >
      <span className={isActive ? 'text-text-primary' : ''}>
        {label}
        {isActive && (
          <span className="ml-0.5 text-[9px]">{sortDir === 'desc' ? '\u25BE' : '\u25B4'}</span>
        )}
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
  const quality = getOppQuality(d);
  const executable = isExecutable(d);
  const rawEdge = getRawEdge(d);
  const netEdge = getNetEdge(d);
  const profit = getProfit(d);
  const volume = getVolume(d);
  const liquidity = getLiquidity(d);

  const barColor = qualityBarColor[quality];
  const selectedBg = selected
    ? `rgba(${quality === 'high' ? '63,185,80' : quality === 'medium' ? '210,153,34' : quality === 'low' ? '218,109,37' : '110,118,129'}, 0.05)`
    : undefined;

  return (
    <tr
      className={`h-[32px] border-b border-border cursor-pointer transition-[background-color] duration-150 ${
        !executable ? 'opacity-40' : ''
      } ${selected ? '' : 'hover:bg-panel-raised'}`}
      style={{ backgroundColor: selectedBg }}
      onClick={() => onSelect(selected ? null : opp.id)}
    >
      {/* Quality bar */}
      <td className="p-0 relative">
        <div
          className="absolute inset-y-0 left-0"
          style={{
            width: selected ? '2px' : '3px',
            backgroundColor: barColor,
          }}
        />
      </td>

      {/* Type badge */}
      <td className="px-2">
        <TypeBadge type={opp.type} />
      </td>

      {/* Source badges */}
      <td className="px-2">
        <SourceBadges type={opp.type} />
      </td>

      {/* Title */}
      <td className="px-2 truncate text-[13px] text-text-primary">
        {getTitle(d)}
      </td>

      {/* Raw Edge */}
      <td className="px-2 text-right font-data tabular text-[11px] text-text-secondary">
        {rawEdge.toFixed(2)}%
      </td>

      {/* Net Edge */}
      <td className="px-2 text-right font-data tabular text-[13px] font-bold" style={{ color: edgeColor(netEdge) }}>
        {netEdge.toFixed(2)}%
      </td>

      {/* Profit */}
      <td className="px-2 text-right font-data tabular text-[11px] text-text-secondary">
        {profit > 0 ? `$${profit.toFixed(2)}` : '\u2014'}
      </td>

      {/* Volume */}
      <td className="px-2 text-right font-data tabular text-[11px] text-text-secondary">
        ${fmtNum(volume)}
      </td>

      {/* Liquidity */}
      <td className="px-2 text-right font-data tabular text-[11px]" style={{ color: liquidity < 2000 ? '#d29922' : '#8b949e' }}>
        ${fmtNum(liquidity)}
      </td>

      {/* Age */}
      <td className="px-2 text-right text-[10px] text-text-tertiary">
        {formatAge(opp.first_seen)}
      </td>

      {/* Link */}
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

function TypeBadge({ type }: { type: string }) {
  const label = typeLabels[type] || type;
  const colors: Record<string, string> = {
    multi_outcome_arb: 'color: #a78bfa; background: rgba(167,139,250,0.15)',
    tailing: 'color: #fbbf24; background: rgba(251,191,36,0.15)',
    cross_exchange_arb: 'color: #22d3ee; background: rgba(34,211,238,0.15)',
  };

  return (
    <span
      className="inline-block px-1 py-px text-[10px] font-semibold tracking-[0.04em] uppercase leading-none"
      style={{ ...parseStyle(colors[type] || ''), borderRadius: '2px' }}
    >
      {label}
    </span>
  );
}

function SourceBadges({ type }: { type: string }) {
  if (type === 'cross_exchange_arb') {
    return (
      <span className="flex items-center gap-0.5">
        <span className="text-[10px] font-semibold tracking-[0.04em] text-poly">P</span>
        <span className="text-text-tertiary text-[10px]">/</span>
        <span className="text-[10px] font-semibold tracking-[0.04em] text-kalshi">K</span>
      </span>
    );
  }
  if (type === 'tailing' || type === 'multi_outcome_arb') {
    return (
      <span className="text-[10px] font-semibold tracking-[0.04em] text-poly">POLY</span>
    );
  }
  return null;
}

function parseStyle(s: string): React.CSSProperties {
  const obj: any = {};
  for (const part of s.split(';')) {
    const [k, v] = part.split(':').map(x => x.trim());
    if (k && v) {
      const key = k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      obj[key] = v;
    }
  }
  return obj;
}

function getTitle(d: OppDetails): string {
  if (d.type === 'cross_exchange_arb') return d.event_title || d.poly_question || '';
  if (d.type === 'multi_outcome_arb') return d.event_title;
  return d.question || d.event_title;
}

function isExecutable(d: OppDetails): boolean {
  if ('executable' in d) return !!d.executable;
  if (d.type === 'cross_exchange_arb') return d.net_profit > 0;
  return false;
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
  if (d.type === 'cross_exchange_arb') {
    return `https://polymarket.com/event/${d.poly_event_id}`;
  }
  if ('slug' in d && d.slug) {
    return `https://polymarket.com/event/${d.slug}`;
  }
  return '#';
}
