import { useMemo, useState } from 'react';
import { Calculator, CheckCircle2, AlertCircle, ArrowRight, Sparkles } from 'lucide-react';
import {
  calculateAllTierScenarios,
  calculateRoiProjection,
  DEFAULT_INVESTMENT_PLANS,
  formatUsd
} from '../../lib/roi';
import { investFromWalletBalance } from '../../lib/ledger';
import type { AppTab, InvestmentPlan, UserProfile } from '../../types';

interface PlansTabProps {
  profile: UserProfile;
  plans: InvestmentPlan[];
  onNavigate: (tab: AppTab) => void;
}

const PRESETS = [100, 500, 1000, 5000, 10000, 25000];

export function PlansTab({ profile, plans, onNavigate }: PlansTabProps) {
  const [amountInput, setAmountInput] = useState<string>('1000');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const amount = useMemo(() => {
    const parsed = Number(amountInput);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }, [amountInput]);

  const effectiveAmount = Math.max(100, amount);

  const activePlans = useMemo(() => {
    const pool = plans.length > 0 ? plans : DEFAULT_INVESTMENT_PLANS;
    return [...pool].filter((p) => p.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  }, [plans]);

  const projection = useMemo(
    () => calculateRoiProjection(effectiveAmount, activePlans),
    [effectiveAmount, activePlans]
  );

  const tierScenarios = useMemo(
    () => calculateAllTierScenarios(effectiveAmount, activePlans),
    [effectiveAmount, activePlans]
  );

  async function handleAllocate() {
    setFeedback(null);
    if (amount < 100) {
      setFeedback({ type: 'error', text: 'Minimum investment allocation is $100.00.' });
      return;
    }
    if (profile.availableBalance < amount) {
      setFeedback({
        type: 'error',
        text: `Insufficient available balance (${formatUsd(profile.availableBalance)}). Deposit funds in Wallet first.`
      });
      return;
    }

    setSubmitting(true);
    try {
      await investFromWalletBalance({
        userId: profile.uid,
        userEmail: profile.email,
        plan: projection.plan,
        principal: amount,
        monthlyRoi: projection.monthlyRoiPercent
      });
      setFeedback({
        type: 'success',
        text: `Allocated ${formatUsd(amount)} to ${projection.plan.name} at ${projection.monthlyRoiPercent.toFixed(2)}% monthly ROI.`
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to activate investment position.'
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-white">
            Investment Plans &amp; Dynamic ROI Calculator
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Input any custom capital amount to dynamically compare potential monthly earnings across all three tiers.
          </p>
        </div>
        <div className="text-right font-mono tabular-nums">
          <p className="text-xs text-slate-400">Available Wallet Balance</p>
          <p className="text-lg font-bold text-amber-400">{formatUsd(profile.availableBalance)}</p>
        </div>
      </div>

      {/* Interactive ROI Calculator */}
      <div className="rounded-2xl border border-white/8 bg-[#0F131A] p-6 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-6 space-y-5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="plan-calc-input" className="text-sm font-medium text-slate-200 flex items-center gap-2">
                <Calculator className="w-4 h-4 text-amber-400" />
                Custom Investment Amount (USD)
              </label>
              <span className="text-xs font-mono text-emerald-400">
                Matched Tier: {projection.plan.name}
              </span>
            </div>

            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 font-mono text-lg text-slate-400">$</span>
              <input
                id="plan-calc-input"
                type="number"
                min={100}
                max={10000000}
                step="any"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                placeholder="Enter custom amount (e.g. 2500)"
                className="w-full h-12 pl-9 pr-4 rounded-xl bg-[#07090D] border border-white/12 text-white font-mono text-lg tabular-nums focus:outline-none focus:border-amber-500"
              />
            </div>

            <input
              type="range"
              min={100}
              max={50000}
              step={50}
              value={Math.min(50000, effectiveAmount)}
              onChange={(e) => setAmountInput(e.target.value)}
              aria-label="Investment amount slider"
              className="w-full accent-amber-500 cursor-pointer"
            />

            <div className="flex flex-wrap gap-2">
              {PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setAmountInput(String(preset))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono tabular-nums transition-colors cursor-pointer ${
                    amount === preset
                      ? 'bg-amber-500 text-slate-950 font-semibold'
                      : 'bg-[#07090D] border border-white/10 text-slate-300 hover:border-white/25'
                  }`}
                >
                  ${preset.toLocaleString()}
                </button>
              ))}
            </div>
          </div>

          <div className="lg:col-span-6 space-y-5 border-t lg:border-t-0 lg:border-l border-white/8 pt-6 lg:pt-0 lg:pl-8">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono tabular-nums">
              <div>
                <p className="text-xs font-sans text-slate-400">Active ROI / Mo</p>
                <p className="mt-1 text-xl font-bold text-emerald-400">{projection.monthlyRoiPercent.toFixed(2)}%</p>
              </div>
              <div>
                <p className="text-xs font-sans text-slate-400">Daily Earning</p>
                <p className="mt-1 text-xl font-bold text-white">{formatUsd(projection.dailyEarning)}</p>
              </div>
              <div>
                <p className="text-xs font-sans text-slate-400">Monthly Earning</p>
                <p className="mt-1 text-xl font-bold text-amber-400">{formatUsd(projection.monthlyEarning)}</p>
              </div>
              <div>
                <p className="text-xs font-sans text-slate-400">12-Mo Compound</p>
                <p className="mt-1 text-xl font-bold text-emerald-400">{formatUsd(projection.annualCompoundTotal)}</p>
              </div>
            </div>

            {feedback && (
              <div
                className={`rounded-xl border px-4 py-3 text-xs flex items-start gap-2.5 ${
                  feedback.type === 'success'
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                    : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                }`}
              >
                {feedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span>{feedback.text}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleAllocate}
                disabled={submitting || amount < 100}
                className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-semibold text-sm hover:bg-amber-400 transition-colors disabled:opacity-60 cursor-pointer"
              >
                {submitting ? 'Allocating…' : `Invest ${formatUsd(effectiveAmount)} in ${projection.plan.tierCode}`}
                <ArrowRight className="w-4 h-4" />
              </button>
              {profile.availableBalance < effectiveAmount && (
                <button
                  type="button"
                  onClick={() => onNavigate('wallet')}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl border border-white/12 bg-[#07090D] text-slate-200 text-sm font-medium hover:bg-white/5 transition-colors cursor-pointer"
                >
                  Auto-Deposit Funds
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Dynamic Cross-Tier Comparison Matrix */}
        <div className="border-t border-white/8 pt-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              Projected Earnings Across All Tiers for {formatUsd(effectiveAmount)}
            </h2>
            <span className="text-xs text-slate-400">
              Comparing monthly yield potential across every bracket
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/8 text-xs text-slate-400">
                  <th className="py-2.5 font-medium">Tier Plan</th>
                  <th className="py-2.5 font-medium">Capital Range</th>
                  <th className="py-2.5 font-medium">Monthly ROI</th>
                  <th className="py-2.5 font-medium text-right">Est. Daily</th>
                  <th className="py-2.5 font-medium text-right">Est. Monthly</th>
                  <th className="py-2.5 font-medium text-right">Annual Yield</th>
                  <th className="py-2.5 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono tabular-nums">
                {tierScenarios.map((sc) => {
                  const rangeLabel =
                    sc.plan.maxAmount >= 1000000
                      ? `$${sc.plan.minAmount.toLocaleString()}+`
                      : `$${sc.plan.minAmount.toLocaleString()}–$${sc.plan.maxAmount.toLocaleString()}`;
                  const shortfall = Math.max(0, sc.plan.minAmount - effectiveAmount);

                  return (
                    <tr
                      key={sc.plan.id}
                      className={sc.isMatched ? 'bg-amber-500/[0.06]' : 'hover:bg-white/[0.02]'}
                    >
                      <td className="py-3 font-sans font-medium text-white">
                        {sc.plan.name}
                      </td>
                      <td className="py-3 text-xs text-slate-300">{rangeLabel}</td>
                      <td className="py-3 text-xs text-emerald-400">
                        {sc.plan.minMonthlyRoi}%–{sc.plan.maxMonthlyRoi}% ({sc.monthlyRoiPercent.toFixed(2)}%)
                      </td>
                      <td className="py-3 text-right text-slate-200">
                        {formatUsd(sc.estimatedDailyEarning)}
                      </td>
                      <td className="py-3 text-right font-semibold text-amber-400">
                        {formatUsd(sc.estimatedMonthlyEarning)}
                      </td>
                      <td className="py-3 text-right text-emerald-400">
                        {formatUsd(sc.estimatedAnnualEarning)}
                      </td>
                      <td className="py-3 text-right font-sans text-xs">
                        {sc.isMatched ? (
                          <span className="text-emerald-400 font-semibold">Active Match</span>
                        ) : sc.eligibility === 'below_min' ? (
                          <button
                            type="button"
                            onClick={() => setAmountInput(String(sc.plan.minAmount))}
                            className="text-amber-400 hover:text-amber-300 underline underline-offset-2 cursor-pointer"
                          >
                            +{formatUsd(shortfall, 0)} to unlock
                          </button>
                        ) : (
                          <span className="text-slate-500">Tier exceeded</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 3 Plan Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {activePlans.map((plan) => {
          const scenario = tierScenarios.find((s) => s.plan.id === plan.id);
          const isMatched = projection.plan.id === plan.id;
          const rangeLabel =
            plan.maxAmount >= 1000000
              ? `$${plan.minAmount.toLocaleString()}+`
              : `$${plan.minAmount.toLocaleString()} – $${plan.maxAmount.toLocaleString()}`;

          return (
            <div
              key={plan.id}
              className={`rounded-2xl border p-6 flex flex-col justify-between transition-colors ${
                isMatched ? 'border-amber-500/60 bg-[#121722]' : 'border-white/8 bg-[#0F131A]'
              }`}
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-mono">{plan.tierCode}</span>
                  <span>{plan.lockDays} Days Lock</span>
                </div>

                <div>
                  <h2 className="font-display text-lg font-bold text-white">{plan.name}</h2>
                  <p className="mt-1 font-mono text-sm text-amber-400 tabular-nums">{rangeLabel}</p>
                </div>

                <div className="py-3 border-y border-white/8 flex items-baseline justify-between">
                  <span className="text-xs text-slate-400">Monthly ROI Range</span>
                  <span className="text-2xl font-mono font-bold tabular-nums text-emerald-400">
                    {plan.minMonthlyRoi}% – {plan.maxMonthlyRoi}%
                  </span>
                </div>

                {scenario && (
                  <div className="flex items-center justify-between text-xs font-mono tabular-nums text-slate-300">
                    <span className="font-sans text-slate-400">Projected Monthly on {formatUsd(effectiveAmount, 0)}:</span>
                    <span className="text-amber-400 font-semibold">{formatUsd(scenario.estimatedMonthlyEarning)}</span>
                  </div>
                )}

                <p className="text-sm text-slate-400 leading-relaxed">{plan.description}</p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setAmountInput(String(plan.minAmount));
                  setFeedback(null);
                }}
                className={`mt-6 w-full min-h-[42px] rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                  isMatched
                    ? 'bg-amber-500/15 border border-amber-500/40 text-amber-300'
                    : 'bg-[#07090D] border border-white/12 text-slate-200 hover:bg-white/5'
                }`}
              >
                {isMatched ? 'Active Tier Match' : `Simulate from ${formatUsd(plan.minAmount, 0)}`}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
