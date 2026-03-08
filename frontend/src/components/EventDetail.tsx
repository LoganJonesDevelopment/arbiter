import { useEffect, useState } from 'react';
import { fetchEventDetail } from '../api';

interface MarketData {
  id: string;
  question: string;
  outcomes: string[];
  outcome_prices: number[];
  volume: number;
  liquidity: number;
  active: boolean;
  closed: boolean;
}

interface EventData {
  id: string;
  title: string;
  slug: string;
  category: string;
  neg_risk: boolean;
  markets_count: number;
  markets: MarketData[];
}

export function EventDetail({ eventId }: { eventId: string }) {
  const [event, setEvent] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchEventDetail(eventId)
      .then(setEvent)
      .finally(() => setLoading(false));
  }, [eventId]);

  if (loading) return <div className="text-gray-500">Loading...</div>;
  if (!event) return <div className="text-red-400">Event not found</div>;

  const priceSum = event.markets.reduce((sum, m) => {
    return sum + (m.outcome_prices?.[0] ?? 0);
  }, 0);

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">{event.title}</h2>
      <div className="flex gap-3 text-sm text-gray-500 mb-6">
        {event.category && <span>{event.category}</span>}
        <span>{event.markets_count} markets</span>
        {event.neg_risk && (
          <span className="text-purple-400">Neg-Risk</span>
        )}
        {event.slug && (
          <a
            href={`https://polymarket.com/event/${event.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300"
          >
            View on Polymarket
          </a>
        )}
      </div>

      {event.markets.length > 1 && (
        <div className="mb-6 p-4 bg-gray-900 border border-gray-800 rounded-lg">
          <div className="text-sm text-gray-500 mb-1">YES Price Sum</div>
          <div className="flex items-baseline gap-3">
            <span
              className={`text-2xl font-bold font-mono ${
                Math.abs(priceSum - 1.0) > 0.01
                  ? 'text-yellow-400'
                  : 'text-green-400'
              }`}
            >
              {priceSum.toFixed(4)}
            </span>
            <span className="text-sm text-gray-500">
              (deviation: {((priceSum - 1.0) * 100).toFixed(2)}%)
            </span>
          </div>
        </div>
      )}

      <div className="space-y-2">
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
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-sm">{market.question}</span>
        <div className="flex gap-2 text-xs text-gray-500">
          <span>Vol: ${formatNumber(market.volume)}</span>
          <span>Liq: ${formatNumber(market.liquidity)}</span>
        </div>
      </div>
      <div className="flex gap-4">
        <PriceBar label="Yes" price={yesPrice} color="green" />
        <PriceBar label="No" price={noPrice} color="red" />
      </div>
    </div>
  );
}

function PriceBar({
  label,
  price,
  color,
}: {
  label: string;
  price: number;
  color: 'green' | 'red';
}) {
  const pct = Math.round(price * 100);
  const bg = color === 'green' ? 'bg-green-600' : 'bg-red-600';

  return (
    <div className="flex-1">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-400">{label}</span>
        <span className="font-mono">{(price * 100).toFixed(1)}%</span>
      </div>
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full ${bg} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toFixed(0);
}
