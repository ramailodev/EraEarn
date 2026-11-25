import { useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Coins,
  Layers,
  Send,
  Shield,
  Users,
  X
} from 'lucide-react';
import { formatUsd } from '../../lib/roi';
import {
  adminBroadcastNotification,
  adminCreditUserBalance,
  adminDistributeYieldToInvestment,
  adminProcessTransaction,
  adminUpdateUserGovernance,
  ensureDefaultPlansSeeded,
  savePlanByAdmin
} from '../../lib/ledger';
import type {
  Investment,
  InvestmentPlan,
  KycStatus,
  NotificationCategory,
  Transaction,
  UserProfile,
  UserRole
} from '../../types';

interface AdminPanelProps {
  allUsers: UserProfile[];
  allInvestments: Investment[];
  allTransactions: Transaction[];
  plans: InvestmentPlan[];
  searchQuery: string;
}

type AdminSection = 'overview' | 'queue' | 'users' | 'investments' | 'plans' | 'broadcast';

export function AdminPanel({
  allUsers,
  allInvestments,
  allTransactions,
  plans,
  searchQuery
}: AdminPanelProps) {
  const [section, setSection] = useState<AdminSection>('overview');
  const [queueFilter, setQueueFilter] = useState<'pending' | 'all'>('pending');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Credit modal state
  const [creditTarget, setCreditTarget] = useState<UserProfile | null>(null);
  const [creditAmount, setCreditAmount] = useState<string>('1000');
  const [creditNote, setCreditNote] = useState<string>('OTC Treasury Deposit Credit');

  // Plan editor state
  const [editingPlan, setEditingPlan] = useState<InvestmentPlan | null>(null);

  // Broadcast state
  const [bcTitle, setBcTitle] = useState('');
  const [bcMessage, setBcMessage] = useState('');
  const [bcCategory, setBcCategory] = useState<NotificationCategory>('system');

  const q = searchQuery.trim().toLowerCase();

  const pendingTransactions = useMemo(
    () => allTransactions.filter((t) => t.status === 'pending'),
    [allTransactions]
  );

  const filteredQueue = useMemo(() => {
    const base = queueFilter === 'pending' ? pendingTransactions : allTransactions;
    if (!q) return base;
    return base.filter(
      (t) =>
        t.userEmail.toLowerCase().includes(q) ||
        t.type.toLowerCase().includes(q) ||
        (t.txHash || '').toLowerCase().includes(q)
    );
  }, [queueFilter, pendingTransactions, allTransactions, q]);

  const filteredUsers = useMemo(() => {
    if (!q) return allUsers;
    return allUsers.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        u.displayName.toLowerCase().includes(q) ||
        (u.walletAddress || '').toLowerCase().includes(q)
    );
  }, [allUsers, q]);

  const totalTvl = useMemo(
    () => allInvestments.filter((i) => i.status === 'active').reduce((s, i) => s + i.principal, 0),
    [allInvestments]
  );
  const totalBalances = useMemo(
    () => allUsers.reduce((s, u) => s + u.availableBalance, 0),
    [allUsers]
  );
  const totalYieldPaid = useMemo(
    () => allUsers.reduce((s, u) => s + u.totalEarned, 0),
    [allUsers]
  );

  async function handleProcessTx(tx: Transaction, decision: 'completed' | 'rejected') {
    setFeedback(null);
    setBusyId(tx.id);
    try {
      await adminProcessTransaction({ tx, decision });
      setFeedback({
        type: 'success',
        text: `${tx.type.toUpperCase()} for ${tx.userEmail} (${formatUsd(tx.amount)}) marked ${decision}.`
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to process transaction.'
      });
    } finally {
      setBusyId(null);
    }
  }

  async function handleCreditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!creditTarget) return;
    const amt = Number(creditAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setFeedback({ type: 'error', text: 'Enter a valid positive USD amount.' });
      return;
    }
    setBusyId(creditTarget.uid);
    setFeedback(null);
    try {
      await adminCreditUserBalance({ targetUser: creditTarget, amount: amt, note: creditNote });
      setFeedback({
        type: 'success',
        text: `Credited ${formatUsd(amt)} to ${creditTarget.email}.`
      });
      setCreditTarget(null);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Credit operation failed.'
      });
    } finally {
      setBusyId(null);
    }
  }

  async function handleGovernanceChange(user: UserProfile, kycStatus: KycStatus, role: UserRole) {
    setBusyId(user.uid);
    setFeedback(null);
    try {
      await adminUpdateUserGovernance({ targetUser: user, kycStatus, role });
      setFeedback({
        type: 'success',
        text: `Updated ${user.email}: KYC ${kycStatus}, Role ${role}.`
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Governance update failed.'
      });
    } finally {
      setBusyId(null);
    }
  }

  async function handleDistributeYield(inv: Investment) {
    setBusyId(inv.id);
    setFeedback(null);
    try {
      await adminDistributeYieldToInvestment(inv);
      setFeedback({
        type: 'success',
        text: `Distributed ${inv.monthlyRoi}% monthly ROI for ${inv.userEmail} (${inv.planName}).`
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Yield distribution failed.'
      });
    } finally {
      setBusyId(null);
    }
  }

  async function handleSavePlan(e: React.FormEvent) {
    e.preventDefault();
    if (!editingPlan) return;
    setBusyId(editingPlan.id);
    setFeedback(null);
    try {
      await savePlanByAdmin(editingPlan);
      setFeedback({ type: 'success', text: `Saved plan tier "${editingPlan.name}".` });
      setEditingPlan(null);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to save plan.'
      });
    } finally {
      setBusyId(null);
    }
  }

  async function handleBroadcast(e: React.FormEvent) {
    e.preventDefault();
    if (!bcTitle.trim() || !bcMessage.trim()) return;
    setBusyId('broadcast');
    setFeedback(null);
    try {
      await adminBroadcastNotification({
        users: allUsers,
        title: bcTitle,
        message: bcMessage,
        category: bcCategory
      });
      setBcTitle('');
      setBcMessage('');
      setFeedback({
        type: 'success',
        text: `Broadcast notification dispatched to ${allUsers.length} investor accounts.`
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Broadcast failed.'
      });
    } finally {
      setBusyId(null);
    }
  }

  const navItems: { id: AdminSection; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'queue', label: `Approvals (${pendingTransactions.length})` },
    { id: 'users', label: `Investors (${allUsers.length})` },
    { id: 'investments', label: `Positions (${allInvestments.length})` },
    { id: 'plans', label: 'Plan Tiers' },
    { id: 'broadcast', label: 'Broadcast' }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-amber-400 flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5" />
            EraEarn Treasury Operations Console
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-white">
            Platform Administration
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-[#0F131A] border border-white/8">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id)}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                section === item.id
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
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

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-white/8 bg-[#0F131A] p-5">
          <p className="text-xs text-slate-400">Active Platform TVL</p>
          <p className="mt-1 text-2xl font-mono font-bold tabular-nums text-white">{formatUsd(totalTvl)}</p>
        </div>
        <div className="rounded-2xl border border-white/8 bg-[#0F131A] p-5">
          <p className="text-xs text-slate-400">Investor Wallet Liabilities</p>
          <p className="mt-1 text-2xl font-mono font-bold tabular-nums text-amber-400">{formatUsd(totalBalances)}</p>
        </div>
        <div className="rounded-2xl border border-white/8 bg-[#0F131A] p-5">
          <p className="text-xs text-slate-400">Total Yield Settled</p>
          <p className="mt-1 text-2xl font-mono font-bold tabular-nums text-emerald-400">{formatUsd(totalYieldPaid)}</p>
        </div>
        <div className="rounded-2xl border border-white/8 bg-[#0F131A] p-5">
          <p className="text-xs text-slate-400">Pending Settlement Queue</p>
          <p className="mt-1 text-2xl font-mono font-bold tabular-nums text-white">{pendingTransactions.length}</p>
        </div>
      </div>

      {/* Section: Overview or Approvals Queue */}
      {(section === 'overview' || section === 'queue') && (
        <div className="rounded-2xl border border-white/8 bg-[#0F131A] p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-base font-semibold text-white">
                Deposit &amp; Withdrawal Settlement Queue
              </h2>
              <p className="text-xs text-slate-400">
                Approve verified crypto deposits or settle/reject withdrawal requests.
              </p>
            </div>
            <div className="flex items-center gap-1 p-1 rounded-xl bg-[#07090D] border border-white/8">
              <button
                type="button"
                onClick={() => setQueueFilter('pending')}
                className={`px-3 py-1 rounded-lg text-xs font-medium cursor-pointer ${
                  queueFilter === 'pending' ? 'bg-amber-500 text-slate-950 font-semibold' : 'text-slate-400'
                }`}
              >
                Pending ({pendingTransactions.length})
              </button>
              <button
                type="button"
                onClick={() => setQueueFilter('all')}
                className={`px-3 py-1 rounded-lg text-xs font-medium cursor-pointer ${
                  queueFilter === 'all' ? 'bg-amber-500 text-slate-950 font-semibold' : 'text-slate-400'
                }`}
              >
                All Ledger
              </button>
            </div>
          </div>

          {filteredQueue.length === 0 ? (
            <p className="text-sm text-slate-400 py-8 text-center border-t border-white/5">
              No {queueFilter === 'pending' ? 'pending' : ''} transactions in queue.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/8 text-xs text-slate-400">
                    <th className="py-2.5 font-medium">Investor</th>
                    <th className="py-2.5 font-medium">Type</th>
                    <th className="py-2.5 font-medium">Hash / Address</th>
                    <th className="py-2.5 font-medium">Status</th>
                    <th className="py-2.5 font-medium text-right">Amount</th>
                    <th className="py-2.5 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredQueue.map((tx) => (
                    <tr key={tx.id}>
                      <td className="py-3 text-slate-200 text-xs">{tx.userEmail}</td>
                      <td className="py-3 capitalize text-slate-200 font-medium">
                        {tx.type.replace('_', ' ')} ({tx.asset})
                      </td>
                      <td className="py-3 font-mono text-xs text-slate-400 max-w-[180px] truncate">
                        {tx.txHash || tx.toAddress || tx.note || '—'}
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
                          {tx.status}
                        </span>
                      </td>
                      <td className="py-3 text-right font-mono tabular-nums text-white">
                        {formatUsd(tx.amount)}
                      </td>
                      <td className="py-3 text-right">
                        {tx.status === 'pending' ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={busyId === tx.id}
                              onClick={() => handleProcessTx(tx, 'completed')}
                              className="min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500 text-slate-950 font-semibold text-xs hover:bg-emerald-400 cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                              Approve
                            </button>
                            <button
                              type="button"
                              disabled={busyId === tx.id}
                              onClick={() => handleProcessTx(tx, 'rejected')}
                              className="min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rose-500/40 text-rose-300 text-xs hover:bg-rose-500/15 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500">Settled</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Section: Investors Directory */}
      {(section === 'overview' || section === 'users') && (
        <div className="rounded-2xl border border-white/8 bg-[#0F131A] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-amber-400" />
              Investor Directory &amp; Governance
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/8 text-xs text-slate-400">
                  <th className="py-2.5 font-medium">Investor</th>
                  <th className="py-2.5 font-medium text-right">Available</th>
                  <th className="py-2.5 font-medium text-right">Invested</th>
                  <th className="py-2.5 font-medium">KYC Status</th>
                  <th className="py-2.5 font-medium">Role</th>
                  <th className="py-2.5 font-medium text-right">Treasury</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredUsers.map((u) => (
                  <tr key={u.uid}>
                    <td className="py-3">
                      <p className="text-slate-100 font-medium">{u.displayName}</p>
                      <p className="text-xs text-slate-400">{u.email}</p>
                    </td>
                    <td className="py-3 text-right font-mono tabular-nums text-white">
                      {formatUsd(u.availableBalance)}
                    </td>
                    <td className="py-3 text-right font-mono tabular-nums text-emerald-400">
                      {formatUsd(u.totalInvested)}
                    </td>
                    <td className="py-3">
                      <select
                        value={u.kycStatus}
                        disabled={busyId === u.uid}
                        onChange={(e) =>
                          handleGovernanceChange(u, e.target.value as KycStatus, u.role)
                        }
                        className="h-8 px-2 rounded-lg bg-[#07090D] border border-white/10 text-xs text-slate-200"
                      >
                        <option value="unverified">unverified</option>
                        <option value="pending">pending</option>
                        <option value="verified">verified</option>
                        <option value="suspended">suspended</option>
                      </select>
                    </td>
                    <td className="py-3">
                      <select
                        value={u.role}
                        disabled={busyId === u.uid}
                        onChange={(e) =>
                          handleGovernanceChange(u, u.kycStatus, e.target.value as UserRole)
                        }
                        className="h-8 px-2 rounded-lg bg-[#07090D] border border-white/10 text-xs text-slate-200"
                      >
                        <option value="investor">investor</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                    <td className="py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setCreditTarget(u)}
                        className="min-h-[34px] inline-flex items-center gap-1 px-3 py-1 rounded-lg border border-amber-500/40 text-amber-400 text-xs font-medium hover:bg-amber-500/10 cursor-pointer"
                      >
                        <Coins className="w-3.5 h-3.5" />
                        Credit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Section: Active Investments & Monthly ROI Settlement */}
      {section === 'investments' && (
        <div className="rounded-2xl border border-white/8 bg-[#0F131A] p-6 space-y-4">
          <h2 className="font-display text-base font-semibold text-white">
            Active Investment Positions
          </h2>
          {allInvestments.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">No investment positions created yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/8 text-xs text-slate-400">
                    <th className="py-2.5 font-medium">Investor</th>
                    <th className="py-2.5 font-medium">Plan</th>
                    <th className="py-2.5 font-medium text-right">Principal</th>
                    <th className="py-2.5 font-medium text-right">ROI / Mo</th>
                    <th className="py-2.5 font-medium text-right">Total Claimed</th>
                    <th className="py-2.5 font-medium text-right">Settlement</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {allInvestments.map((inv) => (
                    <tr key={inv.id}>
                      <td className="py-3 text-xs text-slate-300">{inv.userEmail}</td>
                      <td className="py-3 text-slate-100 font-medium">{inv.planName}</td>
                      <td className="py-3 text-right font-mono tabular-nums text-white">
                        {formatUsd(inv.principal)}
                      </td>
                      <td className="py-3 text-right font-mono tabular-nums text-emerald-400">
                        {inv.monthlyRoi.toFixed(2)}%
                      </td>
                      <td className="py-3 text-right font-mono tabular-nums text-slate-300">
                        {formatUsd(inv.totalClaimed)}
                      </td>
                      <td className="py-3 text-right">
                        <button
                          type="button"
                          disabled={busyId === inv.id || inv.status !== 'active'}
                          onClick={() => handleDistributeYield(inv)}
                          className="min-h-[34px] px-3 py-1 rounded-lg bg-emerald-500 text-slate-950 font-semibold text-xs hover:bg-emerald-400 disabled:opacity-45 cursor-pointer"
                        >
                          Settle 1-Mo ROI
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Section: Plan Tiers Management */}
      {section === 'plans' && (
        <div className="rounded-2xl border border-white/8 bg-[#0F131A] p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-base font-semibold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-400" />
                Manage Investment Tiers
              </h2>
              <p className="text-xs text-slate-400">
                Changes propagate immediately to the Landing Page calculator and Investor Plans tab.
              </p>
            </div>
            <button
              type="button"
              onClick={ensureDefaultPlansSeeded}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-white/12 bg-[#07090D] text-xs font-medium text-slate-200 hover:bg-white/5 cursor-pointer"
            >
              Restore Default Tiers
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {plans.map((p) => (
              <div key={p.id} className="rounded-xl border border-white/8 bg-[#07090D] p-5 space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-mono">{p.tierCode}</span>
                  <span className={p.isActive ? 'text-emerald-400' : 'text-rose-400'}>
                    {p.isActive ? 'Active' : 'Paused'}
                  </span>
                </div>
                <h3 className="font-display font-bold text-white">{p.name}</h3>
                <p className="font-mono text-xs text-amber-400 tabular-nums">
                  ${p.minAmount.toLocaleString()} – ${p.maxAmount >= 1000000 ? '∞' : p.maxAmount.toLocaleString()}
                </p>
                <p className="font-mono text-lg font-bold text-emerald-400 tabular-nums">
                  {p.minMonthlyRoi}% – {p.maxMonthlyRoi}% / mo
                </p>
                <button
                  type="button"
                  onClick={() => setEditingPlan({ ...p })}
                  className="w-full min-h-[38px] rounded-lg border border-white/12 text-xs font-medium text-slate-200 hover:bg-white/5 cursor-pointer"
                >
                  Edit Parameters
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section: Broadcast Notification */}
      {section === 'broadcast' && (
        <form onSubmit={handleBroadcast} className="rounded-2xl border border-white/8 bg-[#0F131A] p-6 space-y-4 max-w-2xl">
          <h2 className="font-display text-base font-semibold text-white flex items-center gap-2">
            <Send className="w-4 h-4 text-amber-400" />
            Broadcast Platform Notification
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs text-slate-400 mb-1.5">Announcement Title</label>
              <input
                type="text"
                value={bcTitle}
                onChange={(e) => setBcTitle(e.target.value)}
                placeholder="Monthly Yield Settlement Notice"
                required
                className="w-full h-11 px-3 rounded-xl bg-[#07090D] border border-white/10 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Category</label>
              <select
                value={bcCategory}
                onChange={(e) => setBcCategory(e.target.value as NotificationCategory)}
                className="w-full h-11 px-3 rounded-xl bg-[#07090D] border border-white/10 text-sm text-white"
              >
                <option value="system">System</option>
                <option value="yield">Yield</option>
                <option value="wallet">Wallet</option>
                <option value="security">Security</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Message</label>
            <textarea
              rows={3}
              value={bcMessage}
              onChange={(e) => setBcMessage(e.target.value)}
              placeholder="Write announcement for all EraEarn investors…"
              required
              className="w-full p-3 rounded-xl bg-[#07090D] border border-white/10 text-sm text-white"
            />
          </div>
          <button
            type="submit"
            disabled={busyId === 'broadcast'}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-semibold text-sm hover:bg-amber-400 cursor-pointer"
          >
            {busyId === 'broadcast' ? 'Dispatching…' : `Send to ${allUsers.length} Users`}
          </button>
        </form>
      )}

      {/* Modal: Credit Investor Balance */}
      {creditTarget && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleCreditSubmit}
            className="max-w-md w-full rounded-2xl border border-white/12 bg-[#0F131A] p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-white">Credit Investor Wallet</h3>
              <button
                type="button"
                onClick={() => setCreditTarget(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-400">Recipient: <strong className="text-slate-200">{creditTarget.email}</strong></p>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Amount (USD)</label>
              <input
                type="number"
                min={1}
                step="any"
                value={creditAmount}
                onChange={(e) => setCreditAmount(e.target.value)}
                required
                className="w-full h-11 px-3 rounded-xl bg-[#07090D] border border-white/10 font-mono text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Ledger Note</label>
              <input
                type="text"
                value={creditNote}
                onChange={(e) => setCreditNote(e.target.value)}
                required
                className="w-full h-11 px-3 rounded-xl bg-[#07090D] border border-white/10 text-sm text-white"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCreditTarget(null)}
                className="min-h-[40px] px-4 rounded-xl border border-white/12 text-xs text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busyId === creditTarget.uid}
                className="min-h-[40px] px-5 rounded-xl bg-amber-500 text-slate-950 font-semibold text-xs cursor-pointer"
              >
                Credit Funds
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Edit Plan Parameters */}
      {editingPlan && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSavePlan}
            className="max-w-lg w-full rounded-2xl border border-white/12 bg-[#0F131A] p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-white">Edit {editingPlan.tierCode} Plan</h3>
              <button
                type="button"
                onClick={() => setEditingPlan(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Plan Name</label>
                <input
                  type="text"
                  value={editingPlan.name}
                  onChange={(e) => setEditingPlan({ ...editingPlan, name: e.target.value })}
                  required
                  className="w-full h-10 px-3 rounded-xl bg-[#07090D] border border-white/10 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Lock Days</label>
                <input
                  type="number"
                  min={1}
                  value={editingPlan.lockDays}
                  onChange={(e) => setEditingPlan({ ...editingPlan, lockDays: Number(e.target.value) })}
                  required
                  className="w-full h-10 px-3 rounded-xl bg-[#07090D] border border-white/10 font-mono text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Min Amount ($)</label>
                <input
                  type="number"
                  min={10}
                  value={editingPlan.minAmount}
                  onChange={(e) => setEditingPlan({ ...editingPlan, minAmount: Number(e.target.value) })}
                  required
                  className="w-full h-10 px-3 rounded-xl bg-[#07090D] border border-white/10 font-mono text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Max Amount ($)</label>
                <input
                  type="number"
                  min={editingPlan.minAmount}
                  value={editingPlan.maxAmount}
                  onChange={(e) => setEditingPlan({ ...editingPlan, maxAmount: Number(e.target.value) })}
                  required
                  className="w-full h-10 px-3 rounded-xl bg-[#07090D] border border-white/10 font-mono text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Min Monthly ROI (%)</label>
                <input
                  type="number"
                  step="0.1"
                  min={0.5}
                  max={50}
                  value={editingPlan.minMonthlyRoi}
                  onChange={(e) => setEditingPlan({ ...editingPlan, minMonthlyRoi: Number(e.target.value) })}
                  required
                  className="w-full h-10 px-3 rounded-xl bg-[#07090D] border border-white/10 font-mono text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Max Monthly ROI (%)</label>
                <input
                  type="number"
                  step="0.1"
                  min={editingPlan.minMonthlyRoi}
                  max={50}
                  value={editingPlan.maxMonthlyRoi}
                  onChange={(e) => setEditingPlan({ ...editingPlan, maxMonthlyRoi: Number(e.target.value) })}
                  required
                  className="w-full h-10 px-3 rounded-xl bg-[#07090D] border border-white/10 font-mono text-sm text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Description</label>
              <textarea
                rows={2}
                value={editingPlan.description}
                onChange={(e) => setEditingPlan({ ...editingPlan, description: e.target.value })}
                required
                className="w-full p-3 rounded-xl bg-[#07090D] border border-white/10 text-sm text-white"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingPlan.isActive}
                  onChange={(e) => setEditingPlan({ ...editingPlan, isActive: e.target.checked })}
                  className="accent-amber-500"
                />
                Plan Active
              </label>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditingPlan(null)}
                  className="min-h-[40px] px-4 rounded-xl border border-white/12 text-xs text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busyId === editingPlan.id}
                  className="min-h-[40px] px-5 rounded-xl bg-amber-500 text-slate-950 font-semibold text-xs cursor-pointer"
                >
                  Save Plan
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
