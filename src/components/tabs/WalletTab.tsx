import { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Copy,
  Link2,
  Search,
  ShieldCheck,
  Zap
} from 'lucide-react';
import { formatUsd } from '../../lib/roi';
import {
  bindWalletAddress,
  executeAutoDeposit,
  executeAutoWithdrawal
} from '../../lib/ledger';
import {
  connectAndSignWeb3Wallet,
  hasInjectedWallet,
  normalizeEvmAddress,
  shortenAddress,
  verifyOnChainTxHash
} from '../../lib/web3';
import type { AssetSymbol, MarketSnapshot, Transaction, UserProfile } from '../../types';

interface WalletTabProps {
  profile: UserProfile;
  transactions: Transaction[];
  market: MarketSnapshot | null;
}

const TREASURY_VAULT_ADDRESS = '0x71C7656EC7ab88b098defB751B7401B5f6d8976F';
const DEPOSIT_PRESETS = [100, 500, 1000, 5000, 10000];

export function WalletTab({ profile, transactions, market }: WalletTabProps) {
  const [activeAction, setActiveAction] = useState<'deposit' | 'withdraw'>('deposit');
  const [txFilter, setTxFilter] = useState<
    'all' | 'deposit' | 'withdrawal' | 'investment' | 'yield_claim' | 'referral_bonus'
  >('all');
  const [ledgerSearch, setLedgerSearch] = useState('');

  // Web3 state
  const [connectingWeb3, setConnectingWeb3] = useState(false);
  const [manualAddress, setManualAddress] = useState(profile.walletAddress || '');
  const [chainInfo, setChainInfo] = useState<{ chainName: string; ethBalance: string } | null>(null);
  const [copiedVault, setCopiedVault] = useState(false);

  // Automated Deposit form
  const [depAmount, setDepAmount] = useState<string>('1000');
  const [depAsset, setDepAsset] = useState<AssetSymbol>('USDT');
  const [depNetwork, setDepNetwork] = useState<string>('Ethereum (ERC-20)');
  const [depMode, setDepMode] = useState<'instant' | 'onchain'>('instant');
  const [depTxHash, setDepTxHash] = useState<string>('');
  const [txVerifyMsg, setTxVerifyMsg] = useState<string | null>(null);
  const [verifyingTx, setVerifyingTx] = useState(false);

  // Automated Withdrawal form
  const [wdAmount, setWdAmount] = useState<string>('250');
  const [wdAsset, setWdAsset] = useState<AssetSymbol>('USDT');
  const [wdNetwork, setWdNetwork] = useState<string>('Ethereum (ERC-20)');
  const [wdAddress, setWdAddress] = useState<string>(profile.walletAddress || '');
  const [wdInstantMode, setWdInstantMode] = useState<boolean>(true);

  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const ethPrice = market?.assets.find((a) => a.symbol === 'ETH')?.price ?? 3428;

  const depCryptoEstimate = useMemo(() => {
    const amt = Number(depAmount) || 0;
    if (depAsset === 'ETH') return `${(amt / ethPrice).toFixed(5)} ETH`;
    return `${amt.toFixed(2)} ${depAsset}`;
  }, [depAmount, depAsset, ethPrice]);

  const wdCryptoEstimate = useMemo(() => {
    const amt = Number(wdAmount) || 0;
    if (wdAsset === 'ETH') return `${(amt / ethPrice).toFixed(5)} ETH`;
    return `${amt.toFixed(2)} ${wdAsset}`;
  }, [wdAmount, wdAsset, ethPrice]);

  const filteredTx = useMemo(() => {
    const q = ledgerSearch.trim().toLowerCase();
    return transactions.filter((t) => {
      if (txFilter !== 'all' && t.type !== txFilter) return false;
      if (!q) return true;
      return (
        t.type.toLowerCase().includes(q) ||
        t.asset.toLowerCase().includes(q) ||
        (t.txHash || '').toLowerCase().includes(q) ||
        (t.toAddress || '').toLowerCase().includes(q) ||
        (t.note || '').toLowerCase().includes(q)
      );
    });
  }, [transactions, txFilter, ledgerSearch]);

  async function handleConnectWeb3() {
    setFeedback(null);
    setConnectingWeb3(true);
    try {
      const state = await connectAndSignWeb3Wallet(profile.email);
      await bindWalletAddress(profile.uid, state.address, true);
      setManualAddress(state.address);
      setWdAddress(state.address);
      setChainInfo({ chainName: state.chainName, ethBalance: state.nativeBalanceEth });
      setFeedback({
        type: 'success',
        text: `Cryptographically verified and bound ${shortenAddress(state.address)} (${state.chainName}).`
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to connect Web3 wallet.'
      });
    } finally {
      setConnectingWeb3(false);
    }
  }

  async function handleBindManualAddress() {
    setFeedback(null);
    const normalized = normalizeEvmAddress(manualAddress);
    if (!normalized) {
      setFeedback({ type: 'error', text: 'Enter a valid 0x Ethereum/EVM checksum address.' });
      return;
    }
    try {
      await bindWalletAddress(profile.uid, normalized, false);
      setWdAddress(normalized);
      setFeedback({
        type: 'success',
        text: `Saved EVM destination address ${shortenAddress(normalized)}.`
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to save wallet address.'
      });
    }
  }

  async function handleInspectTxHash() {
    if (!depTxHash.trim()) return;
    setVerifyingTx(true);
    setTxVerifyMsg(null);
    try {
      const result = await verifyOnChainTxHash(depTxHash.trim());
      if (!result.validFormat) {
        setTxVerifyMsg('Invalid 0x transaction hash format (expected 66 hex characters).');
      } else if (result.foundOnChain) {
        setTxVerifyMsg(
          `Confirmed on ${result.network} · Block #${result.blockNumber ?? 'Pending'} · Value ${result.valueEth} ETH`
        );
      } else {
        setTxVerifyMsg('Valid EVM hash format. Ready for instant automated settlement.');
      }
    } catch {
      setTxVerifyMsg('RPC check skipped; gateway settlement remains available.');
    } finally {
      setVerifyingTx(false);
    }
  }

  async function handleAutoDeposit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    const amt = Number(depAmount);
    if (!Number.isFinite(amt) || amt < 10 || amt > 100000) {
      setFeedback({ type: 'error', text: 'Deposit amount must be between $10.00 and $100,000.00.' });
      return;
    }
    if (depMode === 'onchain' && !/^0x[a-fA-F0-9]{64}$/.test(depTxHash.trim())) {
      setFeedback({ type: 'error', text: 'Enter a valid 66-character 0x EVM transaction hash.' });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/wallet/auto-settle-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amt,
          asset: depAsset,
          network: depNetwork,
          txHash: depMode === 'onchain' ? depTxHash.trim() : ''
        })
      });

      const settlement = (await res.json()) as {
        settled?: boolean;
        amount?: number;
        txHash?: string;
        verificationMethod?: string;
        error?: string;
      };

      if (!res.ok || !settlement.settled || !settlement.txHash) {
        throw new Error(settlement.error || 'Automated deposit settlement rejected.');
      }

      await executeAutoDeposit({
        userId: profile.uid,
        userEmail: profile.email,
        amount: settlement.amount ?? amt,
        asset: depAsset,
        network: depNetwork,
        txHash: settlement.txHash,
        note: `Auto-settled ${depAsset} (${settlement.verificationMethod?.replace(/_/g, ' ')})`
      });

      setDepTxHash('');
      setTxVerifyMsg(null);
      setFeedback({
        type: 'success',
        text: `Automated Deposit Complete: +${formatUsd(amt)} (${depCryptoEstimate}) credited instantly. Receipt ${shortenAddress(settlement.txHash)}.`
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to settle deposit.'
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAutoWithdraw(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    const amt = Number(wdAmount);
    if (!Number.isFinite(amt) || amt < 10) {
      setFeedback({ type: 'error', text: 'Minimum withdrawal is $10.00.' });
      return;
    }
    if (amt > profile.availableBalance) {
      setFeedback({
        type: 'error',
        text: `Insufficient available balance (${formatUsd(profile.availableBalance)}).`
      });
      return;
    }
    const normalized = normalizeEvmAddress(wdAddress);
    if (!normalized) {
      setFeedback({ type: 'error', text: 'Enter a valid 0x EVM withdrawal address.' });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/wallet/auto-settle-withdrawal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amt,
          asset: wdAsset,
          network: wdNetwork,
          toAddress: normalized
        })
      });

      const settlement = (await res.json()) as {
        settled?: boolean;
        txHash?: string;
        toAddress?: string;
        error?: string;
      };

      if (!res.ok || !settlement.settled || !settlement.txHash) {
        throw new Error(settlement.error || 'Withdrawal settlement failed.');
      }

      await executeAutoWithdrawal({
        userId: profile.uid,
        userEmail: profile.email,
        amount: amt,
        asset: wdAsset,
        network: wdNetwork,
        toAddress: settlement.toAddress || normalized,
        txHash: settlement.txHash,
        instantMode: wdInstantMode
      });

      setFeedback({
        type: 'success',
        text: wdInstantMode
          ? `Automated Withdrawal Dispatched: ${formatUsd(amt)} (${wdCryptoEstimate}) sent to ${shortenAddress(normalized)}. TX ${shortenAddress(settlement.txHash)}.`
          : `Withdrawal of ${formatUsd(amt)} queued for manual treasury review.`
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to process withdrawal.'
      });
    } finally {
      setSubmitting(false);
    }
  }

  function handleCopyTreasury() {
    navigator.clipboard?.writeText(TREASURY_VAULT_ADDRESS);
    setCopiedVault(true);
    setTimeout(() => setCopiedVault(false), 2000);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-white">
            Automated Wallet &amp; Blockchain Settlement
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Instant automated deposits and EVM withdrawals backed by live market pricing and ethers.js verification.
          </p>
        </div>
        <div className="text-right font-mono tabular-nums">
          <p className="text-xs text-slate-400">Available Wallet Balance</p>
          <p className="text-2xl font-bold text-white">{formatUsd(profile.availableBalance)}</p>
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Blockchain Wallet Connection Card */}
        <div className="lg:col-span-5 rounded-2xl border border-white/8 bg-[#0F131A] p-6 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-semibold text-white">
                Web3 Blockchain Verification
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                EIP-191 signature verification · Zero gas fee
              </p>
            </div>
            <ShieldCheck
              className={`w-5 h-5 shrink-0 ${
                profile.walletVerified ? 'text-emerald-400' : 'text-slate-500'
              }`}
            />
          </div>

          <div className="rounded-xl bg-[#07090D] border border-white/8 p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Bound Address</span>
              <span className={profile.walletVerified ? 'text-emerald-400' : 'text-amber-400'}>
                {profile.walletVerified
                  ? 'Signature Verified'
                  : profile.walletAddress
                    ? 'Address Saved'
                    : 'Not Connected'}
              </span>
            </div>
            <p className="font-mono text-xs text-slate-200 break-all">
              {profile.walletAddress || 'No wallet bound yet'}
            </p>
            {chainInfo && (
              <p className="text-xs font-mono text-slate-400 tabular-nums">
                {chainInfo.chainName} · {chainInfo.ethBalance} ETH
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={handleConnectWeb3}
            disabled={connectingWeb3}
            className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-semibold text-sm hover:bg-amber-400 transition-colors disabled:opacity-60 cursor-pointer"
          >
            <Link2 className="w-4 h-4" />
            {connectingWeb3
              ? 'Awaiting Wallet Signature…'
              : hasInjectedWallet()
                ? 'Connect & Sign with MetaMask'
                : 'Connect Browser Web3 Wallet'}
          </button>

          <div className="pt-3 border-t border-white/8 space-y-2.5">
            <label htmlFor="manual-evm-address" className="block text-xs text-slate-400">
              Bind or update EVM payout address
            </label>
            <div className="flex gap-2">
              <input
                id="manual-evm-address"
                type="text"
                value={manualAddress}
                onChange={(e) => setManualAddress(e.target.value)}
                placeholder="0x..."
                className="flex-1 h-10 px-3 rounded-xl bg-[#07090D] border border-white/10 text-xs font-mono text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
              />
              <button
                type="button"
                onClick={handleBindManualAddress}
                className="min-h-[40px] px-4 rounded-xl border border-white/12 bg-[#07090D] text-xs font-medium text-slate-200 hover:bg-white/5 transition-colors cursor-pointer"
              >
                Save
              </button>
            </div>
          </div>
        </div>

        {/* Automated Deposit / Withdrawal Desk */}
        <div className="lg:col-span-7 rounded-2xl border border-white/8 bg-[#0F131A] p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1 p-1 rounded-xl bg-[#07090D] border border-white/8 w-fit">
              <button
                type="button"
                onClick={() => {
                  setActiveAction('deposit');
                  setFeedback(null);
                }}
                className={`min-h-[38px] inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  activeAction === 'deposit'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <ArrowDownLeft className="w-3.5 h-3.5" />
                Auto-Deposit
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveAction('withdraw');
                  setFeedback(null);
                }}
                className={`min-h-[38px] inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  activeAction === 'withdraw'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                Auto-Withdraw
              </button>
            </div>

            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
              <Zap className="w-3.5 h-3.5" />
              Instant Settlement Active
            </span>
          </div>

          {activeAction === 'deposit' ? (
            <form onSubmit={handleAutoDeposit} className="space-y-4">
              {/* Settlement Mode Switch */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDepMode('instant')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    depMode === 'instant'
                      ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-300'
                      : 'bg-[#07090D] border border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  Instant Automated Gateway
                </button>
                <button
                  type="button"
                  onClick={() => setDepMode('onchain')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    depMode === 'onchain'
                      ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-300'
                      : 'bg-[#07090D] border border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  On-Chain TX Hash Auto-Verify
                </button>
              </div>

              {depMode === 'onchain' && (
                <div className="rounded-xl bg-[#07090D] border border-white/8 p-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-slate-400">EraEarn Treasury Custody Address (ERC-20 / Base / Arbitrum)</p>
                    <p className="mt-1 font-mono text-xs text-amber-400 break-all">{TREASURY_VAULT_ADDRESS}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyTreasury}
                    className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/12 text-xs text-slate-200 hover:bg-white/5 cursor-pointer shrink-0"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    {copiedVault ? 'Copied' : 'Copy'}
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Amount (USD)</label>
                  <input
                    type="number"
                    min={10}
                    max={100000}
                    step="any"
                    value={depAmount}
                    onChange={(e) => setDepAmount(e.target.value)}
                    required
                    className="w-full h-11 px-3 rounded-xl bg-[#07090D] border border-white/10 font-mono text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Asset</label>
                  <select
                    value={depAsset}
                    onChange={(e) => setDepAsset(e.target.value as AssetSymbol)}
                    className="w-full h-11 px-3 rounded-xl bg-[#07090D] border border-white/10 text-sm text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="USDT">USDT</option>
                    <option value="USDC">USDC</option>
                    <option value="ETH">ETH</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Network</label>
                  <select
                    value={depNetwork}
                    onChange={(e) => setDepNetwork(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl bg-[#07090D] border border-white/10 text-sm text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="Ethereum (ERC-20)">Ethereum (ERC-20)</option>
                    <option value="Base Mainnet">Base Mainnet</option>
                    <option value="Arbitrum One">Arbitrum One</option>
                    <option value="Polygon">Polygon</option>
                    <option value="BNB Smart Chain">BNB Smart Chain</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1.5">
                  {DEPOSIT_PRESETS.map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setDepAmount(String(amt))}
                      className={`px-2.5 py-1 rounded-lg text-xs font-mono tabular-nums cursor-pointer ${
                        Number(depAmount) === amt
                          ? 'bg-amber-500 text-slate-950 font-semibold'
                          : 'bg-[#07090D] border border-white/10 text-slate-300 hover:border-white/25'
                      }`}
                    >
                      ${amt.toLocaleString()}
                    </button>
                  ))}
                </div>
                <span className="text-xs font-mono text-slate-400 tabular-nums">
                  ≈ {depCryptoEstimate}
                </span>
              </div>

              {depMode === 'onchain' && (
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">On-Chain Transaction Hash (0x…)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={depTxHash}
                      onChange={(e) => setDepTxHash(e.target.value)}
                      placeholder="0x…"
                      required
                      className="flex-1 h-11 px-3 rounded-xl bg-[#07090D] border border-white/10 font-mono text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
                    />
                    <button
                      type="button"
                      onClick={handleInspectTxHash}
                      disabled={verifyingTx || !depTxHash.trim()}
                      className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 rounded-xl border border-white/12 bg-[#07090D] text-xs font-medium text-slate-200 hover:bg-white/5 disabled:opacity-50 cursor-pointer"
                    >
                      <Search className="w-3.5 h-3.5" />
                      {verifyingTx ? 'Checking…' : 'Verify TX'}
                    </button>
                  </div>
                  {txVerifyMsg && (
                    <p className="mt-1.5 text-xs text-amber-400">{txVerifyMsg}</p>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[44px] rounded-xl bg-amber-500 text-slate-950 font-semibold text-sm hover:bg-amber-400 transition-colors disabled:opacity-60 cursor-pointer"
              >
                {submitting
                  ? 'Settling Deposit…'
                  : depMode === 'instant'
                    ? `Instant Auto-Deposit ${formatUsd(Number(depAmount) || 0)}`
                    : 'Verify On-Chain & Auto-Credit'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleAutoWithdraw} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Amount (USD)</label>
                  <input
                    type="number"
                    min={10}
                    step="any"
                    value={wdAmount}
                    onChange={(e) => setWdAmount(e.target.value)}
                    required
                    className="w-full h-11 px-3 rounded-xl bg-[#07090D] border border-white/10 font-mono text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Asset</label>
                  <select
                    value={wdAsset}
                    onChange={(e) => setWdAsset(e.target.value as AssetSymbol)}
                    className="w-full h-11 px-3 rounded-xl bg-[#07090D] border border-white/10 text-sm text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="USDT">USDT</option>
                    <option value="USDC">USDC</option>
                    <option value="ETH">ETH</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Network</label>
                  <select
                    value={wdNetwork}
                    onChange={(e) => setWdNetwork(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl bg-[#07090D] border border-white/10 text-sm text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="Ethereum (ERC-20)">Ethereum (ERC-20)</option>
                    <option value="Base Mainnet">Base Mainnet</option>
                    <option value="Arbitrum One">Arbitrum One</option>
                    <option value="Polygon">Polygon</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-1.5">
                  {[
                    { label: '25%', mult: 0.25 },
                    { label: '50%', mult: 0.5 },
                    { label: 'Max', mult: 1 }
                  ].map((pct) => (
                    <button
                      key={pct.label}
                      type="button"
                      onClick={() =>
                        setWdAmount(String(Math.max(0, Number((profile.availableBalance * pct.mult).toFixed(2)))))
                      }
                      className="px-2.5 py-1 rounded-lg bg-[#07090D] border border-white/10 text-xs font-mono text-slate-300 hover:border-amber-500/50 cursor-pointer"
                    >
                      {pct.label}
                    </button>
                  ))}
                </div>
                <span className="text-xs font-mono text-slate-400 tabular-nums">
                  Payout ≈ {wdCryptoEstimate}
                </span>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Destination EVM Wallet Address (0x…)</label>
                <input
                  type="text"
                  value={wdAddress}
                  onChange={(e) => setWdAddress(e.target.value)}
                  placeholder="0x..."
                  required
                  className="w-full h-11 px-3 rounded-xl bg-[#07090D] border border-white/10 font-mono text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
                />
              </div>

              <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={wdInstantMode}
                  onChange={(e) => setWdInstantMode(e.target.checked)}
                  className="accent-amber-500"
                />
                Enable Instant Automated Payout Settlement
              </label>

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[44px] rounded-xl bg-white text-slate-950 font-semibold text-sm hover:bg-slate-200 transition-colors disabled:opacity-60 cursor-pointer"
              >
                {submitting
                  ? 'Processing Automated Payout…'
                  : wdInstantMode
                    ? `Instant Auto-Withdraw ${formatUsd(Number(wdAmount) || 0)}`
                    : 'Queue Manual Withdrawal'}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Transaction Ledger */}
      <div className="rounded-2xl border border-white/8 bg-[#0F131A] p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="font-display text-base font-semibold text-white">Transaction Ledger</h2>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={ledgerSearch}
              onChange={(e) => setLedgerSearch(e.target.value)}
              placeholder="Filter hash, address, note…"
              className="h-9 px-3 rounded-xl bg-[#07090D] border border-white/10 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
            />
            <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-[#07090D] border border-white/8">
              {(['all', 'deposit', 'withdrawal', 'investment', 'yield_claim', 'referral_bonus'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setTxFilter(tab)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium capitalize transition-colors cursor-pointer ${
                    txFilter === tab ? 'bg-amber-500 text-slate-950 font-semibold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tab.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>
        </div>

        {filteredTx.length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center border-t border-white/5">
            No transactions match the selected filter.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/8 text-xs text-slate-400">
                  <th className="py-2.5 font-medium">Type</th>
                  <th className="py-2.5 font-medium">Asset / Network</th>
                  <th className="py-2.5 font-medium">Reference / Settlement Hash</th>
                  <th className="py-2.5 font-medium">Status</th>
                  <th className="py-2.5 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredTx.map((tx) => (
                  <tr key={tx.id} className="hover:bg-white/[0.02]">
                    <td className="py-3 capitalize text-slate-100 font-medium">
                      {tx.type.replace('_', ' ')}
                    </td>
                    <td className="py-3 text-xs text-slate-400">
                      {tx.asset} · {tx.network || 'EraEarn'}
                    </td>
                    <td className="py-3 text-xs font-mono text-slate-400 max-w-[220px] truncate">
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
                        {tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}
                      </span>
                    </td>
                    <td className="py-3 text-right font-mono tabular-nums text-white">
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
  );
}
