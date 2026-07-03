import type { Opportunity, MultiOutcomeDetails, TailingDetails, CrossExchangeDetails } from '../api';

interface Props {
  opportunity: Opportunity;
  onClose: () => void;
}

export function DetailPanel({ opportunity, onClose }: Props) {
  const d = opportunity.details;

  return (
    <div className="h-full flex flex-col">
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
        {d.type === 'cross_exchange_arb' && <CrossPanel d={d} />}
        {d.type === 'multi_outcome_arb' && <MultiPanel d={d} />}
        {d.type === 'tailing' && <TailingPanel d={d} />}
      </div>
    </div>
  );
}

function CrossPanel({ d }: { d: CrossExchangeDetails }) {
  const buyYesExchange = d.buy_yes_exchange || 'polymarket';
  const buyNoExchange = d.buy_no_exchange || 'kalshi';
  const buyYesPrice = d.buy_yes_price || 0;
  const buyNoPrice = d.buy_no_price || 0;
  const polyFee = d.poly_fee || 0;
  const kalshiFee = d.kalshi_fee || 0;
  const totalFees = d.total_fees || polyFee + kalshiFee;
  const maxShares = d.max_shares || 0;
  const minLiq = Math.min(d.poly_liquidity || 0, d.kalshi_liquidity || 0);

  const polyLink = d.slug ? `https://polymarket.com/event/${d.slug}` : '#';
  const kalshiLink = d.kalshi_ticker ? `https://kalshi.com/markets/${d.kalshi_ticker}` : '#';

  return (
    <>
      {/* Step-by-step execution */}
      <SectionLabel>Execute this trade</SectionLabel>
      <div className="space-y-2 mb-4">
        <StepBox step={1} exchange={exLabel(buyYesExchange)} exchangeColor={exColor(buyYesExchange)}>
          <span>Buy <span className="text-positive font-semibold">YES</span> at </span>
          <span className="font-data tabular font-bold text-text-primary">{cents(buyYesPrice)}</span>
          <div className="text-[10px] text-text-tertiary mt-0.5 truncate" title={buyYesExchange === 'polymarket' ? d.poly_question : d.kalshi_question}>
            {buyYesExchange === 'polymarket' ? d.poly_question : d.kalshi_question}
          </div>
          <a href={buyYesExchange === 'polymarket' ? polyLink : kalshiLink} target="_blank" rel="noopener noreferrer" className="text-[10px] text-text-link hover:underline">
            Open on {exLabel(buyYesExchange)} &#x2197;
          </a>
        </StepBox>
        <StepBox step={2} exchange={exLabel(buyNoExchange)} exchangeColor={exColor(buyNoExchange)}>
          <span>Buy <span className="text-negative font-semibold">NO</span> at </span>
          <span className="font-data tabular font-bold text-text-primary">{cents(buyNoPrice)}</span>
          <div className="text-[10px] text-text-tertiary mt-0.5 truncate" title={buyNoExchange === 'polymarket' ? d.poly_question : d.kalshi_question}>
            {buyNoExchange === 'polymarket' ? d.poly_question : d.kalshi_question}
          </div>
          <a href={buyNoExchange === 'polymarket' ? polyLink : kalshiLink} target="_blank" rel="noopener noreferrer" className="text-[10px] text-text-link hover:underline">
            Open on {exLabel(buyNoExchange)} &#x2197;
          </a>
        </StepBox>
        <div className="bg-panel-inset border border-border p-3 text-[11px]">
          <div className="text-text-tertiary text-[10px] uppercase tracking-[0.02em] mb-1">Step 3: Wait for resolution</div>
          <div className="text-text-secondary">
            One side pays out <span className="font-data tabular font-bold text-text-primary">$1.00</span> regardless of outcome.
            Your cost is <span className="font-data tabular font-bold text-text-primary">{cents(d.total_cost)}</span> per share.
          </div>
        </div>
      </div>

      {/* P&L breakdown */}
      <SectionLabel>Per-share economics</SectionLabel>
      <div className="bg-panel-inset border border-border p-3 mb-4 font-data tabular text-[11px]">
        <div className="space-y-1">
          <PLRow label={`Buy YES (${exLabel(buyYesExchange)})`} value={cents(buyYesPrice)} />
          <PLRow label={`Buy NO (${exLabel(buyNoExchange)})`} value={cents(buyNoPrice)} />
          <PLRow label={`${exLabel('polymarket')} fee`} value={cents(polyFee)} dim />
          <PLRow label={`${exLabel('kalshi')} fee`} value={cents(kalshiFee)} dim />
          <div className="border-t border-border my-1" />
          <PLRow label="Total cost" value={cents(d.total_cost + totalFees)} bold />
          <PLRow label="Payout" value="$1.00" />
          <div className="border-t border-border my-1" />
          <PLRow label="Net profit" value={cents(d.net_profit)} highlight />
          <PLRow label="Edge" value={`${d.edge_pct.toFixed(2)}%`} highlight />
        </div>
      </div>

      {/* Sizing */}
      <SectionLabel>Position sizing</SectionLabel>
      <div className="grid grid-cols-2 gap-2 mb-4 text-[11px]">
        <StatBox label="Min liquidity" value={`$${fmtNum(minLiq)}`} sub="Limits position size" />
        <StatBox label="Max shares (est)" value={maxShares > 0 ? fmtNum(maxShares) : '—'} sub={maxShares > 0 ? `$${fmtNum(maxShares * d.total_cost)} deployed` : 'Low liquidity'} />
        <StatBox label="Poly volume" value={`$${fmtNum(d.poly_volume)}`} />
        <StatBox label="Kalshi volume" value={`$${fmtNum(d.kalshi_volume)}`} />
      </div>

      {/* Match quality */}
      <SectionLabel>Match quality</SectionLabel>
      <div className="bg-panel-inset border border-border p-3 mb-4 text-[11px] space-y-2">
        <div>
          <div className="text-text-tertiary text-[10px]">Event match confidence</div>
          <div className="font-data tabular text-text-primary">{(d.match_confidence * 100).toFixed(0)}%</div>
        </div>
        {d.market_match_confidence !== undefined && (
          <div>
            <div className="text-text-tertiary text-[10px]">Market match confidence</div>
            <div className="font-data tabular text-text-primary">{(d.market_match_confidence * 100).toFixed(0)}%</div>
          </div>
        )}
        <div>
          <div className="text-text-tertiary text-[10px]">Polymarket market</div>
          <div className="text-text-secondary">{d.poly_question}</div>
        </div>
        <div>
          <div className="text-text-tertiary text-[10px]">Kalshi market</div>
          <div className="text-text-secondary">{d.kalshi_question}</div>
        </div>
        {d.match_confidence < 0.8 && (
          <div className="text-caution text-[10px] font-semibold">
            LOW MATCH CONFIDENCE — verify these are the same underlying event before trading
          </div>
        )}
      </div>
    </>
  );
}

