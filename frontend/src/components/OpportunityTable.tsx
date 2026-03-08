import type { Opportunity, OppDetails, MultiOutcomeDetails, TailingDetails, CrossExchangeDetails, Quality } from '../api';

interface Props {
  opportunities: Opportunity[];
  onSelectEvent: (eventId: string) => void;
}

const qualityConfig: Record<Quality, { border: string; bg: string; text: string; label: string }> = {
  high: { border: 'border-profit/40', bg: 'bg-profit/10', text: 'text-profit', label: 'HIGH' },
  medium: { border: 'border-warn/40', bg: 'bg-warn/10', text: 'text-warn', label: 'MED' },
  low: { border: 'border-orange-500/40', bg: 'bg-orange-500/10', text: 'text-orange-400', label: 'LOW' },
  theoretical: { border: 'border-muted/40', bg: 'bg-muted/10', text: 'text-muted', label: 'THEO' },
};

const typeConfig: Record<string, { label: string; color: string; bg: string }> = {
  multi_outcome_arb: { label: 'MULTI', color: 'text-purple-400', bg: 'bg-purple-500/15' },
  tailing: { label: 'TAIL', color: 'text-amber-400', bg: 'bg-amber-500/15' },
  cross_exchange_arb: { label: 'CROSS', color: 'text-cyan-400', bg: 'bg-cyan-500/15' },
};

const momentumConfig: Record<string, { text: string; color: string }> = {
  surging: { text: 'SURGING', color: 'text-profit' },
  drifting_up: { text: 'DRIFT UP', color: 'text-green-600' },
  stable: { text: 'STABLE', color: 'text-muted' },
  pulling_back: { text: 'PULLBACK', color: 'text-loss' },
};

export function OpportunityTable({ opportunities, onSelectEvent }: Props) {
  if (opportunities.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-muted text-sm border border-border rounded-lg bg-panel">
        No opportunities. Run a scan or adjust filters.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {opportunities.map((opp) => (
        <OpportunityRow key={opp.id} opp={opp} onSelectEvent={onSelectEvent} />
      ))}
    </div>
  );
}

function OpportunityRow({ opp, onSelectEvent }: { opp: Opportunity; onSelectEvent: (id: string) => void }) {
  const d = opp.details;
  const quality = getQuality(d);
  const qc = qualityConfig[quality];
  const tc = typeConfig[opp.type] || typeConfig.tailing;
  const executable = isExecutable(d);

  return (
    <div className={`bg-panel border rounded-lg overflow-hidden transition-all ${
      executable ? `${qc.border} hover:border-opacity-80` : 'border-border opacity-50 hover:opacity-70'
    }`}>
      <div className="flex items-stretch">
        {/* Edge indicator bar */}
        <div className={`w-1 shrink-0 ${
          quality === 'high' ? 'bg-profit' :
          quality === 'medium' ? 'bg-warn' :
          quality === 'low' ? 'bg-orange-500' :
          'bg-muted/30'
        }`} />

        <div className="flex-1 min-w-0 p-3">
          {/* Top row: badges + title + edge */}
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider ${tc.bg} ${tc.color}`}>
                  {tc.label}
                </span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider ${qc.bg} ${qc.text}`}>
                  {qc.label}
                </span>
                {opp.type === 'cross_exchange_arb' && (
                  <>
                    <SourceBadge source="polymarket" />
                    <span className="text-muted text-[10px]">/</span>
                    <SourceBadge source="kalshi" />
                  </>
                )}
                {opp.type === 'multi_outcome_arb' && (
                  <SourceBadge source="polymarket" />
                )}
                {opp.type === 'tailing' && (
                  <SourceBadge source="polymarket" />
                )}
                {opp.type === 'multi_outcome_arb' && renderMultiBadges(d as MultiOutcomeDetails)}
                {opp.type === 'tailing' && renderTailingBadges(d as TailingDetails)}
                {opp.type === 'cross_exchange_arb' && renderCrossBadges(d as CrossExchangeDetails)}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onSelectEvent(opp.event_id)}
                  className="text-left cursor-pointer text-sm font-medium text-text hover:text-blue-400 truncate"
                >
                  {getTitle(d)}
                </button>
                {renderVerifyLinks(opp)}
              </div>
            </div>

            {/* Edge display */}
            <div className="text-right shrink-0 tabular-nums">
              <div className="flex items-baseline gap-1.5 justify-end">
                <span className="text-[10px] text-muted uppercase">raw</span>
                <span className="text-xs text-text-dim">
                  {getRawEdge(d).toFixed(2)}%
                </span>
              </div>
              <div className={`text-lg font-bold leading-tight ${edgeColor(getNetEdge(d))}`}>
                {getNetEdge(d).toFixed(2)}%
              </div>
              {executable && getProfit(d) > 0 && (
                <div className="text-[10px] text-text-dim">
                  ~${getProfit(d).toFixed(2)}/100
                </div>
              )}
            </div>
          </div>

          {/* Strategy/trade description */}
          <div className={`rounded px-2.5 py-1.5 text-xs mb-2 ${
            executable ? 'bg-panel-lighter text-text-dim' : 'bg-loss/5 text-muted'
          }`}>
            {getTradeDesc(d)}
          </div>

          {/* Stats row */}
          <div className="flex gap-4 text-[11px] text-muted flex-wrap tabular-nums">
            {opp.type === 'multi_outcome_arb' && renderMultiStats(d as MultiOutcomeDetails)}
            {opp.type === 'tailing' && renderTailingStats(d as TailingDetails)}
            {opp.type === 'cross_exchange_arb' && renderCrossStats(d as CrossExchangeDetails)}
            <Stat label="seen" value={formatAge(opp.first_seen)} />
          </div>
        </div>
      </div>
    </div>
  );
}

