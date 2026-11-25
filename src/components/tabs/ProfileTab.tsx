import { useState } from 'react';
import { CheckCircle2, LogOut, Shield, ShieldCheck, UserCheck } from 'lucide-react';
import { formatUsd } from '../../lib/roi';
import { updateInvestorDisplayName } from '../../lib/ledger';
import { shortenAddress } from '../../lib/web3';
import type { UserProfile } from '../../types';

interface ProfileTabProps {
  profile: UserProfile;
  isAdmin: boolean;
  onOpenAdminPanel: () => void;
  onSignOut: () => void;
}

export function ProfileTab({
  profile,
  isAdmin,
  onOpenAdminPanel,
  onSignOut
}: ProfileTabProps) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName.trim()) return;
    setSaving(true);
    setSavedNotice(false);
    try {
      await updateInvestorDisplayName(profile.uid, displayName);
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-white">
          Investor Profile &amp; Security
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Manage your identity, blockchain custody status, and administrative access.
        </p>
      </div>

      {/* Account Header Card */}
      <div className="rounded-2xl border border-white/8 bg-[#0F131A] p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {profile.photoURL ? (
            <img
              src={profile.photoURL}
              alt={profile.displayName}
              referrerPolicy="no-referrer"
              className="w-14 h-14 rounded-2xl object-cover border border-white/10"
            />
          ) : (
            <div className="w-14 h-14 rounded-2xl bg-amber-500/20 text-amber-400 font-display font-bold text-xl flex items-center justify-center">
              {(profile.displayName[0] || 'E').toUpperCase()}
            </div>
          )}
          <div>
            <h2 className="font-display text-lg font-bold text-white">{profile.displayName}</h2>
            <p className="text-xs text-slate-400">{profile.email}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
              <span>Role: <strong className="text-slate-200 capitalize">{isAdmin ? 'Admin' : profile.role}</strong></span>
              <span aria-hidden="true">·</span>
              <span>KYC: <strong className={profile.kycStatus === 'verified' ? 'text-emerald-400' : 'text-amber-400'}>{profile.kycStatus}</strong></span>
            </div>
          </div>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={onOpenAdminPanel}
            className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-semibold text-sm hover:bg-amber-400 transition-colors cursor-pointer"
          >
            <Shield className="w-4 h-4" />
            Open Admin Panel
          </button>
        )}
      </div>

      {/* Update Profile Form */}
      <form onSubmit={handleSaveName} className="rounded-2xl border border-white/8 bg-[#0F131A] p-6 space-y-4">
        <h3 className="font-display text-base font-semibold text-white">Display Identity</h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={120}
            required
            className="flex-1 h-11 px-4 rounded-xl bg-[#07090D] border border-white/10 text-sm text-white focus:outline-none focus:border-amber-500"
          />
          <button
            type="submit"
            disabled={saving}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-white text-slate-950 font-semibold text-sm hover:bg-slate-200 transition-colors disabled:opacity-60 cursor-pointer"
          >
            {saving ? 'Saving…' : 'Save Name'}
          </button>
        </div>
        {savedNotice && (
          <p className="text-xs text-emerald-400 inline-flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Profile updated in Firestore.
          </p>
        )}
      </form>

      {/* Security & Account Summary */}
      <div className="rounded-2xl border border-white/8 bg-[#0F131A] p-6 space-y-4">
        <h3 className="font-display text-base font-semibold text-white">Custody &amp; Verification Summary</h3>
        <div className="divide-y divide-white/5 text-sm">
          <div className="py-3 flex items-center justify-between">
            <span className="text-slate-400 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-slate-400" />
              Web3 Wallet Binding
            </span>
            <span className="font-mono text-xs text-slate-200">
              {profile.walletAddress
                ? `${shortenAddress(profile.walletAddress)} (${profile.walletVerified ? 'Signed' : 'Unverified'})`
                : 'Not Connected'}
            </span>
          </div>
          <div className="py-3 flex items-center justify-between">
            <span className="text-slate-400 flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-slate-400" />
              Account UID
            </span>
            <span className="font-mono text-xs text-slate-300">{profile.uid}</span>
          </div>
          <div className="py-3 flex items-center justify-between">
            <span className="text-slate-400">Total Earned Yield</span>
            <span className="font-mono tabular-nums text-emerald-400 font-semibold">
              {formatUsd(profile.totalEarned)}
            </span>
          </div>
        </div>
      </div>

      {/* Sign Out */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onSignOut}
          className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 font-medium text-sm hover:bg-rose-500/20 transition-colors cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          Sign Out of EraEarn
        </button>
      </div>
    </div>
  );
}
