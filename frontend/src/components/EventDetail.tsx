import { useEffect, useState } from 'react';
import { fetchEventDetail } from '../api';
import type { EventData, MarketData } from '../api';

export function EventDetail({ eventId }: { eventId: string }) {
  const [event, setEvent] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchEventDetail(eventId)
      .then(setEvent)
      .finally(() => setLoading(false));
  }, [eventId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted text-sm">
        Loading event data...
      </div>
    );
  }
  if (!event) {
    return (
      <div className="flex items-center justify-center h-48 text-loss text-sm">
        Event not found
      </div>
    );
  }

  const priceSum = event.markets.reduce((sum, m) => sum + (m.outcome_prices?.[0] ?? 0), 0);
  const deviation = priceSum - 1.0;

  return (
    <div>
      <h2 className="text-lg font-bold mb-1 text-text">{event.title}</h2>
      <div className="flex gap-3 text-xs text-muted mb-5">
        {event.category && <span className="text-text-dim">{event.category}</span>}
        <span>{event.markets_count} markets</span>
        {event.neg_risk && <span className="text-purple-400">neg-risk</span>}
        {event.slug && (
          <a
            href={`https://polymarket.com/event/${event.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-poly/70 hover:text-poly"
          >
            Polymarket
          </a>
        )}
      </div>

      {event.markets.length > 1 && (
        <div className="mb-5 p-3 bg-panel border border-border rounded-lg">
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] text-muted uppercase tracking-wider">YES Price Sum</span>
            <div className="flex items-baseline gap-2">
              <span className={`text-xl font-bold tabular-nums ${
                Math.abs(deviation) > 0.01 ? 'text-warn' : 'text-profit'
              }`}>
                {priceSum.toFixed(4)}
              </span>
              <span className={`text-xs tabular-nums ${deviation > 0 ? 'text-loss' : 'text-profit'}`}>
                {deviation >= 0 ? '+' : ''}{(deviation * 100).toFixed(2)}%
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        {event.markets.map((market) => (
          <MarketRow key={market.id} market={market} />
        ))}
      </div>
    </div>
  );
}

function MarketRow({ market }: { market: MarketData }) {
  const yesPrice = market.outcome_prices?.[0] ?? 0;
  const noPrice = market.outcome_prices?.[1] ?? 0;

  return (
    <div className="bg-panel border border-border rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-text truncate mr-3">{market.question}</span>
        <div className="flex gap-3 text-[10px] text-muted shrink-0 tabular-nums">
          <span>vol ${fmtNum(market.volume)}</span>
          <span>liq ${fmtNum(market.liquidity)}</span>
        </div>
      </div>
      <div className="flex gap-3">
        <PriceBar label="YES" price={yesPrice} color="profit" />
        <PriceBar label="NO" price={noPrice} color="loss" />
      </div>
    </div>
  );
}

function PriceBar({ label, price, color }: { label: string; price: number; color: 'profit' | 'loss' }) {
  const pct = Math.round(price * 100);
  const bg = color === 'profit' ? 'bg-profit' : 'bg-loss';

  return (
    <div className="flex-1">
      <div className="flex justify-between text-[10px] mb-0.5">
        <span className="text-muted">{label}</span>
        <span className="tabular-nums text-text-dim">{(price * 100).toFixed(1)}c</span>
      </div>
      <div className="h-1.5 bg-panel-lighter rounded-full overflow-hidden">
        <div className={`h-full ${bg} rounded-full transition-all`} style={{ width: `${pct}%`, opacity: 0.7 }} />
      </div>
    </div>
  );
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toFixed(0);
}
