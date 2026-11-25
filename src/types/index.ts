import type { Timestamp } from 'firebase/firestore';

export type TierCode = 'CORE' | 'PRIME' | 'INSTITUTIONAL';
export type PayoutCycle = 'daily_accrual' | 'monthly_settlement';
export type KycStatus = 'unverified' | 'pending' | 'verified' | 'suspended';
export type UserRole = 'investor' | 'admin';
export type InvestmentStatus = 'active' | 'matured' | 'closed';
export type TransactionType =
  | 'deposit'
  | 'withdrawal'
  | 'investment'
  | 'yield_claim'
  | 'referral_bonus'
  | 'admin_credit';
export type TransactionStatus = 'pending' | 'completed' | 'rejected';
export type AssetSymbol = 'USD' | 'USDC' | 'USDT' | 'ETH';
export type NotificationCategory = 'yield' | 'wallet' | 'security' | 'system';

export type AppTab = 'home' | 'plans' | 'earn' | 'wallet' | 'profile';

export interface InvestmentPlan {
  id: string;
  name: string;
  tierCode: TierCode;
  minAmount: number;
  maxAmount: number;
  minMonthlyRoi: number;
  maxMonthlyRoi: number;
  lockDays: number;
  payoutCycle: PayoutCycle;
  description: string;
  isActive: boolean;
  sortOrder: number;
  updatedAt?: Timestamp;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  availableBalance: number;
  totalInvested: number;
  totalEarned: number;
  referralCode: string;
  referralEarnings: number;
  referredByUid?: string;
  referredByL2Uid?: string;
  referredByL3Uid?: string;
  referredByCode?: string;
  walletAddress?: string;
  walletVerified: boolean;
  kycStatus: KycStatus;
  role: UserRole;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface ReferralCodeRecord {
  code: string;
  ownerUid: string;
  ownerName: string;
  uplineL2Uid?: string;
  uplineL3Uid?: string;
  createdAt?: Timestamp;
}

export interface ReferralCommission {
  id: string;
  beneficiaryUid: string;
  fromUid: string;
  fromEmail: string;
  level: 1 | 2 | 3;
  ratePercent: 5 | 3 | 2;
  investmentAmount: number;
  commissionAmount: number;
  status: 'claimable' | 'claimed';
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Investment {
  id: string;
  userId: string;
  userEmail: string;
  planId: string;
  planName: string;
  principal: number;
  monthlyRoi: number;
  lockDays: number;
  status: InvestmentStatus;
  lastClaimedAt?: Timestamp;
  totalClaimed: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Transaction {
  id: string;
  userId: string;
  userEmail: string;
  type: TransactionType;
  amount: number;
  asset: AssetSymbol;
  network?: string;
  txHash?: string;
  toAddress?: string;
  status: TransactionStatus;
  note?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface NotificationItem {
  id: string;
  userId: string;
  title: string;
  message: string;
  category: NotificationCategory;
  isRead: boolean;
  createdAt?: Timestamp;
}

export interface MarketAsset {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
}

export interface MarketSnapshot {
  updatedAt: number;
  assets: MarketAsset[];
  blockNumber: number | null;
  gasGwei: string | null;
  networkName: string;
}
