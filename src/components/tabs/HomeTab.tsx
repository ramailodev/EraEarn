import { useMemo } from 'react';
import { ArrowDownLeft, ArrowUpRight, Layers, TrendingUp, Wallet } from 'lucide-react';
import { PortfolioChart } from '../PortfolioChart';
import { calculateAccruedYield, formatUsd } from '../../lib/roi';
import type { AppTab, Investment, MarketSnapshot, Transaction, UserProfile } from '../../types';

interface HomeTabProps {
  profile: UserProfile;
  investments: Investment[];
  transactions: Transaction[];
  market: MarketSnapshot | null;
  onNavigate: (tab: AppTab) => void;
}

export function HomeTab({
  profile,
  investments,
  transactions,
  market,
  onNavigate
}: HomeTabProps) {
  const activeInvestments = useMemo(
    () => investments.filter((inv) => inv.status === 'active'),
    [investments]
  );

  const liveAccrued = useMemo(
    () => activeInvestments.reduce((sum, inv) => sum + calculateAccruedYield(inv), 0),
    [activeInvestments]
  );

  const totalPortfolio = profile.availableBalance + profile.totalInvested + liveAccrued;

  const avgMonthlyRoi = useMemo(() => {
    if (activeInvestments.length === 0) return 0;
    const weighted = activeInvestments.reduce((acc, inv) => acc + inv.principal * inv.monthlyRoi, 0);
    const totalP = activeInvestments.reduce((acc, inv) => acc + inv.principal, 0);
    return totalP > 0 ? weighted / totalP : 0;
  }, [activeInvestments]);

  const chartPoints = useMemo(() => {
    const base = Math.max(totalPortfolio, 100);
    const rate = avgMonthlyRoi > 0 ? avgMonthlyRoi / 100 : 0.08;
    const pts = [];
    for (let i = 0; i <= 6; i++) {
      const val = base * Math.pow(1 + rate, i);
      pts.push({
        label: i === 0 ? 'Current Portfolio' : `Month +${i}`,
        value: Number(val.toFixed(2)),
        yieldDelta: Number((val - base).toFixed(2))
      });
    }
    return pts;
  }, [totalPortfolio, avgMonthlyRoi]);

  const recentTx = transactions.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Portfolio Summary Header & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-8 rounded-2xl border border-white/8 bg-[#0F131A] p-6 flex flex-col justify-between space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs text-slate-400">Net Portfolio Valuation</p>
              <h1 className="mt-1 text-3xl sm:text-4xl font-mono font-bold tracking-tight tabular-nums text-white">
                {formatUsd(totalPortfolio)}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                <span>Weighted Monthly ROI <strong className="font-mono text-emerald-400">{avgMonthlyRoi.toFixed(2)}%</strong></span>
                <span aria-hidden="true">·</span>
                <span>Active Positions <strong className="font-mono text-slate-200">{activeInvestments.length}</strong></span>
                <span aria-hidden="true">·</span>
                <span>KYC <strong className="text-slate-200 capitalize">{profile.kycStatus}</strong></span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onNavigate('wallet')}
                className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-semibold text-xs hover:bg-amber-400 transition-colors cursor-pointer"
              >
                <ArrowDownLeft className="w-4 h-4" />
                Deposit
              </button>
              <button
                type="button"
                onClick={() => onNavigate('plans')}
                className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-white/12 bg-[#07090D] text-slate-200 font-medium text-xs hover:bg-white/5 transition-colors cursor-pointer"
              >
                <Layers className="w-4 h-4 text-amber-400" />
                Invest
              </button>
              <button
                type="button"
                onClick={() => onNavigate('earn')}
                className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-white/12 bg-[#07090D] text-slate-200 font-medium text-xs hover:bg-white/5 transition-colors cursor-pointer"
              >
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                Claim Yield
              </button>
            </div>
          </div>

          <PortfolioChart points={chartPoints} height={200} accentColor="#F59E0B" />
        </div>

        {/* 3 Stacked Capital Breakdown Cards */}
        <div className="lg:col-span-4 grid grid-cols-1 gap-4">
          <div className="rounded-2xl border border-white/8 bg-[#0F131A] p-5 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400">Available Wallet</p>
              <p className="mt-1 text-2xl font-mono font-bold tabular-nums text-white">
                {formatUsd(profile.availableBalance)}
              </p>
              <p className="mt-1 text-xs text-slate-500">Ready to invest or withdraw</p>
            </div>
            <Wallet className="w-5 h-5 text-amber-400 shrink-0" />
          </div>

          <div className="rounded-2xl border border-white/8 bg-[#0F131A] p-5 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400">Active Invested Principal</p>
              <p className="mt-1 text-2xl font-mono font-bold tabular-nums text-white">
                {formatUsd(profile.totalInvested)}
              </p>
              <p className="mt-1 text-xs text-slate-500">Generating automated monthly ROI</p>
            </div>
            <Layers className="w-5 h-5 text-slate-400 shrink-0" />
          </div>

          <div className="rounded-2xl border border-white/8 bg-[#0F131A] p-5 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400">Lifetime Claimed + Live Yield</p>
              <p className="mt-1 text-2xl font-mono font-bold tabular-nums text-emerald-400">
                {formatUsd(profile.totalEarned + liveAccrued)}
              </p>
              <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
                Pending claim: {formatUsd(liveAccrued, 4)}
              </p>
            </div>
            <TrendingUp className="w-5 h-5 text-emerald-400 shrink-0" />
          </div>
        </div>
      </div>

      {/* Live Blockchain Market Oracle & Recent Ledger */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Market Feed */}
        <div className="lg:col-span-5 rounded-2xl border border-white/8 bg-[#0F131A] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold text-white">Market &amp; Chain Oracle</h2>
              <p className="text-xs text-slate-400">
                {market?.networkName || 'Ethereum Mainnet'}
                {market?.gasGwei ? ` · Gas ${market.gasGwei} Gwei` : ''}
              </p>
            </div>
            {market?.blockNumber && (
              <span className="text-xs font-mono tabular-nums text-slate-400">
                #{market.blockNumber.toLocaleString()}
              </span>
            )}
          </div>

          <div className="divide-y divide-white/5">
            {(market?.assets || []).map((asset) => {
              const positive = asset.change24h >= 0;
              return (
                <div key={asset.symbol} className="py-3 flex items-center justify-between text-sm">
                  <div>
                    <span className="font-semibold text-white">{asset.symbol}</span>
                    <span className="ml-2 text-xs text-slate-400">{asset.name}</span>
                  </div>
                  <div className="text-right font-mono tabular-nums">
                    <span className="text-slate-100 font-medium">{formatUsd(asset.price)}</span>
                    <span className={`ml-3 text-xs ${positive ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {positive ? '+' : ''}{asset.change24h.toFixed(2)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="lg:col-span-7 rounded-2xl border border-white/8 bg-[#0F131A] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold text-white">Recent Ledger Activity</h2>
              <p className="text-xs text-slate-400">Real-time deposits, allocations, and yield settlements</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('wallet')}
              className="text-xs font-medium text-amber-400 hover:text-amber-300 cursor-pointer"
            >
              View All
            </button>
          </div>

          {recentTx.length === 0 ? (
            <div className="py-10 text-center space-y-3 border-t border-white/5">
              <p className="text-sm text-slate-400">No ledger entries recorded yet.</p>
              <button
                type="button"
                onClick={() => onNavigate('wallet')}
                className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-semibold text-xs hover:bg-amber-400 transition-colors cursor-pointer"
              >
                <ArrowUpRight className="w-4 h-4" />
                Make First Deposit
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/8 text-xs text-slate-400">
                    <th className="py-2.5 font-medium">Type</th>
                    <th className="py-2.5 font-medium">Asset / Network</th>
                    <th className="py-2.5 font-medium">Status</th>
                    <th className="py-2.5 font-medium text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {recentTx.map((tx) => (
                    <tr key={tx.id} className="hover:bg-white/[0.02]">
                      <td className="py-3 capitalize text-slate-200 font-medium">
                        {tx.type.replace('_', ' ')}
                      </td>
                      <td className="py-3 text-xs text-slate-400">
                        {tx.asset} · {tx.network || 'EraEarn'}
                      </td>
                      <td className="py-3 text-xs">
                        <span
                          className={
                            tx.status === 'completed'
                              ? 'text-emerald-400'
                              : tx.status === 'pending'
                                ? 'text-amber-400'
                                : 'text-rose-400'
                          }
                        >
                          {tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}
                        </span>
                      </td>
                      <td className="py-3 text-right font-mono tabular-nums text-slate-100">
                        {formatUsd(tx.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
