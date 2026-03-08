import { useEffect, useState, useCallback, useMemo } from 'react';
import { fetchStats, fetchOpportunities, triggerScan } from './api';
import type { Stats, Opportunity, Quality } from './api';
import { OpportunityTable } from './components/OpportunityTable';
import { DetailPanel } from './components/DetailPanel';

type TypeFilter = 'all' | 'multi_outcome_arb' | 'tailing' | 'cross_exchange_arb';
type QualityFilter = 'all' | Quality;
type SortField = 'net_edge' | 'raw_edge' | 'profit' | 'volume' | 'liquidity' | 'age';
type SortDir = 'asc' | 'desc';

export default function App() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [qualityFilter, setQualityFilter] = useState<QualityFilter>('all');
  const [hideTheoretical, setHideTheoretical] = useState(true);
  const [selectedOppId, setSelectedOppId] = useState<number | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [sortField, setSortField] = useState<SortField>('net_edge');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

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

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setSelectedOppId(null);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const filtered = useMemo(() => {
    return opportunities.filter((opp) => {
      const quality = getOppQuality(opp.details);
      if (hideTheoretical && quality === 'theoretical') return false;
      if (qualityFilter !== 'all' && quality !== qualityFilter) return false;
      return true;
    });
  }, [opportunities, qualityFilter, hideTheoretical]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let va: number, vb: number;
      switch (sortField) {
        case 'net_edge':
          va = getNetEdge(a.details);
          vb = getNetEdge(b.details);
          break;
        case 'raw_edge':
          va = getRawEdge(a.details);
          vb = getRawEdge(b.details);
          break;
        case 'profit':
          va = getProfit(a.details);
          vb = getProfit(b.details);
          break;
        case 'volume':
          va = getVolume(a.details);
          vb = getVolume(b.details);
          break;
        case 'liquidity':
          va = getLiquidity(a.details);
          vb = getLiquidity(b.details);
          break;
        case 'age':
          va = new Date(a.first_seen + 'Z').getTime();
          vb = new Date(b.first_seen + 'Z').getTime();
          break;
        default:
          va = getNetEdge(a.details);
          vb = getNetEdge(b.details);
      }
      return sortDir === 'desc' ? vb - va : va - vb;
    });
    return arr;
  }, [filtered, sortField, sortDir]);

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

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const selectedOpp = selectedOppId !== null
    ? opportunities.find(o => o.id === selectedOppId) ?? null
    : null;

  return (
    <div className="h-screen flex flex-col bg-surface text-text-primary font-ui overflow-hidden">
      {/* Header - 40px */}
      <header className="h-[40px] shrink-0 border-b border-border flex items-center px-6 justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-baseline gap-3">
            <span className="text-[14px] font-semibold tracking-[-0.01em] text-text-primary">ARBITER</span>
            <span className="text-[10px] font-normal uppercase tracking-[0.06em] text-text-tertiary">Prediction Market Scanner</span>
          </div>
          {stats && (
            <div className="flex items-center gap-3 ml-2 text-[10px] text-text-secondary border-l border-border pl-4 font-data tabular">
              <span><span className="text-poly">POLY</span> {stats.polymarket_events}</span>
              <span><span className="text-kalshi">KALSHI</span> {stats.kalshi_events}</span>
              <span className="text-text-tertiary">|</span>
              <span>{stats.markets} mkts</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <StatusIndicator lastScan={stats?.last_scan ?? null} lastRefresh={lastRefresh} />
          <button
            onClick={handleScan}
            disabled={scanning}
            className={`h-[24px] px-3 text-[10px] font-semibold uppercase tracking-[0.04em] cursor-pointer border ${
              scanning
                ? 'border-border text-text-tertiary cursor-not-allowed'
                : 'border-accent text-text-secondary hover:text-text-primary hover:border-text-secondary'
            }`}
          >
            {scanning ? 'SCANNING...' : 'SCAN'}
          </button>
        </div>
      </header>

      {/* Stat Bar - 32px */}
      <div className="h-[32px] shrink-0 border-b border-border flex items-center px-6 gap-4 text-[11px]">
        <StatChip
          label="HIGH"
          count={qualityCounts.high}
          color="#3fb950"
          active={qualityFilter === 'high'}
          onClick={() => setQualityFilter(qualityFilter === 'high' ? 'all' : 'high')}
        />
        <span className="text-text-tertiary">|</span>
        <StatChip
          label="MED"
          count={qualityCounts.medium}
          color="#d29922"
          active={qualityFilter === 'medium'}
          onClick={() => setQualityFilter(qualityFilter === 'medium' ? 'all' : 'medium')}
        />
        <span className="text-text-tertiary">|</span>
        <StatChip
          label="LOW"
          count={qualityCounts.low}
          color="#da6d25"
          active={qualityFilter === 'low'}
          onClick={() => setQualityFilter(qualityFilter === 'low' ? 'all' : 'low')}
        />
        <span className="text-text-tertiary">|</span>
        <StatChip
          label="THEO"
          count={qualityCounts.theoretical}
          color="#484f58"
          active={qualityFilter === 'theoretical'}
          onClick={() => setQualityFilter(qualityFilter === 'theoretical' ? 'all' : 'theoretical')}
        />
        {hideTheoretical && qualityCounts.theoretical > 0 && (
          <span className="text-text-tertiary ml-2">hiding {qualityCounts.theoretical} theoretical</span>
        )}
      </div>

      {/* Filter Bar - 32px */}
      <div className="h-[32px] shrink-0 border-b border-border flex items-center px-6 justify-between">
        <div className="flex items-center gap-1">
          <TypeChip
            label="ALL"
            count={opportunities.length}
            active={typeFilter === 'all'}
            onClick={() => setTypeFilter('all')}
          />
          <TypeChip
            label="MULTI"
            count={typeCounts.multi_outcome_arb}
            active={typeFilter === 'multi_outcome_arb'}
            onClick={() => setTypeFilter('multi_outcome_arb')}
          />
          <TypeChip
            label="TAIL"
            count={typeCounts.tailing}
            active={typeFilter === 'tailing'}
            onClick={() => setTypeFilter('tailing')}
          />
          <TypeChip
            label="CROSS"
            count={typeCounts.cross_exchange_arb}
            active={typeFilter === 'cross_exchange_arb'}
            onClick={() => setTypeFilter('cross_exchange_arb')}
          />
        </div>
        <div className="flex items-center gap-4 text-[11px]">
          <label className="flex items-center gap-1.5 text-text-secondary cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hideTheoretical}
              onChange={(e) => setHideTheoretical(e.target.checked)}
              className="cursor-pointer accent-poly"
            />
            Hide theoretical
          </label>
          <span className="text-text-tertiary font-data tabular">
            {sorted.length}/{opportunities.length}
          </span>
        </div>
      </div>

      {error && (
        <div className="px-6 py-1 bg-negative/10 border-b border-negative/30 text-negative text-[11px]">
          {error}
        </div>
      )}

      {/* Main content: table + optional detail panel */}
      <div className="flex-1 flex min-h-0">
        <div className={`${selectedOpp ? 'w-[60%]' : 'w-full'} overflow-auto`}>
          <OpportunityTable
            opportunities={sorted}
            selectedId={selectedOppId}
            onSelect={setSelectedOppId}
            sortField={sortField}
            sortDir={sortDir}
            onSort={handleSort}
          />
        </div>
        {selectedOpp && (
          <div className="w-[40%] border-l border-border overflow-auto bg-panel">
            <DetailPanel
              opportunity={selectedOpp}
              onClose={() => setSelectedOppId(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function StatusIndicator({ lastScan, lastRefresh }: { lastScan: string | null; lastRefresh: Date }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 10_000);
    return () => clearInterval(interval);
  }, []);

  const scanDate = lastScan ? new Date(lastScan + 'Z') : null;
  const scanAge = scanDate ? formatTimeDiff(scanDate) : null;
  const refreshAge = formatTimeDiff(lastRefresh);

  const scanMinutes = scanDate ? (Date.now() - scanDate.getTime()) / 60000 : Infinity;
  const dotColor = scanMinutes < 10 ? 'bg-positive' : scanMinutes < 30 ? 'bg-caution' : 'bg-negative';
  const doPulse = scanMinutes < 10;

  return (
    <div className="flex items-center gap-3 text-[10px] text-text-secondary tabular">
      <div className="flex items-center gap-1">
        <div className={`w-1.5 h-1.5 rounded-full ${dotColor}`}
          style={doPulse ? { animation: 'pulse-green 3s ease-in-out infinite' } : undefined}
        />
        <span>scan {scanAge || 'never'}</span>
      </div>
      <span className="text-text-tertiary">|</span>
      <span>refresh {refreshAge}</span>
    </div>
  );
}

function StatChip({
  label, count, color, active, onClick,
}: {
  label: string;
  count: number;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`cursor-pointer flex items-center gap-1.5 font-semibold tracking-[0.02em] ${
        active ? 'underline underline-offset-4' : ''
      }`}
      style={{ background: 'none', border: 'none', padding: 0 }}
    >
      <span style={{ color }}>{label}</span>
      <span className={`font-data tabular ${active ? 'text-text-primary' : 'text-text-primary'}`}>{count}</span>
    </button>
  );
}

function TypeChip({
  label, count, active, onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`h-[24px] px-2 text-[11px] font-semibold tracking-[0.04em] cursor-pointer flex items-center gap-1 ${
        active
          ? 'text-text-primary border-b-2 border-text-primary'
          : 'text-text-secondary hover:text-text-primary'
      }`}
      style={{ background: 'none', border: active ? undefined : 'none' }}
    >
      <span>{label}</span>
      <span className="font-data tabular text-[10px] text-text-tertiary">{count}</span>
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

function getRawEdge(d: any): number {
  if ('raw_edge_pct' in d) return d.raw_edge_pct;
  if (d.type === 'cross_exchange_arb') return ((d.gross_profit / d.total_cost) * 100);
  return 0;
}

function getNetEdge(d: any): number {
  if ('fee_adjusted_edge_pct' in d) return d.fee_adjusted_edge_pct;
  if (d.type === 'cross_exchange_arb') return d.edge_pct;
  return 0;
}

function getProfit(d: any): number {
  if ('est_profit_at_100' in d) return d.est_profit_at_100;
  if (d.type === 'cross_exchange_arb') return d.net_profit * (100 / d.total_cost);
  return 0;
}

function getVolume(d: any): number {
  if ('total_volume' in d) return d.total_volume;
  if ('volume' in d) return d.volume;
  if (d.type === 'cross_exchange_arb') return Math.min(d.poly_volume || 0, d.kalshi_volume || 0);
  return 0;
}

function getLiquidity(d: any): number {
  if ('min_liquidity' in d) return d.min_liquidity;
  if ('liquidity' in d) return d.liquidity;
  if (d.type === 'cross_exchange_arb') return Math.min(d.poly_liquidity || 0, d.kalshi_liquidity || 0);
  return 0;
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

export { getOppQuality, getRawEdge, getNetEdge, getProfit, getVolume, getLiquidity };
export type { SortField, SortDir };
