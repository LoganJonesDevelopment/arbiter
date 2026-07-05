import { useEffect, useState, useCallback, useRef } from 'react';
import { fetchStats, fetchOpportunities, triggerScan, DEMO_MODE } from './api';
import type { Stats, Opportunity } from './api';
import { OpportunityTable } from './components/OpportunityTable';
import { DetailPanel } from './components/DetailPanel';
import { formatRelative } from './format';

type TypeFilter = 'all' | 'multi_outcome_arb' | 'tailing' | 'cross_exchange_arb';
export type SortField = 'score' | 'net_edge' | 'age';

const sortApiMap: Record<SortField, string> = {
  score: 'score',
  net_edge: 'edge',
  age: 'first_seen',
};

export default function App() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [total, setTotal] = useState(0);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [executableOnly, setExecutableOnly] = useState(true);
  const [maxDays, setMaxDays] = useState<number | undefined>(undefined);
  const [selectedOppId, setSelectedOppId] = useState<number | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [sortField, setSortField] = useState<SortField>('score');
  const [page, setPage] = useState(0);
  const pageSize = 50;
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      setError(null);
      const [s, resp] = await Promise.all([
        fetchStats(controller.signal),
        fetchOpportunities({
          type: typeFilter === 'all' ? undefined : typeFilter,
          sort_by: sortApiMap[sortField],
          limit: pageSize,
          offset: page * pageSize,
          executable_only: executableOnly,
          max_days: maxDays,
        }, controller.signal),
      ]);
      setStats(s);
      setOpportunities(resp.items);
      setTotal(resp.total);
      setLastRefresh(new Date());
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setError(e instanceof Error ? e.message : 'Failed to load data');
    }
  }, [typeFilter, sortField, page, executableOnly, maxDays]);

  useEffect(() => {
    load();
    if (DEMO_MODE) return;
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    setPage(0);
  }, [typeFilter, sortField, executableOnly, maxDays]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setSelectedOppId(null);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleScan = async () => {
    setScanning(true);
    try {
      await triggerScan();
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Scan failed');
    } finally {
      setScanning(false);
    }
  };

  const handleSort = (field: SortField) => {
    setSortField(field);
  };

  const handleTypeFilter = (t: TypeFilter) => {
    setTypeFilter(t);
  };

  const selectedOpp = selectedOppId !== null
    ? opportunities.find(o => o.id === selectedOppId) ?? null
    : null;

  const totalPages = Math.ceil(total / pageSize);
  const showingStart = total > 0 ? page * pageSize + 1 : 0;
  const showingEnd = Math.min((page + 1) * pageSize, total);

  return (
    <div className="h-screen flex flex-col bg-surface text-text-primary font-ui overflow-hidden">
      {/* Header */}
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
            disabled={scanning || DEMO_MODE}
            title={DEMO_MODE ? 'Scanning is disabled in the demo' : undefined}
            className={`h-[24px] px-3 text-[10px] font-semibold uppercase tracking-[0.04em] cursor-pointer border ${
              scanning || DEMO_MODE
                ? 'border-border text-text-tertiary cursor-not-allowed'
                : 'border-accent text-text-secondary hover:text-text-primary hover:border-text-secondary'
            }`}
          >
            {DEMO_MODE ? 'SCAN OFF' : scanning ? 'SCANNING...' : 'SCAN'}
          </button>
        </div>
      </header>

      {DEMO_MODE && (
        <div className="shrink-0 border-b border-caution/40 bg-caution/10 px-6 py-1 text-[11px] text-caution font-data tabular">
          DEMO — data frozen {stats?.last_scan ? new Date(stats.last_scan).toISOString().slice(0, 10) : ''} · live scanner runs on a home server · by{' '}
          <a href="https://loganjones.vercel.app" className="underline hover:opacity-80">Logan Jones</a>
        </div>
      )}

      {/* Filter Bar */}
      <div className="h-[32px] shrink-0 border-b border-border flex items-center px-6 justify-between">
        <div className="flex items-center gap-1">
          {(['all', 'multi_outcome_arb', 'tailing', 'cross_exchange_arb'] as TypeFilter[]).map((t) => {
            const label = { all: 'ALL', multi_outcome_arb: 'MULTI', tailing: 'TAIL', cross_exchange_arb: 'CROSS' }[t];
            const count = t === 'all' ? (stats?.active_opportunities ?? 0)
              : t === 'multi_outcome_arb' ? (stats?.multi_outcome_opportunities ?? 0)
              : t === 'tailing' ? (stats?.tailing_opportunities ?? 0)
              : (stats?.cross_exchange_opportunities ?? 0);
            return (
              <button
                key={t}
                onClick={() => handleTypeFilter(t)}
                className={`h-[24px] px-2 text-[11px] font-semibold tracking-[0.04em] cursor-pointer flex items-center gap-1 ${
                  typeFilter === t
                    ? 'text-text-primary border-b-2 border-text-primary'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
                style={{ background: 'none', border: typeFilter === t ? undefined : 'none' }}
              >
                <span>{label}</span>
                <span className="font-data tabular text-[10px] text-text-tertiary">{count}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-4 text-[11px]">
          {!DEMO_MODE && <div className="flex items-center gap-1">
            {([
              { label: 'ANY', value: undefined },
              { label: '7D', value: 7 },
              { label: '30D', value: 30 },
              { label: '90D', value: 90 },
            ] as { label: string; value: number | undefined }[]).map((opt) => (
              <button
                key={opt.label}
                onClick={() => setMaxDays(opt.value)}
                className={`h-[20px] px-1.5 text-[10px] font-semibold tracking-[0.04em] cursor-pointer ${
                  maxDays === opt.value
                    ? 'text-text-primary border-b border-text-primary'
                    : 'text-text-tertiary hover:text-text-secondary'
                }`}
                style={{ background: 'none', border: maxDays === opt.value ? undefined : 'none' }}
              >
                {opt.label}
              </button>
            ))}
          </div>}
          <label className="flex items-center gap-1.5 text-text-secondary cursor-pointer select-none">
            <input
              type="checkbox"
              checked={executableOnly}
              onChange={(e) => setExecutableOnly(e.target.checked)}
              className="cursor-pointer accent-poly"
            />
            Executable only
          </label>
          <span className="text-text-tertiary font-data tabular">
            {showingStart}-{showingEnd} of {total}
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
        <div className={`${selectedOpp ? 'w-[60%]' : 'w-full'} flex flex-col`}>
          <div className="flex-1 overflow-auto">
            <OpportunityTable
              opportunities={opportunities}
              selectedId={selectedOppId}
              onSelect={setSelectedOppId}
              sortField={sortField}
              onSort={handleSort}
            />
          </div>
          {totalPages > 1 && (
            <div className="h-[32px] shrink-0 border-t border-border flex items-center justify-between px-6 text-[11px]">
              <span className="text-text-secondary font-data tabular">
                Page {page + 1} of {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-2 h-[22px] text-text-secondary hover:text-text-primary disabled:text-text-tertiary disabled:cursor-not-allowed cursor-pointer border border-border"
                  style={{ background: 'none' }}
                >
                  Prev
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="px-2 h-[22px] text-text-secondary hover:text-text-primary disabled:text-text-tertiary disabled:cursor-not-allowed cursor-pointer border border-border"
                  style={{ background: 'none' }}
                >
                  Next
                </button>
              </div>
            </div>
          )}
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
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(interval);
  }, []);

  const scanDate = lastScan ? new Date(lastScan) : null;
  const scanAge = scanDate ? formatRelative(scanDate, now) : null;
  const refreshAge = formatRelative(lastRefresh, now);

  const scanMinutes = scanDate ? (now - scanDate.getTime()) / 60000 : Infinity;
  const dotColor = DEMO_MODE ? 'bg-accent' : scanMinutes < 10 ? 'bg-positive' : scanMinutes < 30 ? 'bg-caution' : 'bg-negative';
  const doPulse = !DEMO_MODE && scanMinutes < 10;

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
