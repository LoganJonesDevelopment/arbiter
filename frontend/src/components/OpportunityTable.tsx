interface Opportunity {
  id: number;
  type: string;
  edge_pct: number;
  details: any;
  first_seen: string;
  last_seen: string;
  status: string;
}

interface Props {
  opportunities: Opportunity[];
  onSelectEvent: (eventId: string) => void;
}

const qualityColors: Record<string, string> = {
  high: 'bg-green-900/50 text-green-300 border-green-700',
  medium: 'bg-yellow-900/50 text-yellow-300 border-yellow-700',
  low: 'bg-orange-900/50 text-orange-300 border-orange-700',
  theoretical: 'bg-gray-800/50 text-gray-500 border-gray-700',
};

const momentumLabels: Record<string, { text: string; color: string }> = {
  surging: { text: 'SURGING', color: 'text-green-400' },
  drifting_up: { text: 'Drifting up', color: 'text-green-600' },
  stable: { text: 'Stable', color: 'text-gray-500' },
  pulling_back: { text: 'Pulling back', color: 'text-red-400' },
};

export function OpportunityTable({ opportunities, onSelectEvent }: Props) {
  if (opportunities.length === 0) {
    return (
      <div className="text-center text-gray-500 py-12">
        No opportunities found. Run a scan or adjust filters.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {opportunities.map((opp) => (
        <OpportunityCard
          key={opp.id}
          opp={opp}
          onSelectEvent={onSelectEvent}
        />
      ))}
    </div>
  );
}

function OpportunityCard({
  opp,
  onSelectEvent,
}: {
  opp: Opportunity;
  onSelectEvent: (eventId: string) => void;
}) {
  const d = opp.details;
  const isMulti = opp.type === 'multi_outcome_arb';

  const title = isMulti ? d.event_title : d.question;
  const quality = d.quality || 'theoretical';
  const qColor = qualityColors[quality] || qualityColors.theoretical;

  return (
    <div className={`bg-gray-900 border rounded-lg p-4 ${
      d.executable ? 'border-gray-800' : 'border-gray-800/50 opacity-60'
    }`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {isMulti ? (
              <span className="shrink-0 px-2 py-0.5 rounded text-xs font-medium bg-purple-900/50 text-purple-300 border border-purple-700">
                Multi-Outcome
              </span>
            ) : (
              <span className="shrink-0 px-2 py-0.5 rounded text-xs font-medium bg-amber-900/50 text-amber-300 border border-amber-700">
                Tailing
              </span>
            )}
            <span className={`shrink-0 px-2 py-0.5 rounded text-xs font-medium border ${qColor}`}>
              {quality}
            </span>
            {isMulti && !d.is_complete && (
              <span className="shrink-0 px-2 py-0.5 rounded text-xs font-medium bg-red-900/50 text-red-300 border border-red-700">
                {d.inactive_markets} unlisted slots
              </span>
            )}
            {isMulti && d.is_complete && (
              <span className="shrink-0 px-2 py-0.5 rounded text-xs font-medium bg-blue-900/50 text-blue-300 border border-blue-700">
                complete
              </span>
            )}
            {d.category && (
              <span className="text-xs text-gray-600">{d.category}</span>
            )}
            {!isMulti && d.momentum && d.momentum !== 'stable' && (
              <span className={`text-xs font-medium ${momentumLabels[d.momentum]?.color || ''}`}>
                {momentumLabels[d.momentum]?.text}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onSelectEvent(d.event_id)}
              className="text-blue-400 hover:text-blue-300 text-left cursor-pointer font-medium text-sm"
            >
              {title}
            </button>
            {d.slug && (
              <a
                href={`https://polymarket.com/event/${d.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-gray-600 hover:text-gray-400 text-xs"
              >
                verify &rarr;
              </a>
            )}
          </div>
        </div>

        {/* Edge + profit summary */}
        <div className="text-right shrink-0">
          <div className="flex items-baseline gap-2 justify-end">
            <span className="text-xs text-gray-500">raw</span>
            <span className="font-mono text-gray-400 text-sm">
              {d.raw_edge_pct?.toFixed(2)}%
            </span>
            <span className="text-xs text-gray-500">net</span>
            <span className={`font-mono font-bold text-lg ${
              d.fee_adjusted_edge_pct > 2 ? 'text-green-400' :
              d.fee_adjusted_edge_pct > 0 ? 'text-yellow-400' :
              'text-red-400'
            }`}>
              {d.fee_adjusted_edge_pct?.toFixed(2)}%
            </span>
          </div>
          {d.executable && d.est_profit_at_100 != null && (
            <div className="text-xs text-gray-500 mt-0.5">
              ~${d.est_profit_at_100.toFixed(2)} profit per $100
            </div>
          )}
        </div>
      </div>

      {/* Trade description */}
      <div className={`rounded px-3 py-2 mb-3 text-sm font-mono ${
        d.executable
          ? 'bg-gray-950 text-gray-300'
          : 'bg-red-950/30 text-gray-400'
      }`}>
        {d.trade_description}
      </div>

      {/* Stats row */}
      <div className="flex gap-6 text-xs text-gray-500 flex-wrap">
        <div>
          <span className="text-gray-600">Volume: </span>
          <span className="text-gray-400 font-mono">
            ${formatNumber(isMulti ? d.total_volume : d.volume)}
          </span>
        </div>
        <div>
          <span className="text-gray-600">{isMulti ? 'Min liq: ' : 'Liquidity: '}</span>
          <span className={`font-mono ${
            (isMulti ? d.min_liquidity : d.liquidity) > 2000 ? 'text-gray-400' : 'text-orange-400'
          }`}>
            ${formatNumber(isMulti ? d.min_liquidity : d.liquidity)}
          </span>
        </div>
        {isMulti && (
          <>
            <div>
              <span className="text-gray-600">Active legs: </span>
              <span className="text-gray-400">{d.num_legs}</span>
              {!d.is_complete && (
                <span className="text-red-400"> / {d.total_markets} total</span>
              )}
            </div>
            <div>
              <span className="text-gray-600">Sum: </span>
              <span className="text-gray-400 font-mono">${d.price_sum}</span>
            </div>
          </>
        )}
        {!isMulti && (
          <>
            <div>
              <span className="text-gray-600">Price: </span>
              <span className="text-gray-400 font-mono">{d.likely_outcome} @ {(d.price * 100).toFixed(1)}%</span>
            </div>
            {d.price_move !== 0 && (
              <div>
                <span className="text-gray-600">Move: </span>
                <span className={`font-mono ${d.price_move > 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {d.price_move > 0 ? '+' : ''}{(d.price_move * 100).toFixed(1)}%
                </span>
              </div>
            )}
          </>
        )}
        {d.has_thin_leg && (
          <span className="text-orange-400">thin liquidity on some legs</span>
        )}
      </div>
    </div>
  );
}

function formatNumber(n: number): string {
  if (!n && n !== 0) return '$0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toFixed(0);
}
