import { useMemo, useState } from 'react';
import { ArrowRight, Calculator, Lock, ShieldCheck, Wallet } from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { PortfolioChart } from './PortfolioChart';
import { calculateRoiProjection, DEFAULT_INVESTMENT_PLANS, formatUsd } from '../lib/roi';
import type { InvestmentPlan, MarketSnapshot } from '../types';

interface LandingPageProps {
  plans: InvestmentPlan[];
  market: MarketSnapshot | null;
  authLoading: boolean;
  onSignIn: () => void;
}

const HERO_IMG = '/src/assets/images/hero_vault_architecture_1795606953331.jpg';
const HARDWARE_IMG = '/src/assets/images/blockchain_node_core_1795606953542.jpg';
const ADVISORY_IMG = '/src/assets/images/wealth_portfolio_desk_1795606953691.jpg';

const PRESET_AMOUNTS = [250, 750, 2500, 7500, 15000, 50000];

export function LandingPage({ plans, market, authLoading, onSignIn }: LandingPageProps) {
  const [calcAmount, setCalcAmount] = useState<number>(2500);
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [hwImgFailed, setHwImgFailed] = useState(false);
  const [deskImgFailed, setDeskImgFailed] = useState(false);

  const activePlans = useMemo(() => {
    const list = plans.length > 0 ? plans : DEFAULT_INVESTMENT_PLANS;
    return [...list].filter((p) => p.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  }, [plans]);

  const projection = useMemo(
    () => calculateRoiProjection(calcAmount, activePlans),
    [calcAmount, activePlans]
  );

  const chartPoints = useMemo(() => {
    const points = [];
    let balance = projection.amount;
    for (let month = 0; month <= 12; month++) {
      points.push({
        label: month === 0 ? 'Initial Deposit' : `Month ${month}`,
        value: Number(balance.toFixed(2)),
        yieldDelta: Number((balance - projection.amount).toFixed(2))
      });
      balance = balance * (1 + projection.monthlyRoiPercent / 100);
    }
    return points;
  }, [projection]);

  const ethPrice = market?.assets.find((a) => a.symbol === 'ETH')?.price ?? 3428;
  const btcPrice = market?.assets.find((a) => a.symbol === 'BTC')?.price ?? 96420;

  return (
    <div className="min-h-screen bg-[#07090D] text-[#F8FAFC] flex flex-col">
      {/* Top Bar Contract: [Brand wordmark] — [4 nav links] — [1 primary CTA] */}
      <header className="sticky top-0 z-40 border-b border-white/8 bg-[#07090D]/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <a href="#top" className="whitespace-nowrap shrink-0">
            <BrandLogo />
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-300">
            <a href="#plans" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
              Investment Plans
            </a>
            <a href="#calculator" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
              ROI Calculator
            </a>
            <a href="#security" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
              Blockchain Security
            </a>
            <a href="#architecture" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
              Governance
            </a>
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={onSignIn}
              disabled={authLoading}
              className="min-h-[40px] px-5 py-2 rounded-xl bg-amber-500 text-slate-950 font-semibold text-sm hover:bg-amber-400 transition-colors disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {authLoading ? 'Connecting…' : 'Sign In'}
            </button>
          </div>
        </div>
      </header>

      <main id="top" className="flex-1">
        {/* Hero Split */}
        <section className="max-w-7xl mx-auto px-6 pt-12 pb-12 lg:pt-16 lg:pb-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-center space-y-6">
              <p className="text-xs font-medium tracking-wider text-amber-400">
                Institutional Yield &amp; Digital Asset Custody
              </p>
              <h1
                className="font-display font-bold tracking-tight text-white leading-[1.08]"
                style={{ fontSize: 'clamp(2.25rem, 4vw, 3.6rem)', textWrap: 'balance' }}
              >
                Disciplined monthly yield backed by verifiable custody.
              </h1>
              <p className="text-base text-slate-300 leading-relaxed max-w-xl">
                Allocate capital across three transparent monthly ROI tiers starting at $100.
                Track portfolio accrual in real time, verify ownership via cryptographic Web3 signatures,
                and settle earnings directly to your wallet.
              </p>

              <div className="flex flex-wrap items-center gap-4 pt-2">
                <button
                  type="button"
                  onClick={onSignIn}
                  disabled={authLoading}
                  className="min-h-[48px] inline-flex items-center gap-2.5 px-6 py-3 rounded-xl bg-amber-500 text-slate-950 font-semibold text-sm hover:bg-amber-400 transition-colors cursor-pointer"
                >
                  {authLoading ? 'Authenticating…' : 'Open Investor Portal'}
                  <ArrowRight className="w-4 h-4" />
                </button>
                <a
                  href="#calculator"
                  className="min-h-[48px] inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-white/12 bg-[#0F131A] text-slate-200 font-medium text-sm hover:bg-[#161B24] transition-colors"
                >
                  Simulate Monthly Earnings
                </a>
              </div>

              <div className="pt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-400 font-mono tabular-nums">
                <span>ETH {formatUsd(ethPrice)}</span>
                <span aria-hidden="true">·</span>
                <span>BTC {formatUsd(btcPrice, 0)}</span>
                {market?.blockNumber && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>Block #{market.blockNumber.toLocaleString()}</span>
                  </>
                )}
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="relative h-full min-h-[320px] lg:min-h-[440px] rounded-2xl overflow-hidden border border-white/10 bg-[#0F131A]">
                {!heroImgFailed ? (
                  <img
                    src={HERO_IMG}
                    alt="EraEarn institutional digital asset custody vault"
                    referrerPolicy="no-referrer"
                    onError={() => setHeroImgFailed(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-gradient-to-br from-[#0F131A] via-[#151B26] to-[#07090D]">
                    <ShieldCheck className="w-12 h-12 text-amber-400 mb-3" />
                    <span className="text-sm font-medium text-slate-300">EraEarn Institutional Vault</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[#07090D]/90 via-[#07090D]/25 to-transparent" />
                <div className="absolute bottom-5 left-5 right-5 flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="text-xs text-amber-400 font-medium">Sovereign Custody Architecture</p>
                    <p className="text-lg font-display font-semibold text-white">
                      Multi-Sig Treasury &amp; Real-Time Settlement
                    </p>
                  </div>
                  <div className="text-right font-mono tabular-nums">
                    <p className="text-xs text-slate-400">Target Monthly Range</p>
                    <p className="text-xl font-bold text-emerald-400">5.0% – 15.0%</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 4-column Institutional KPI Proof Strip */}
          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-white/8 bg-[#0F131A] p-5">
              <p className="text-xs text-slate-400">Minimum Allocation</p>
              <p className="mt-1 text-2xl font-mono font-bold tabular-nums text-white">$100.00</p>
              <p className="mt-1 text-xs text-slate-500">Accessible Core Liquidity entry</p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-[#0F131A] p-5">
              <p className="text-xs text-slate-400">Monthly Yield Tiers</p>
              <p className="mt-1 text-2xl font-mono font-bold tabular-nums text-emerald-400">5% – 15%</p>
              <p className="mt-1 text-xs text-slate-500">Calculated automatically by capital</p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-[#0F131A] p-5">
              <p className="text-xs text-slate-400">Blockchain Binding</p>
              <p className="mt-1 text-2xl font-mono font-bold tabular-nums text-white">EIP-191</p>
              <p className="mt-1 text-xs text-slate-500">Cryptographic wallet verification</p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-[#0F131A] p-5">
              <p className="text-xs text-slate-400">Accrual Visibility</p>
              <p className="mt-1 text-2xl font-mono font-bold tabular-nums text-amber-400">Real-Time</p>
              <p className="mt-1 text-xs text-slate-500">Live Firestore ledger &amp; payout logs</p>
            </div>
          </div>
        </section>

        {/* Interactive Auto-ROI Calculator + Tier Overview */}
        <section id="calculator" className="border-t border-white/8 bg-[#0A0D13] py-16">
          <div className="max-w-7xl mx-auto px-6 space-y-12">
            <div className="max-w-2xl space-y-3">
              <p className="text-xs font-medium text-amber-400">Automated Return Engine</p>
              <h2 className="font-display text-3xl font-bold tracking-tight text-white">
                Calculate your monthly and annual yield automatically.
              </h2>
              <p className="text-sm text-slate-400 leading-relaxed">
                Enter your deposit capital to see your exact tier classification, interpolated monthly
                ROI rate, daily accrual, and 12-month compounding projection.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
              <div className="lg:col-span-5 rounded-2xl border border-white/8 bg-[#0F131A] p-6 flex flex-col justify-between space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label htmlFor="landing-calc-amount" className="text-sm font-medium text-slate-200 flex items-center gap-2">
                      <Calculator className="w-4 h-4 text-amber-400" />
                      Allocation Capital (USD)
                    </label>
                    <span className="text-xs font-mono tabular-nums text-amber-400">
                      {projection.plan.name}
                    </span>
                  </div>

                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-mono text-lg text-slate-400">$</span>
                    <input
                      id="landing-calc-amount"
                      type="number"
                      min={100}
                      max={10000000}
                      step={50}
                      value={calcAmount}
                      onChange={(e) => setCalcAmount(Math.max(100, Number(e.target.value) || 100))}
                      className="w-full h-12 pl-9 pr-4 rounded-xl bg-[#07090D] border border-white/12 text-white font-mono text-lg tabular-nums focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <input
                    type="range"
                    min={100}
                    max={50000}
                    step={100}
                    value={Math.min(50000, calcAmount)}
                    onChange={(e) => setCalcAmount(Number(e.target.value))}
                    aria-label="Allocation capital slider"
                    className="w-full accent-amber-500 cursor-pointer"
                  />

                  <div className="flex flex-wrap gap-2">
                    {PRESET_AMOUNTS.map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setCalcAmount(amt)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-mono tabular-nums transition-colors cursor-pointer ${
                          calcAmount === amt
                            ? 'bg-amber-500 text-slate-950 font-semibold'
                            : 'bg-[#07090D] border border-white/10 text-slate-300 hover:border-white/25'
                        }`}
                      >
                        ${amt.toLocaleString()}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-white/8 pt-5 grid grid-cols-2 gap-4 font-mono tabular-nums">
                  <div>
                    <p className="text-xs font-sans text-slate-400">Monthly ROI Rate</p>
                    <p className="mt-1 text-2xl font-bold text-emerald-400">
                      {projection.monthlyRoiPercent.toFixed(2)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-sans text-slate-400">Monthly Earnings</p>
                    <p className="mt-1 text-2xl font-bold text-white">
                      {formatUsd(projection.monthlyEarning)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-sans text-slate-400">Daily Accrual</p>
                    <p className="mt-1 text-base font-semibold text-slate-200">
                      {formatUsd(projection.dailyEarning)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-sans text-slate-400">12-Mo Compounded</p>
                    <p className="mt-1 text-base font-semibold text-amber-400">
                      {formatUsd(projection.annualCompoundTotal)}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onSignIn}
                  className="w-full min-h-[44px] rounded-xl bg-amber-500 text-slate-950 font-semibold text-sm hover:bg-amber-400 transition-colors cursor-pointer"
                >
                  Allocate {formatUsd(projection.amount, 0)} in EraEarn
                </button>
              </div>

              <div className="lg:col-span-7 rounded-2xl border border-white/8 bg-[#0F131A] p-6 flex flex-col justify-between">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                  <div>
                    <h3 className="font-display text-lg font-semibold text-white">
                      12-Month Compounding Curve
                    </h3>
                    <p className="text-xs text-slate-400">
                      {projection.plan.name} · {projection.plan.lockDays}-day maturity cycle
                    </p>
                  </div>
                  <div className="text-right font-mono tabular-nums">
                    <p className="text-xs text-slate-400">Projected Net Gain</p>
                    <p className="text-lg font-bold text-emerald-400">
                      +{formatUsd(projection.annualCompoundTotal - projection.amount)}
                    </p>
                  </div>
                </div>

                <PortfolioChart points={chartPoints} height={240} accentColor="#10B981" />

                <div className="mt-4 pt-4 border-t border-white/8 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                  <span>Linear Simple 12M Return: <strong className="font-mono text-slate-200">{formatUsd(projection.annualEarning)}</strong></span>
                  <span>ETH Equivalent: <strong className="font-mono text-slate-200">{(projection.amount / ethPrice).toFixed(4)} ETH</strong></span>
                </div>
              </div>
            </div>

            {/* 3 Investment Plans Matrix */}
            <div id="plans" className="pt-4 space-y-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h3 className="font-display text-2xl font-bold text-white">Investment Tiers</h3>
                  <p className="text-sm text-slate-400 mt-1">
                    Three capital brackets with deterministic monthly ROI ranges.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {activePlans.map((plan) => {
                  const isSelected = projection.plan.id === plan.id;
                  const rangeLabel =
                    plan.maxAmount >= 1000000
                      ? `$${plan.minAmount.toLocaleString()}+`
                      : `$${plan.minAmount.toLocaleString()} – $${plan.maxAmount.toLocaleString()}`;

                  return (
                    <div
                      key={plan.id}
                      className={`rounded-2xl border p-6 flex flex-col justify-between transition-colors ${
                        isSelected
                          ? 'border-amber-500/50 bg-[#121722]'
                          : 'border-white/8 bg-[#0F131A]'
                      }`}
                    >
                      <div className="space-y-4">
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span className="font-mono">{plan.tierCode}</span>
                          <span>{plan.lockDays} Days Lock</span>
                        </div>
                        <div>
                          <h4 className="font-display text-xl font-bold text-white">{plan.name}</h4>
                          <p className="mt-1 font-mono text-sm text-amber-400 tabular-nums">{rangeLabel}</p>
                        </div>
                        <div className="py-3 border-y border-white/8 flex items-baseline justify-between">
                          <span className="text-xs text-slate-400">Monthly ROI</span>
                          <span className="text-2xl font-mono font-bold text-emerald-400 tabular-nums">
                            {plan.minMonthlyRoi}% – {plan.maxMonthlyRoi}%
                          </span>
                        </div>
                        <p className="text-sm text-slate-400 leading-relaxed">{plan.description}</p>
                      </div>

                      <button
                        type="button"
                        onClick={() => setCalcAmount(plan.minAmount)}
                        className="mt-6 w-full min-h-[42px] rounded-xl border border-white/12 bg-[#07090D] text-slate-200 text-sm font-medium hover:bg-white/5 transition-colors cursor-pointer"
                      >
                        Preview {rangeLabel}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Blockchain Security & Institutional Governance */}
        <section id="security" className="border-t border-white/8 py-16 max-w-7xl mx-auto px-6 space-y-14">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-6 rounded-2xl overflow-hidden border border-white/10 bg-[#0F131A] aspect-[4/3]">
              {!hwImgFailed ? (
                <img
                  src={HARDWARE_IMG}
                  alt="Hardware security module for cryptographic custody"
                  referrerPolicy="no-referrer"
                  onError={() => setHwImgFailed(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-[#0F131A]">
                  <Lock className="w-12 h-12 text-amber-400" />
                </div>
              )}
            </div>

            <div className="lg:col-span-6 space-y-6">
              <p className="text-xs font-medium text-amber-400">Cryptographic Verification</p>
              <h2 className="font-display text-3xl font-bold tracking-tight text-white">
                Hardware-grade wallet authentication and immutable ledgers.
              </h2>
              <div className="space-y-5">
                <div className="border-b border-white/8 pb-4">
                  <h3 className="font-display font-semibold text-white">01. EIP-191 Signature Ownership</h3>
                  <p className="mt-1 text-sm text-slate-400 leading-relaxed">
                    Connect MetaMask or any EVM wallet to sign a cryptographic challenge verified server-side via ethers.js before binding withdrawal destinations.
                  </p>
                </div>
                <div className="border-b border-white/8 pb-4">
                  <h3 className="font-display font-semibold text-white">02. On-Chain Transaction Inspection</h3>
                  <p className="mt-1 text-sm text-slate-400 leading-relaxed">
                    Deposit hashes are validated against Ethereum JSON-RPC nodes and verified by treasury administrators prior to balance settlement.
                  </p>
                </div>
                <div>
                  <h3 className="font-display font-semibold text-white">03. Strict Database Rule Enforcement</h3>
                  <p className="mt-1 text-sm text-slate-400 leading-relaxed">
                    Every balance transition obeys conservation-of-funds invariants and role-isolated security rules in Firestore.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div id="architecture" className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-6 space-y-5 order-2 lg:order-1">
              <p className="text-xs font-medium text-emerald-400">Full Operational Transparency</p>
              <h2 className="font-display text-3xl font-bold tracking-tight text-white">
                Built for both private investors and treasury administrators.
              </h2>
              <p className="text-sm text-slate-400 leading-relaxed">
                Investors receive a focused dark-mode workspace with Home, Plans, Earn, Wallet, and Profile navigation. Authorized administrators govern tier rates, approve on-chain deposits and withdrawals, verify KYC status, and settle monthly yield distributions from one unified control desk.
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={onSignIn}
                  className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-slate-950 font-semibold text-sm hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  <Wallet className="w-4 h-4" />
                  Sign In with Google
                </button>
              </div>
            </div>

            <div className="lg:col-span-6 rounded-2xl overflow-hidden border border-white/10 bg-[#0F131A] aspect-[4/3] order-1 lg:order-2">
              {!deskImgFailed ? (
                <img
                  src={ADVISORY_IMG}
                  alt="Private wealth management advisory desk"
                  referrerPolicy="no-referrer"
                  onError={() => setDeskImgFailed(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-[#0F131A]">
                  <ShieldCheck className="w-12 h-12 text-emerald-400" />
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-white/8 bg-[#07090D] py-8">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-4">
            <BrandLogo size="sm" />
            <span>© {new Date().getFullYear()} EraEarn Treasury Systems.</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#plans" className="hover:text-slate-300 transition-colors">Plans</a>
            <a href="#calculator" className="hover:text-slate-300 transition-colors">Calculator</a>
            <a href="#security" className="hover:text-slate-300 transition-colors">Security</a>
            <button type="button" onClick={onSignIn} className="hover:text-slate-300 transition-colors cursor-pointer">
              Client Login
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