function SourceBadge({ source }: { source: 'polymarket' | 'kalshi' }) {
  if (source === 'polymarket') {
    return (
      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider bg-poly/15 text-poly">
        POLY
      </span>
    );
  }
  return (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider bg-kalshi/15 text-kalshi">
      KALSHI
    </span>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <span className="text-muted/60">{label} </span>
      <span className={warn ? 'text-orange-400' : 'text-text-dim'}>{value}</span>
    </div>
  );
}

function renderMultiBadges(d: MultiOutcomeDetails) {
  return (
    <>
      {!d.is_complete && (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-loss/15 text-loss">
          {d.inactive_markets} UNLISTED
        </span>
      )}
      {d.is_complete && (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/15 text-blue-400">
          COMPLETE
        </span>
      )}
    </>
  );
}

function renderTailingBadges(d: TailingDetails) {
  const mc = momentumConfig[d.momentum];
  if (!mc || d.momentum === 'stable') return null;
  return (
    <span className={`text-[10px] font-bold ${mc.color}`}>
      {mc.text}
    </span>
  );
}

function renderCrossBadges(d: CrossExchangeDetails) {
  return (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-panel-lighter text-text-dim">
      {(d.match_confidence * 100).toFixed(0)}% match
    </span>
  );
}

function renderVerifyLinks(opp: Opportunity) {
  const d = opp.details;

  if (opp.type === 'cross_exchange_arb') {
    const cd = d as CrossExchangeDetails;
    return (
      <div className="flex items-center gap-2 shrink-0">
        <a
          href={`https://polymarket.com/event/${cd.poly_event_id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-poly/60 hover:text-poly"
        >
          poly
        </a>
        <a
          href={`https://kalshi.com/markets/${cd.kalshi_market_id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-kalshi/60 hover:text-kalshi"
        >
          kalshi
        </a>
      </div>
    );
  }

  const slug = (d as MultiOutcomeDetails | TailingDetails).slug;
  if (!slug) return null;

  return (
    <a
      href={`https://polymarket.com/event/${slug}`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[10px] text-poly/60 hover:text-poly shrink-0"
    >
      verify
    </a>
  );
}

function renderMultiStats(d: MultiOutcomeDetails) {
  return (
    <>
      <Stat label="legs" value={`${d.num_legs}${!d.is_complete ? `/${d.total_markets}` : ''}`} />
      <Stat label="sum" value={`$${d.price_sum.toFixed(4)}`} />
      <Stat label="vol" value={`$${fmtNum(d.total_volume)}`} />
      <Stat label="min liq" value={`$${fmtNum(d.min_liquidity)}`} warn={d.min_liquidity < 2000} />
      {d.has_thin_leg && <span className="text-orange-400">thin leg</span>}
    </>
  );
}

function renderTailingStats(d: TailingDetails) {
  return (
    <>
      <Stat label="price" value={`${d.likely_outcome} @ ${(d.price * 100).toFixed(1)}c`} />
      {d.price_move !== 0 && (
        <div>
          <span className="text-muted/60">move </span>
          <span className={d.price_move > 0 ? 'text-profit' : 'text-loss'}>
            {d.price_move > 0 ? '+' : ''}{(d.price_move * 100).toFixed(1)}c
          </span>
        </div>
      )}
      <Stat label="vol" value={`$${fmtNum(d.volume)}`} />
      <Stat label="liq" value={`$${fmtNum(d.liquidity)}`} warn={d.liquidity < 2000} />
    </>
  );
}

function renderCrossStats(d: CrossExchangeDetails) {
  return (
    <>
      <div>
        <span className="text-poly/60">P </span>
        <span className="text-text-dim">Y:{(d.poly_yes * 100).toFixed(1)}c N:{(d.poly_no * 100).toFixed(1)}c</span>
      </div>
      <div>
        <span className="text-kalshi/60">K </span>
        <span className="text-text-dim">Y:{(d.kalshi_yes * 100).toFixed(1)}c N:{(d.kalshi_no * 100).toFixed(1)}c</span>
      </div>
      <Stat label="cost" value={`$${d.total_cost.toFixed(4)}`} />
      <Stat label="net" value={`$${d.net_profit.toFixed(4)}`} />
      <Stat label="p.vol" value={`$${fmtNum(d.poly_volume)}`} />
      <Stat label="k.vol" value={`$${fmtNum(d.kalshi_volume)}`} />
    </>
  );
}

function getTitle(d: OppDetails): string {
  if (d.type === 'cross_exchange_arb') return d.event_title || d.poly_question || '';
  if (d.type === 'multi_outcome_arb') return d.event_title;
  return d.question || d.event_title;
}

function getQuality(d: OppDetails): Quality {
  if ('quality' in d && d.quality) return d.quality;
  if (d.type === 'cross_exchange_arb') {
    if (d.net_profit > 0.02) return 'high';
    if (d.net_profit > 0) return 'medium';
    return 'theoretical';
  }
  return 'theoretical';
}

function isExecutable(d: OppDetails): boolean {
  if ('executable' in d) return !!d.executable;
  if (d.type === 'cross_exchange_arb') return d.net_profit > 0;
  return false;
}

function getRawEdge(d: OppDetails): number {
  if ('raw_edge_pct' in d) return d.raw_edge_pct;
  if (d.type === 'cross_exchange_arb') return ((d.gross_profit / d.total_cost) * 100);
  return 0;
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

function getTradeDesc(d: OppDetails): string {
  if ('trade_description' in d) return d.trade_description;
  if (d.type === 'cross_exchange_arb') return d.strategy;
  return '';
}

function edgeColor(edge: number): string {
  if (edge > 2) return 'text-profit';
  if (edge > 0) return 'text-warn';
  return 'text-loss';
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
