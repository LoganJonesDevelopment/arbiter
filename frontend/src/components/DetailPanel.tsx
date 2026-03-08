import { useEffect, useState } from 'react';
import { fetchEventDetail } from '../api';
import type { Opportunity, EventData, MarketData, MultiOutcomeDetails, TailingDetails, CrossExchangeDetails } from '../api';

interface Props {
  opportunity: Opportunity;
  onClose: () => void;
}

export function DetailPanel({ opportunity, onClose }: Props) {
  const d = opportunity.details;
  const eventId = opportunity.event_id;

  const [event, setEvent] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setEvent(null);
    fetchEventDetail(eventId)
      .then(setEvent)
      .finally(() => setLoading(false));
  }, [eventId]);

  return (
    <div className="h-full flex flex-col">
      {/* Panel header */}
      <div className="h-[40px] shrink-0 border-b border-border flex items-center justify-between px-4">
        <span className="text-[13px] font-semibold text-text-primary truncate mr-2">
          {getTitle(d)}
        </span>
        <button
          onClick={onClose}
          className="text-text-tertiary hover:text-text-primary cursor-pointer text-[14px] leading-none shrink-0 w-[24px] h-[24px] flex items-center justify-center"
        >
          &#x2715;
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {/* Platform links */}
        <div className="flex items-center gap-3 mb-4 text-[11px]">
          {d.type === 'cross_exchange_arb' ? (
            <>
              <a
                href={`https://polymarket.com/event/${d.poly_event_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-poly hover:underline"
              >
                Polymarket
              </a>
              <a
                href={`https://kalshi.com/markets/${d.kalshi_market_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-kalshi hover:underline"
              >
                Kalshi
              </a>
            </>
          ) : (
            <>
              {('slug' in d && d.slug) && (
                <a
                  href={`https://polymarket.com/event/${d.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-poly hover:underline"
                >
                  Polymarket
                </a>
              )}
            </>
          )}
          {event && event.category && (
            <span className="text-text-tertiary">{event.category}</span>
          )}
        </div>

        {/* Trade description */}
        <div className="bg-panel-inset border border-border p-3 mb-4 text-[12px] text-text-secondary leading-relaxed">
          {getTradeDesc(d)}
        </div>

        {/* Opportunity-specific details */}
        {d.type === 'multi_outcome_arb' && <MultiDetails d={d} />}
        {d.type === 'tailing' && <TailingDetailSection d={d} />}
        {d.type === 'cross_exchange_arb' && <CrossDetails d={d} />}

        {/* Price sum bar for multi-outcome events */}
        {event && event.markets.length > 1 && (
          <PriceSumBar markets={event.markets} />
        )}

        {/* Market list */}
        {loading && (
          <div className="text-text-tertiary text-[11px] py-4">Loading markets...</div>
        )}
        {event && event.markets.length > 0 && (
          <div className="mt-4">
            <div className="text-[11px] font-medium uppercase tracking-[0.04em] text-text-secondary mb-2">
              Markets ({event.markets.length})
            </div>
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="border-b border-border text-text-tertiary">
                  <th className="text-left py-1 px-1 font-medium">Question</th>
                  <th className="text-right py-1 px-1 font-medium w-[52px]">YES</th>
                  <th className="text-right py-1 px-1 font-medium w-[52px]">NO</th>
                  <th className="text-right py-1 px-1 font-medium w-[60px]">Vol</th>
                  <th className="text-right py-1 px-1 font-medium w-[52px]">Liq</th>
                </tr>
              </thead>
              <tbody>
                {event.markets.map((m) => (
                  <MarketRow key={m.id} market={m} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function MultiDetails({ d }: { d: MultiOutcomeDetails }) {
  return (
    <div className="grid grid-cols-3 gap-x-4 gap-y-2 mb-4 text-[11px]">
      <DataPoint label="Legs" value={`${d.num_legs}/${d.total_markets}`} />
      <DataPoint label="Price Sum" value={d.price_sum.toFixed(4)} />
      <DataPoint label="Direction" value={d.direction.toUpperCase()} />
      <DataPoint label="Raw Edge" value={`${d.raw_edge_pct.toFixed(2)}%`} />
      <DataPoint label="Net Edge" value={`${d.fee_adjusted_edge_pct.toFixed(2)}%`} highlight />
      <DataPoint label="Fees" value={`$${d.total_fees.toFixed(4)}`} />
      <DataPoint label="Volume" value={`$${fmtNum(d.total_volume)}`} />
      <DataPoint label="Min Liq" value={`$${fmtNum(d.min_liquidity)}`} warn={d.min_liquidity < 2000} />
      <DataPoint label="Profit/100" value={`$${d.est_profit_at_100.toFixed(2)}`} highlight />
      {!d.is_complete && (
        <div className="col-span-3 text-negative text-[10px] font-semibold">
          {d.inactive_markets} UNLISTED MARKET{d.inactive_markets > 1 ? 'S' : ''}
        </div>
      )}
      {d.has_thin_leg && (
        <div className="col-span-3 text-caution text-[10px] font-semibold">
          THIN LIQUIDITY LEG
        </div>
      )}
    </div>
  );
}

function TailingDetailSection({ d }: { d: TailingDetails }) {
  return (
    <div className="grid grid-cols-3 gap-x-4 gap-y-2 mb-4 text-[11px]">
      <DataPoint label="Outcome" value={d.likely_outcome} />
      <DataPoint label="Price" value={`${(d.price * 100).toFixed(1)}c`} />
      <DataPoint label="Momentum" value={d.momentum.toUpperCase()} />
      <DataPoint label="Raw Edge" value={`${d.raw_edge_pct.toFixed(2)}%`} />
      <DataPoint label="Net Edge" value={`${d.fee_adjusted_edge_pct.toFixed(2)}%`} highlight />
      <DataPoint label="Price Move" value={`${d.price_move > 0 ? '+' : ''}${(d.price_move * 100).toFixed(1)}c`} />
      <DataPoint label="Volume" value={`$${fmtNum(d.volume)}`} />
      <DataPoint label="Liquidity" value={`$${fmtNum(d.liquidity)}`} warn={d.liquidity < 2000} />
      <DataPoint label="Profit/100" value={`$${d.est_profit_at_100.toFixed(2)}`} highlight />
    </div>
  );
}

function CrossDetails({ d }: { d: CrossExchangeDetails }) {
  return (
    <div className="mb-4">
      <div className="grid grid-cols-3 gap-x-4 gap-y-2 text-[11px] mb-3">
        <DataPoint label="Match" value={`${(d.match_confidence * 100).toFixed(0)}%`} />
        <DataPoint label="Cost" value={`$${d.total_cost.toFixed(4)}`} />
        <DataPoint label="Net Profit" value={`$${d.net_profit.toFixed(4)}`} highlight />
        <DataPoint label="Edge" value={`${d.edge_pct.toFixed(2)}%`} highlight />
        <DataPoint label="P Vol" value={`$${fmtNum(d.poly_volume)}`} />
        <DataPoint label="K Vol" value={`$${fmtNum(d.kalshi_volume)}`} />
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="bg-panel-inset border border-border p-2">
          <div className="text-poly text-[10px] font-semibold mb-1">POLYMARKET</div>
          <div className="font-data tabular text-text-secondary">
            YES {(d.poly_yes * 100).toFixed(1)}c &nbsp; NO {(d.poly_no * 100).toFixed(1)}c
          </div>
        </div>
        <div className="bg-panel-inset border border-border p-2">
          <div className="text-kalshi text-[10px] font-semibold mb-1">KALSHI</div>
          <div className="font-data tabular text-text-secondary">
            YES {(d.kalshi_yes * 100).toFixed(1)}c &nbsp; NO {(d.kalshi_no * 100).toFixed(1)}c
          </div>
        </div>
      </div>
    </div>
  );
}

function DataPoint({ label, value, highlight, warn }: { label: string; value: string; highlight?: boolean; warn?: boolean }) {
  let valueColor = 'text-text-secondary';
  if (highlight) valueColor = 'text-text-primary';
  if (warn) valueColor = 'text-caution';

  return (
    <div>
      <div className="text-text-tertiary text-[10px] uppercase tracking-[0.02em]">{label}</div>
      <div className={`font-data tabular ${valueColor}`}>{value}</div>
    </div>
  );
}

function PriceSumBar({ markets }: { markets: MarketData[] }) {
  const priceSum = markets.reduce((sum, m) => sum + (m.outcome_prices?.[0] ?? 0), 0);
  const deviation = priceSum - 1.0;

  return (
    <div className="bg-panel-inset border border-border p-3 mt-4">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] text-text-tertiary uppercase tracking-[0.02em]">YES Price Sum</span>
        <div className="flex items-baseline gap-2">
          <span className={`text-[16px] font-bold font-data tabular ${
            Math.abs(deviation) > 0.01 ? 'text-caution' : 'text-positive'
          }`}>
            {priceSum.toFixed(4)}
          </span>
          <span className={`text-[11px] font-data tabular ${deviation > 0 ? 'text-negative' : 'text-positive'}`}>
            {deviation >= 0 ? '+' : ''}{(deviation * 100).toFixed(2)}%
          </span>
        </div>
      </div>
    </div>
  );
}

function MarketRow({ market }: { market: MarketData }) {
  const yesPrice = market.outcome_prices?.[0] ?? 0;
  const noPrice = market.outcome_prices?.[1] ?? 0;

  return (
    <tr className="border-b border-border hover:bg-panel-raised">
      <td className="py-1 px-1 text-text-primary truncate max-w-0">{market.question}</td>
      <td className="py-1 px-1 text-right font-data tabular text-positive">{(yesPrice * 100).toFixed(1)}c</td>
      <td className="py-1 px-1 text-right font-data tabular text-negative">{(noPrice * 100).toFixed(1)}c</td>
      <td className="py-1 px-1 text-right font-data tabular text-text-secondary">${fmtNum(market.volume)}</td>
      <td className="py-1 px-1 text-right font-data tabular text-text-secondary">${fmtNum(market.liquidity)}</td>
    </tr>
  );
}

function getTitle(d: any): string {
  if (d.type === 'cross_exchange_arb') return d.event_title || d.poly_question || '';
  if (d.type === 'multi_outcome_arb') return d.event_title;
  return d.question || d.event_title;
}

function getTradeDesc(d: any): string {
  if ('trade_description' in d) return d.trade_description;
  if (d.type === 'cross_exchange_arb') return d.strategy;
  return '';
}

function fmtNum(n: number): string {
  if (!n && n !== 0) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toFixed(0);
}
