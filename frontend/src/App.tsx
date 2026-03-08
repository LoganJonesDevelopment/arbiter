import { useEffect, useState, useCallback, useMemo } from 'react';
import { fetchStats, fetchOpportunities, triggerScan } from './api';
import type { Stats, Opportunity, Quality } from './api';
import { OpportunityTable } from './components/OpportunityTable';
import { EventDetail } from './components/EventDetail';

type TypeFilter = 'all' | 'multi_outcome_arb' | 'tailing' | 'cross_exchange_arb';
type QualityFilter = 'all' | Quality;

export default function App() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [qualityFilter, setQualityFilter] = useState<QualityFilter>('all');
  const [hideTheoretical, setHideTheoretical] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

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
      setLastRefresh(new Date());
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
      const quality = getOppQuality(d);
      if (hideTheoretical && quality === 'theoretical') return false;
      if (qualityFilter !== 'all' && quality !== qualityFilter) return false;
      return true;
    });
  }, [opportunities, qualityFilter, hideTheoretical]);

  const qualityCounts = useMemo(() => {
    const counts = { high: 0, medium: 0, low: 0, theoretical: 0 };
    for (const opp of opportunities) {
      const q = getOppQuality(opp.details);
      if (q in counts) counts[q]++;
    }
    return counts;
  }, [opportunities]);

  const typeCounts = useMemo(() => {
    const counts = { multi_outcome_arb: 0, tailing: 0, cross_exchange_arb: 0 };
    for (const opp of opportunities) {
      const t = opp.type as keyof typeof counts;
      if (t in counts) counts[t]++;
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

  if (selectedEvent) {
    return (
      <div className="min-h-screen bg-surface text-text p-5">
        <button
          onClick={() => setSelectedEvent(null)}
          className="mb-4 text-xs text-muted hover:text-text cursor-pointer flex items-center gap-1"
        >
          <span className="text-base leading-none">&larr;</span>
          <span>BACK</span>
        </button>
        <EventDetail eventId={selectedEvent} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface text-text">
      {/* Header */}
      <header className="border-b border-border px-5 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-base font-bold tracking-tight text-text">ARBITER</h1>
              <p className="text-[10px] text-muted uppercase tracking-widest">Prediction Market Scanner</p>
            </div>
            {stats && (
              <div className="flex items-center gap-3 ml-4 text-[10px] text-muted border-l border-border pl-4 tabular-nums">
                <span><span className="text-poly">POLY</span> {stats.polymarket_events}</span>
                <span><span className="text-kalshi">KALSHI</span> {stats.kalshi_events}</span>
                <span className="text-border-light">|</span>
                <span>{stats.markets} mkts</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <StatusIndicator lastScan={stats?.last_scan ?? null} lastRefresh={lastRefresh} />
            <button
              onClick={handleScan}
              disabled={scanning}
              className={`px-3 py-1.5 rounded text-xs font-bold tracking-wider cursor-pointer transition-all ${
                scanning
                  ? 'bg-panel-lighter text-muted cursor-not-allowed'
                  : 'bg-poly/20 text-poly hover:bg-poly/30 border border-poly/30'
              }`}
            >
              {scanning ? 'SCANNING...' : 'SCAN'}
            </button>
          </div>
        </div>
      </header>

      <main className="p-5">
        {error && (
          <div className="mb-4 px-3 py-2 bg-loss/10 border border-loss/30 rounded text-loss text-xs">
            {error}
          </div>
        )}

        {/* Stats bar */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          <StatCard
            label="High"
            value={qualityCounts.high}
            sub="executable, good edge + liq"
            accent="text-profit"
            glow={qualityCounts.high > 0}
            active={qualityFilter === 'high'}
            onClick={() => setQualityFilter(qualityFilter === 'high' ? 'all' : 'high')}
          />
          <StatCard
            label="Medium"
            value={qualityCounts.medium}
            sub="real edge, smaller margin"
            accent="text-warn"
            active={qualityFilter === 'medium'}
            onClick={() => setQualityFilter(qualityFilter === 'medium' ? 'all' : 'medium')}
          />
          <StatCard
            label="Low"
            value={qualityCounts.low}
            sub="positive after fees, thin"
            accent="text-orange-400"
            active={qualityFilter === 'low'}
            onClick={() => setQualityFilter(qualityFilter === 'low' ? 'all' : 'low')}
          />
          <StatCard
            label="Theoretical"
            value={qualityCounts.theoretical}
            sub="not executable"
            accent="text-muted"
            active={qualityFilter === 'theoretical'}
            onClick={() => setQualityFilter(qualityFilter === 'theoretical' ? 'all' : 'theoretical')}
          />
        </div>

        {/* Filters */}
        <div className="flex items-center justify-between mb-3 gap-4">
          <div className="flex gap-1">
            <TypeButton
              active={typeFilter === 'all'}
              onClick={() => setTypeFilter('all')}
              label="ALL"
              count={opportunities.length}
            />
            <TypeButton
              active={typeFilter === 'multi_outcome_arb'}
              onClick={() => setTypeFilter('multi_outcome_arb')}
              label="MULTI"
              count={typeCounts.multi_outcome_arb}
              color="text-purple-400"
            />
            <TypeButton
              active={typeFilter === 'tailing'}
              onClick={() => setTypeFilter('tailing')}
              label="TAIL"
              count={typeCounts.tailing}
              color="text-amber-400"
            />
            <TypeButton
              active={typeFilter === 'cross_exchange_arb'}
              onClick={() => setTypeFilter('cross_exchange_arb')}
              label="CROSS"
              count={typeCounts.cross_exchange_arb}
              color="text-cyan-400"
            />
          </div>
          <div className="flex items-center gap-4 text-[11px]">
            <label className="flex items-center gap-1.5 text-muted cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hideTheoretical}
                onChange={(e) => setHideTheoretical(e.target.checked)}
                className="cursor-pointer accent-poly"
              />
              hide theoretical
            </label>
            <span className="text-muted/50 tabular-nums">
              {filtered.length}/{opportunities.length}
            </span>
          </div>
        </div>

        <OpportunityTable opportunities={filtered} onSelectEvent={setSelectedEvent} />
      </main>
    </div>
  );
}

function StatusIndicator({ lastScan, lastRefresh }: { lastScan: string | null; lastRefresh: Date }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 10_000);
    return () => clearInterval(interval);
  }, []);

  const scanAge = lastScan ? formatTimeDiff(new Date(lastScan + 'Z')) : null;
  const refreshAge = formatTimeDiff(lastRefresh);

  return (
    <div className="flex items-center gap-3 text-[10px] text-muted tabular-nums">
      <div className="flex items-center gap-1">
        <div className={`w-1.5 h-1.5 rounded-full ${scanAge ? 'bg-profit' : 'bg-loss'}`}
          style={scanAge ? { animation: 'pulse-green 3s ease-in-out infinite' } : undefined}
        />
        <span>scan {scanAge || 'never'}</span>
      </div>
      <span className="text-border-light">|</span>
      <span>refresh {refreshAge}</span>
    </div>
  );
}

function StatCard({
  label, value, sub, accent, glow, active, onClick,
}: {
  label: string;
  value: number;
  sub: string;
  accent: string;
  glow?: boolean;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left bg-panel border rounded-lg p-3 cursor-pointer transition-all ${
        active
          ? 'border-poly/50 bg-poly/5'
          : 'border-border hover:border-border-light'
      } ${glow ? 'shadow-[0_0_12px_rgba(34,197,94,0.08)]' : ''}`}
    >
      <div className="text-[10px] text-muted uppercase tracking-wider">{label}</div>
      <div className={`text-2xl font-bold mt-0.5 tabular-nums ${accent}`}>{value}</div>
      <div className="text-[10px] text-muted/50 mt-0.5">{sub}</div>
    </button>
  );
}

function TypeButton({
  active, onClick, label, count, color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded text-[11px] font-bold tracking-wider cursor-pointer transition-all flex items-center gap-1.5 ${
        active
          ? 'bg-poly/20 text-poly border border-poly/30'
          : 'bg-panel text-muted border border-border hover:border-border-light hover:text-text-dim'
      }`}
    >
      <span className={active ? '' : (color || '')}>{label}</span>
      <span className={`text-[10px] ${active ? 'text-poly/60' : 'text-muted/40'} tabular-nums`}>{count}</span>
    </button>
  );
}

function getOppQuality(d: any): Quality {
  if (d.quality) return d.quality;
  if (d.type === 'cross_exchange_arb') {
    if (d.net_profit > 0.02) return 'high';
    if (d.net_profit > 0) return 'medium';
    return 'theoretical';
  }
  return 'theoretical';
}

function formatTimeDiff(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return '<1m';
  if (diffMin < 60) return `${diffMin}m`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h`;
  return `${Math.floor(diffHrs / 24)}d`;
}
