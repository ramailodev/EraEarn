import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Gift,
  Layers,
  Link2,
  TrendingUp,
  Users
} from 'lucide-react';
import { calculateAccruedYield, formatUsd } from '../../lib/roi';
import {
  applyReferralCodeToProfile,
  claimAccruedYield,
  claimReferralCommissions
} from '../../lib/ledger';
import type {
  AppTab,
  Investment,
  ReferralCommission,
  Transaction,
  UserProfile
} from '../../types';

interface EarnTabProps {
  profile: UserProfile;
  investments: Investment[];
  transactions: Transaction[];
  referralCommissions: ReferralCommission[];
  onNavigate: (tab: AppTab) => void;
}

export function EarnTab({
  profile,
  investments,
  transactions,
  referralCommissions,
  onNavigate
}: EarnTabProps) {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimingRef, setClaimingRef] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [sponsorInput, setSponsorInput] = useState('');
  const [linkingSponsor, setLinkingSponsor] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const activeInvestments = useMemo(
    () => investments.filter((inv) => inv.status === 'active'),
    [investments]
  );

  const totalPendingYield = useMemo(
    () => activeInvestments.reduce((sum, inv) => sum + calculateAccruedYield(inv, nowMs), 0),
    [activeInvestments, nowMs]
  );

  const yieldHistory = useMemo(
    () => transactions.filter((t) => t.type === 'yield_claim' || t.type === 'referral_bonus'),
    [transactions]
  );

  const referralCode = profile.referralCode || `ERA${profile.uid.slice(0, 7).toUpperCase()}`;
  const referralLink = useMemo(() => {
    if (typeof window === 'undefined') return `?ref=${referralCode}`;
    return `${window.location.origin}/?ref=${referralCode}`;
  }, [referralCode]);

  const referralStats = useMemo(() => {
    const levels = [
      { level: 1 as const, label: 'Direct Level 1', rate: 5 },
      { level: 2 as const, label: 'Level 2 Network', rate: 3 },
      { level: 3 as const, label: 'Level 3 Network', rate: 2 }
    ];
    return levels.map((lvl) => {
      const matches = referralCommissions.filter((c) => c.level === lvl.level);
      const earned = matches.reduce((s, c) => s + c.commissionAmount, 0);
      const claimable = matches
        .filter((c) => c.status === 'claimable')
        .reduce((s, c) => s + c.commissionAmount, 0);
      const uniquePartners = new Set(matches.map((c) => c.fromUid)).size;
      return { ...lvl, count: matches.length, uniquePartners, earned, claimable };
    });
  }, [referralCommissions]);

  const totalClaimableRef = useMemo(
    () =>
      referralCommissions
        .filter((c) => c.status === 'claimable')
        .reduce((s, c) => s + c.commissionAmount, 0),
    [referralCommissions]
  );

  async function handleClaim(inv: Investment) {
    setFeedback(null);
    const accrued = calculateAccruedYield(inv, Date.now());
    if (accrued < 0.01) {
      setFeedback({
        type: 'error',
        text: 'Accrued yield must reach at least $0.01 before claiming to your wallet.'
      });
      return;
    }

    setClaimingId(inv.id);
    try {
      await claimAccruedYield({
        userId: profile.uid,
        userEmail: profile.email,
        investment: inv,
        claimAmount: accrued
      });
      setFeedback({
        type: 'success',
        text: `Claimed ${formatUsd(accrued)} from ${inv.planName} into your available wallet.`
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to claim yield.'
      });
    } finally {
      setClaimingId(null);
    }
  }

  async function handleClaimReferrals() {
    setFeedback(null);
    setClaimingRef(true);
    try {
      const credited = await claimReferralCommissions({
        userId: profile.uid,
        userEmail: profile.email,
        commissions: referralCommissions
      });
      setFeedback({
        type: 'success',
        text: `Claimed ${formatUsd(credited)} in 3-level referral bonuses into your available wallet.`
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to claim referral bonuses.'
      });
    } finally {
      setClaimingRef(false);
    }
  }

  async function handleApplySponsorCode(e: React.FormEvent) {
    e.preventDefault();
    if (!sponsorInput.trim()) return;
    setFeedback(null);
    setLinkingSponsor(true);
    try {
      const applied = await applyReferralCodeToProfile(profile.uid, sponsorInput);
      setSponsorInput('');
      setFeedback({
        type: 'success',
        text: `Linked sponsor referral code ${applied}. Your upline network is now active.`
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to link referral code.'
      });
    } finally {
      setLinkingSponsor(false);
    }
  }

  function handleCopy(text: string, kind: 'code' | 'link') {
    navigator.clipboard?.writeText(text);
    if (kind === 'code') {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } else {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-white">
            Earn Yield &amp; 3-Level Referral Network
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Claim live position ROI and earn multi-tier referral commissions: Level 1 (5%), Level 2 (3%), and Level 3 (2%).
          </p>
        </div>
        <div className="text-right font-mono tabular-nums">
          <p className="text-xs text-slate-400">Live Claimable Yield</p>
          <p className="text-2xl font-bold text-emerald-400">{formatUsd(totalPendingYield, 6)}</p>
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

      {/* 3-Level Referral Program & Invite Link / Code */}
      <div className="rounded-2xl border border-white/8 bg-[#0F131A] p-6 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-amber-400" />
              3-Level Referral Program
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Share your referral link or code. Earn 5% on Direct Level 1, 3% on Level 2, and 2% on Level 3 investments.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right font-mono tabular-nums">
              <p className="text-xs text-slate-400">Total Referral Earnings</p>
              <p className="text-lg font-bold text-amber-400">{formatUsd(profile.referralEarnings || 0)}</p>
            </div>
            {totalClaimableRef > 0 && (
              <button
                type="button"
                onClick={handleClaimReferrals}
                disabled={claimingRef}
                className="min-h-[42px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-semibold text-xs hover:bg-amber-400 transition-colors cursor-pointer"
              >
                <Gift className="w-4 h-4" />
                {claimingRef ? 'Claiming…' : `Claim ${formatUsd(totalClaimableRef)}`}
              </button>
            )}
          </div>
        </div>

        {/* User Referral Link & Referral Code */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-4 rounded-xl bg-[#07090D] border border-white/8 p-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-slate-400">Your Referral Code</p>
              <p className="mt-1 font-mono text-base font-bold text-amber-400 tracking-wider">
                {referralCode}
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleCopy(referralCode, 'code')}
              className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/12 text-xs text-slate-200 hover:bg-white/5 cursor-pointer shrink-0"
            >
              <Copy className="w-3.5 h-3.5" />
              {copiedCode ? 'Copied' : 'Copy Code'}
            </button>
          </div>

          <div className="lg:col-span-8 rounded-xl bg-[#07090D] border border-white/8 p-4 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-slate-400 flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5 text-emerald-400" />
                Your Referral Invite Link
              </p>
              <p className="mt-1 font-mono text-xs text-slate-200 truncate">{referralLink}</p>
            </div>
            <button
              type="button"
              onClick={() => handleCopy(referralLink, 'link')}
              className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-white text-slate-950 font-semibold text-xs hover:bg-slate-200 cursor-pointer shrink-0"
            >
              <Copy className="w-3.5 h-3.5" />
              {copiedLink ? 'Link Copied' : 'Copy Link'}
            </button>
          </div>
        </div>

        {/* 3-Level Commission Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {referralStats.map((lvl) => (
            <div
              key={lvl.level}
              className="rounded-xl border border-white/8 bg-[#07090D] p-4 space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-300">{lvl.label}</span>
                <span className="font-mono text-sm font-bold text-emerald-400">{lvl.rate}% Commission</span>
              </div>
              <div className="flex items-baseline justify-between font-mono tabular-nums pt-1">
                <div>
                  <p className="text-lg font-bold text-white">{formatUsd(lvl.earned)}</p>
                  <p className="text-[11px] font-sans text-slate-500">
                    {lvl.uniquePartners} active partners · {lvl.count} payouts
                  </p>
                </div>
                {lvl.claimable > 0 && (
                  <span className="text-xs text-amber-400">
                    +{formatUsd(lvl.claimable)} ready
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Link Sponsor Code if not yet referred */}
        {!profile.referredByCode ? (
          <form onSubmit={handleApplySponsorCode} className="pt-4 border-t border-white/8 flex flex-col sm:flex-row sm:items-center gap-3">
            <label htmlFor="sponsor-code-input" className="text-xs text-slate-400 shrink-0">
              Invited by a partner? Apply referral code:
            </label>
            <div className="flex flex-1 gap-2 max-w-md">
              <input
                id="sponsor-code-input"
                type="text"
                value={sponsorInput}
                onChange={(e) => setSponsorInput(e.target.value.toUpperCase())}
                placeholder="ERA..."
                className="flex-1 h-10 px-3 rounded-xl bg-[#07090D] border border-white/10 font-mono text-xs text-white uppercase placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
              />
              <button
                type="submit"
                disabled={linkingSponsor || !sponsorInput.trim()}
                className="min-h-[40px] px-4 rounded-xl border border-amber-500/40 text-amber-400 text-xs font-semibold hover:bg-amber-500/10 disabled:opacity-50 cursor-pointer"
              >
                {linkingSponsor ? 'Linking…' : 'Apply Code'}
              </button>
            </div>
          </form>
        ) : (
          <div className="pt-3 border-t border-white/8 text-xs text-slate-400">
            Upline Sponsor Code Linked: <strong className="font-mono text-slate-200">{profile.referredByCode}</strong>
          </div>
        )}
      </div>

      {/* Active Investment Yield Positions */}
      {activeInvestments.length === 0 ? (
        <div className="rounded-2xl border border-white/8 bg-[#0F131A] p-10 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
            <Layers className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h2 className="font-display text-lg font-semibold text-white">No Active Yield Positions</h2>
            <p className="text-sm text-slate-400 max-w-md mx-auto">
              Select an investment tier starting at $100 to activate real-time monthly ROI accrual.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('plans')}
            className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-semibold text-sm hover:bg-amber-400 transition-colors cursor-pointer"
          >
            Explore Investment Plans
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {activeInvestments.map((inv) => {
            const accrued = calculateAccruedYield(inv, nowMs);
            const monthlyEst = (inv.principal * inv.monthlyRoi) / 100;
            const dailyEst = monthlyEst / 30;
            const canClaim = accrued >= 0.01;

            return (
              <div
                key={inv.id}
                className="rounded-2xl border border-white/8 bg-[#0F131A] p-6 flex flex-col justify-between space-y-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs text-slate-400">
                      {inv.lockDays} Days Term · Active
                    </p>
                    <h2 className="mt-1 font-display text-lg font-bold text-white">{inv.planName}</h2>
                  </div>
                  <div className="text-right font-mono tabular-nums">
                    <p className="text-xs text-slate-400">Monthly ROI</p>
                    <p className="text-lg font-bold text-emerald-400">{inv.monthlyRoi.toFixed(2)}%</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 py-4 border-y border-white/8 font-mono tabular-nums">
                  <div>
                    <p className="text-xs font-sans text-slate-400">Principal</p>
                    <p className="mt-1 text-base font-semibold text-white">{formatUsd(inv.principal)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-sans text-slate-400">Est. Monthly Profit</p>
                    <p className="mt-1 text-base font-semibold text-amber-400">{formatUsd(monthlyEst)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-sans text-slate-400">Daily Rate</p>
                    <p className="mt-1 text-sm text-slate-200">{formatUsd(dailyEst)} / day</p>
                  </div>
                  <div>
                    <p className="text-xs font-sans text-slate-400">Already Claimed</p>
                    <p className="mt-1 text-sm text-slate-200">{formatUsd(inv.totalClaimed)}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs text-slate-400">Accruing Now</p>
                    <p className="text-xl font-mono font-bold tabular-nums text-emerald-400">
                      +{formatUsd(accrued, 6)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleClaim(inv)}
                    disabled={claimingId === inv.id || !canClaim}
                    className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-semibold text-sm hover:bg-emerald-400 transition-colors disabled:opacity-45 cursor-pointer"
                  >
                    <TrendingUp className="w-4 h-4" />
                    {claimingId === inv.id ? 'Claiming…' : canClaim ? 'Claim Yield' : 'Accruing…'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Referral Commissions & Yield Settlement History */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-white/8 bg-[#0F131A] p-6 space-y-4">
          <h2 className="font-display text-base font-semibold text-white">3-Level Referral Commissions</h2>
          {referralCommissions.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 border-t border-white/5">
              No referral commissions yet. Share your link to earn 5% / 3% / 2% when partners invest.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/8 text-xs text-slate-400">
                    <th className="py-2.5 font-medium">Partner</th>
                    <th className="py-2.5 font-medium">Level</th>
                    <th className="py-2.5 font-medium">Status</th>
                    <th className="py-2.5 font-medium text-right">Bonus</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {referralCommissions.map((c) => (
                    <tr key={c.id}>
                      <td className="py-3 text-xs text-slate-200 truncate max-w-[140px]">{c.fromEmail}</td>
                      <td className="py-3 font-mono text-xs text-amber-400">L{c.level} ({c.ratePercent}%)</td>
                      <td className="py-3 text-xs">
                        <span className={c.status === 'claimed' ? 'text-emerald-400' : 'text-amber-400'}>
                          {c.status === 'claimed' ? 'Claimed' : 'Claimable'}
                        </span>
                      </td>
                      <td className="py-3 text-right font-mono tabular-nums text-emerald-400">
                        +{formatUsd(c.commissionAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-white/8 bg-[#0F131A] p-6 space-y-4">
          <h2 className="font-display text-base font-semibold text-white">Yield &amp; Bonus Ledger</h2>
          {yieldHistory.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 border-t border-white/5">
              No yield or referral claims settled yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/8 text-xs text-slate-400">
                    <th className="py-2.5 font-medium">Description</th>
                    <th className="py-2.5 font-medium">Type</th>
                    <th className="py-2.5 font-medium text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {yieldHistory.map((item) => (
                    <tr key={item.id}>
                      <td className="py-3 text-xs text-slate-200">{item.note || 'Yield settled'}</td>
                      <td className="py-3 text-xs capitalize text-slate-400">{item.type.replace('_', ' ')}</td>
                      <td className="py-3 text-right font-mono tabular-nums text-emerald-400">
                        +{formatUsd(item.amount)}
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