function MultiPanel({ d }: { d: MultiOutcomeDetails }) {
  const markets = d.markets || [];
  const polyLink = d.slug ? `https://polymarket.com/event/${d.slug}` : '#';

  return (
    <>
      {/* What to do */}
      <SectionLabel>Execute this trade</SectionLabel>
      <div className="bg-panel-inset border border-border p-3 mb-4 text-[12px] text-text-secondary leading-relaxed">
        {d.trade_description}
      </div>

      {d.executable && markets.length > 0 && (
        <>
          <SectionLabel>Buy each of these on <a href={polyLink} target="_blank" rel="noopener noreferrer" className="text-poly hover:underline">Polymarket &#x2197;</a></SectionLabel>
          <div className="mb-4">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="border-b border-border text-text-tertiary">
                  <th className="text-left py-1 px-1 font-medium">Market</th>
                  <th className="text-right py-1 px-1 font-medium w-[52px]">Buy YES</th>
                  <th className="text-right py-1 px-1 font-medium w-[52px]">Liq</th>
                </tr>
              </thead>
              <tbody>
                {markets.map((m, i) => (
                  <tr key={m.market_id || i} className="border-b border-border">
                    <td className="py-1.5 px-1 text-text-primary truncate max-w-0" title={m.question}>
                      {m.question}
                    </td>
                    <td className="py-1.5 px-1 text-right font-data tabular font-bold text-positive">
                      {(m.yes_price * 100).toFixed(1)}c
                    </td>
                    <td className="py-1.5 px-1 text-right font-data tabular text-text-secondary" style={{ color: m.liquidity < 2000 ? '#d29922' : undefined }}>
                      ${fmtNum(m.liquidity)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border">
                  <td className="py-1.5 px-1 text-text-secondary font-medium">Total</td>
                  <td className="py-1.5 px-1 text-right font-data tabular font-bold text-text-primary">
                    {(d.price_sum * 100).toFixed(1)}c
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {/* P&L */}
      <SectionLabel>Per-share economics</SectionLabel>
      <div className="bg-panel-inset border border-border p-3 mb-4 font-data tabular text-[11px]">
        <div className="space-y-1">
          <PLRow label={`Buy all ${d.num_legs} YES outcomes`} value={cents(d.price_sum)} />
          <PLRow label="Fees (Polymarket)" value={cents(d.total_fees)} dim />
          <div className="border-t border-border my-1" />
          <PLRow label="Total cost" value={cents(d.price_sum + d.total_fees)} bold />
          <PLRow label="Guaranteed payout" value="$1.00" />
          <div className="border-t border-border my-1" />
          <PLRow label="Profit per share" value={cents(d.profit_per_share)} highlight />
          <PLRow label="Net edge" value={`${d.fee_adjusted_edge_pct.toFixed(2)}%`} highlight />
          <PLRow label="Est profit at $100" value={`$${d.est_profit_at_100.toFixed(2)}`} highlight />
        </div>
      </div>

      {/* Risks */}
      <SectionLabel>Risks</SectionLabel>
      <div className="space-y-1 mb-4 text-[11px] text-text-secondary">
        {!d.is_complete && (
          <Risk level="high">{d.inactive_markets} market{d.inactive_markets > 1 ? 's are' : ' is'} unlisted — payout NOT guaranteed if an unlisted outcome wins</Risk>
        )}
        {d.has_thin_leg && (
          <Risk level="medium">At least one leg has thin liquidity — may not fill at displayed price</Risk>
        )}
        <Risk level="info">Min liquidity across legs: ${fmtNum(d.min_liquidity)}</Risk>
      </div>
    </>
  );
}

function TailingPanel({ d }: { d: TailingDetails }) {
  const isYes = d.likely_outcome.toLowerCase() === 'yes';
  const buyPrice = d.price;
  const riskPerShare = buyPrice;
  const profitPerShare = d.profit_per_share;
  const polyLink = d.slug ? `https://polymarket.com/event/${d.slug}` : '#';

  return (
    <>
      {/* The trade */}
      <SectionLabel>Execute this trade</SectionLabel>
      <StepBox step={1} exchange="Polymarket" exchangeColor="#22d3ee">
        <span>Buy <span className={isYes ? 'text-positive font-semibold' : 'text-negative font-semibold'}>{d.likely_outcome.toUpperCase()}</span> at </span>
        <span className="font-data tabular font-bold text-text-primary">{cents(buyPrice)}</span>
        <div className="text-[10px] text-text-tertiary mt-0.5 truncate" title={d.question}>
          {d.question}
        </div>
        <a href={polyLink} target="_blank" rel="noopener noreferrer" className="text-[10px] text-text-link hover:underline">
          Open on Polymarket &#x2197;
        </a>
      </StepBox>

      {/* P&L */}
      <SectionLabel>Per-share economics</SectionLabel>
      <div className="bg-panel-inset border border-border p-3 mb-4 font-data tabular text-[11px]">
        <div className="space-y-1">
          <PLRow label={`Buy ${d.likely_outcome.toUpperCase()}`} value={cents(buyPrice)} />
          <PLRow label="Fee" value={cents(buyPrice - profitPerShare - (1 - buyPrice) > 0 ? buyPrice + profitPerShare - (1 - buyPrice) : 0)} dim />
          <div className="border-t border-border my-1" />
          <PLRow label="Payout if correct" value="$1.00" />
          <PLRow label="Profit if correct" value={cents(profitPerShare)} highlight />
          <PLRow label="Net edge" value={`${d.fee_adjusted_edge_pct.toFixed(2)}%`} highlight />
          <PLRow label="Est profit at $100" value={`$${d.est_profit_at_100.toFixed(2)}`} highlight />
        </div>
      </div>

      {/* Risk */}
      <SectionLabel>Risk</SectionLabel>
      <div className="bg-negative/10 border border-negative/30 p-3 mb-4 text-[11px]">
        <div className="text-negative font-semibold mb-1">If {d.likely_outcome.toUpperCase()} is wrong, you lose {cents(riskPerShare)} per share</div>
        <div className="text-text-secondary">
          At $100 deployed: you risk <span className="font-data tabular font-bold text-negative">${(100).toFixed(0)}</span> to make <span className="font-data tabular font-bold text-positive">${d.est_profit_at_100.toFixed(2)}</span>
        </div>
        <div className="text-text-tertiary text-[10px] mt-1">
          This is a directional bet, not an arb. The market is pricing this outcome at {(buyPrice * 100).toFixed(0)}% likely.
        </div>
      </div>

      {/* Context */}
      <SectionLabel>Market context</SectionLabel>
      <div className="grid grid-cols-2 gap-2 mb-4 text-[11px]">
        <StatBox label="Momentum" value={d.momentum.toUpperCase()} />
        <StatBox label="Price move" value={`${d.price_move > 0 ? '+' : ''}${(d.price_move * 100).toFixed(1)}c`} />
        <StatBox label="Volume" value={`$${fmtNum(d.volume)}`} />
        <StatBox label="Liquidity" value={`$${fmtNum(d.liquidity)}`} sub={d.liquidity < 2000 ? 'Low — may slip' : undefined} />
      </div>
    </>
  );
}


function StepBox({ step, exchange, exchangeColor, children }: { step: number; exchange: string; exchangeColor: string; children: React.ReactNode }) {
  return (
    <div className="bg-panel-inset border border-border p-3 text-[11px]">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-text-tertiary text-[10px] uppercase tracking-[0.02em]">Step {step}</span>
        <span className="text-[10px] font-semibold uppercase" style={{ color: exchangeColor }}>{exchange}</span>
      </div>
      <div className="text-text-secondary">{children}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-medium uppercase tracking-[0.04em] text-text-tertiary mb-2 mt-2">
      {children}
    </div>
  );
}

function PLRow({ label, value, highlight, bold, dim }: { label: string; value: string; highlight?: boolean; bold?: boolean; dim?: boolean }) {
  let cls = 'text-text-secondary';
  if (highlight) cls = 'text-positive font-bold';
  if (bold) cls = 'text-text-primary font-bold';
  if (dim) cls = 'text-text-tertiary';

  return (
    <div className="flex justify-between">
      <span className="text-text-secondary">{label}</span>
      <span className={cls}>{value}</span>
    </div>
  );
}

function StatBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-panel-inset border border-border p-2">
      <div className="text-text-tertiary text-[10px] uppercase tracking-[0.02em]">{label}</div>
      <div className="font-data tabular text-text-primary text-[12px]">{value}</div>
      {sub && <div className="text-text-tertiary text-[10px] mt-0.5">{sub}</div>}
    </div>
  );
}

function Risk({ level, children }: { level: 'high' | 'medium' | 'info'; children: React.ReactNode }) {
  const styles = {
    high: 'bg-negative/10 border-negative/30 text-negative',
    medium: 'bg-caution/10 border-caution/30 text-caution',
    info: 'bg-panel-inset border-border text-text-secondary',
  };
  return (
    <div className={`border p-2 text-[11px] ${styles[level]}`}>{children}</div>
  );
}

function getTitle(d: any): string {
  if (d.type === 'cross_exchange_arb') return d.event_title || d.poly_question || '';
  if (d.type === 'multi_outcome_arb') return d.event_title;
  return d.question || d.event_title;
}

function exLabel(exchange: string): string {
  if (exchange === 'polymarket') return 'Polymarket';
  if (exchange === 'kalshi') return 'Kalshi';
  return exchange;
}

function exColor(exchange: string): string {
  if (exchange === 'polymarket') return '#22d3ee';
  if (exchange === 'kalshi') return '#fbbf24';
  return '#8b949e';
}

function cents(n: number): string {
  if (n >= 1) return `$${n.toFixed(4)}`;
  return `${(n * 100).toFixed(1)}\u00a2`;
}

function fmtNum(n: number): string {
  if (!n && n !== 0) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toFixed(0);
}
