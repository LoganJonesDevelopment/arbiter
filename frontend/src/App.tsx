import { useEffect, useState, useCallback, useMemo } from 'react';
import { fetchStats, fetchOpportunities, triggerScan } from './api';
import { OpportunityTable } from './components/OpportunityTable';
import { EventDetail } from './components/EventDetail';

interface Stats {
  events: number;
  markets: number;
  active_opportunities: number;
  multi_outcome_opportunities: number;
  tailing_opportunities: number;
  last_scan: string | null;
}

type TypeFilter = 'all' | 'multi_outcome_arb' | 'tailing';
type QualityFilter = 'all' | 'high' | 'medium' | 'low' | 'theoretical';

export default function App() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [qualityFilter, setQualityFilter] = useState<QualityFilter>('all');
  const [hideTheoretical, setHideTheoretical] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [s, o] = await Promise.all([
        fetchStats(),
        fetchOpportunities({
          type: typeFilter === 'all' ? undefined : typeFilter,
          limit: 200,
        }),
      ]);
      setStats(s);
      setOpportunities(o);
    } catch (e: any) {
      setError(e.message || 'Failed to load data');
    }
  }, [typeFilter]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  const filtered = useMemo(() => {
    return opportunities.filter((opp) => {
      const d = opp.details;
      if (hideTheoretical && d.quality === 'theoretical') return false;
      if (qualityFilter !== 'all' && d.quality !== qualityFilter) return false;
      return true;
    });
  }, [opportunities, qualityFilter, hideTheoretical]);

  const qualityCounts = useMemo(() => {
    const counts = { high: 0, medium: 0, low: 0, theoretical: 0 };
    for (const opp of opportunities) {
      const q = opp.details?.quality as keyof typeof counts;
      if (q in counts) counts[q]++;
    }
    return counts;
  }, [opportunities]);

  const handleScan = async () => {
    setScanning(true);
    try {
      await triggerScan();
      await load();
    } finally {
      setScanning(false);
    }
  };

  const formatTime = (iso: string | null) => {
    if (!iso) return 'Never';
    const d = new Date(iso + 'Z');
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    return d.toLocaleString();
  };

  if (selectedEvent) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
        <button
          onClick={() => setSelectedEvent(null)}
          className="mb-4 text-blue-400 hover:text-blue-300 cursor-pointer"
        >
          &larr; Back to opportunities
        </button>
        <EventDetail eventId={selectedEvent} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Arbiter</h1>
            <p className="text-sm text-gray-500">Polymarket Opportunity Scanner</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-gray-500">
              Scan: {formatTime(stats?.last_scan ?? null)}
            </span>
            <button
              onClick={handleScan}
              disabled={scanning}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 rounded text-sm font-medium cursor-pointer disabled:cursor-not-allowed"
            >
              {scanning ? 'Scanning...' : 'Scan Now'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6">
        {error && (
          <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded text-red-200 text-sm">
            {error}
          </div>
        )}

        {/* Quality summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <QualityCard
            label="High Quality"
            value={qualityCounts.high}
            desc="Real arb, good edge + liquidity"
            color="text-green-400"
            active={qualityFilter === 'high'}
            onClick={() => setQualityFilter(qualityFilter === 'high' ? 'all' : 'high')}
          />
          <QualityCard
            label="Medium"
            value={qualityCounts.medium}
            desc="Tailing plays, small but real edge"
            color="text-yellow-400"
            active={qualityFilter === 'medium'}
            onClick={() => setQualityFilter(qualityFilter === 'medium' ? 'all' : 'medium')}
          />
          <QualityCard
            label="Low"
            value={qualityCounts.low}
            desc="Positive edge after fees, thin margin"
            color="text-orange-400"
            active={qualityFilter === 'low'}
            onClick={() => setQualityFilter(qualityFilter === 'low' ? 'all' : 'low')}
          />
          <QualityCard
            label="Theoretical"
            value={qualityCounts.theoretical}
            desc="Not executable: fees, placeholders, or shorting"
            color="text-gray-500"
            active={qualityFilter === 'theoretical'}
            onClick={() => setQualityFilter(qualityFilter === 'theoretical' ? 'all' : 'theoretical')}
          />
        </div>

        {/* Filters */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-2">
            {(['all', 'multi_outcome_arb', 'tailing'] as TypeFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setTypeFilter(f)}
                className={`px-3 py-1 rounded text-sm cursor-pointer ${
                  typeFilter === f
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {f === 'all' ? 'All' : f === 'multi_outcome_arb' ? 'Multi-Outcome Arb' : 'Tailing'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-4 text-sm">
            <label className="flex items-center gap-2 text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={hideTheoretical}
                onChange={(e) => setHideTheoretical(e.target.checked)}
                className="cursor-pointer"
              />
              Hide theoretical
            </label>
            <span className="text-gray-600">
              {filtered.length} shown / {opportunities.length} total
            </span>
          </div>
        </div>

        <OpportunityTable
          opportunities={filtered}
          onSelectEvent={setSelectedEvent}
        />
      </main>
    </div>
  );
}

function QualityCard({
  label,
  value,
  desc,
  color,
  active,
  onClick,
}: {
  label: string;
  value: number;
  desc: string;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left bg-gray-900 border rounded-lg p-4 cursor-pointer transition-colors ${
        active ? 'border-blue-500 bg-gray-900/80' : 'border-gray-800 hover:border-gray-700'
      }`}
    >
      <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${color}`}>{value}</div>
      <div className="text-xs text-gray-600 mt-1">{desc}</div>
    </button>
  );
}
