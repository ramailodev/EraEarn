import {
  collection,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { BOOTSTRAP_ADMIN_EMAIL, db, handleFirestoreError, OperationType } from './firebase';
import { DEFAULT_INVESTMENT_PLANS } from './roi';
import type {
  AssetSymbol,
  Investment,
  InvestmentPlan,
  KycStatus,
  NotificationCategory,
  ReferralCodeRecord,
  ReferralCommission,
  Transaction,
  UserProfile,
  UserRole
} from '../types';

function makeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${rand}`;
}

export function generateReferralCode(uid: string): string {
  const clean = uid.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return `ERA${clean.slice(0, 7) || Math.random().toString(36).slice(2, 9).toUpperCase()}`;
}

export async function ensureUserProfile(firebaseUser: User, pendingReferralCode?: string | null): Promise<void> {
  const userRef = doc(db, 'users', firebaseUser.uid);
  try {
    const snap = await getDoc(userRef);
    const ownCode = generateReferralCode(firebaseUser.uid);

    if (!snap.exists()) {
      const isBootstrapAdmin = firebaseUser.email === BOOTSTRAP_ADMIN_EMAIL;
      let referredByUid: string | undefined;
      let referredByL2Uid: string | undefined;
      let referredByL3Uid: string | undefined;
      let referredByCode: string | undefined;

      const cleanRef = (pendingReferralCode || '').trim().toUpperCase();
      if (cleanRef && cleanRef !== ownCode && /^[a-zA-Z0-9_-]{4,32}$/.test(cleanRef)) {
        const refSnap = await getDoc(doc(db, 'referral_codes', cleanRef));
        if (refSnap.exists()) {
          const refData = refSnap.data() as ReferralCodeRecord;
          if (refData.ownerUid !== firebaseUser.uid) {
            referredByUid = refData.ownerUid;
            referredByL2Uid = refData.uplineL2Uid || undefined;
            referredByL3Uid = refData.uplineL3Uid || undefined;
            referredByCode = cleanRef;
          }
        }
      }

      const batch = writeBatch(db);
      const safeDisplayName = (firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Investor').trim().slice(0, 120);
      const safePhotoUrl = (firebaseUser.photoURL || '').slice(0, 500);
      const userPayload: Record<string, unknown> = {
        uid: firebaseUser.uid,
        displayName: safeDisplayName,
        email: firebaseUser.email || '',
        photoURL: safePhotoUrl,
        availableBalance: 0,
        totalInvested: 0,
        totalEarned: 0,
        referralCode: ownCode,
        referralEarnings: 0,
        walletAddress: '',
        walletVerified: false,
        kycStatus: isBootstrapAdmin ? 'verified' : 'unverified',
        role: isBootstrapAdmin ? 'admin' : 'investor',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      if (referredByUid) userPayload.referredByUid = referredByUid;
      if (referredByL2Uid) userPayload.referredByL2Uid = referredByL2Uid;
      if (referredByL3Uid) userPayload.referredByL3Uid = referredByL3Uid;
      if (referredByCode) userPayload.referredByCode = referredByCode;

      batch.set(userRef, userPayload);

      const ownCodeSnap = await getDoc(doc(db, 'referral_codes', ownCode));
      if (!ownCodeSnap.exists()) {
        const refCodePayload: Record<string, unknown> = {
          code: ownCode,
          ownerUid: firebaseUser.uid,
          ownerName: safeDisplayName,
          createdAt: serverTimestamp()
        };
        if (referredByUid) refCodePayload.uplineL2Uid = referredByUid;
        if (referredByL2Uid) refCodePayload.uplineL3Uid = referredByL2Uid;
        batch.set(doc(db, 'referral_codes', ownCode), refCodePayload);
      }

      const notifRef = doc(db, 'notifications', makeId('ntf'));
      batch.set(notifRef, {
        userId: firebaseUser.uid,
        title: 'Welcome to EraEarn',
        message: 'Your institutional portfolio vault is ready. Connect a Web3 wallet or fund your wallet via Automated Deposit.',
        category: 'system',
        isRead: false,
        createdAt: serverTimestamp()
      });

      await batch.commit();
    } else {
      // Backfill referralCode / referralEarnings on pre-existing accounts
      const existing = snap.data() as Partial<UserProfile>;
      if (!existing.referralCode || existing.referralEarnings === undefined) {
        const batch = writeBatch(db);
        const code = existing.referralCode || ownCode;
        const backfillUpdate: Record<string, unknown> = {
          updatedAt: serverTimestamp()
        };
        if (!existing.referralCode) {
          backfillUpdate.referralCode = code;
        }
        if (existing.referralEarnings === undefined) {
          backfillUpdate.referralEarnings = 0;
        }
        batch.update(userRef, backfillUpdate);

        const codeDoc = await getDoc(doc(db, 'referral_codes', code));
        if (!codeDoc.exists()) {
          batch.set(doc(db, 'referral_codes', code), {
            code,
            ownerUid: firebaseUser.uid,
            ownerName: (existing.displayName || 'Investor').trim().slice(0, 120),
            createdAt: serverTimestamp()
          });
        }
        await batch.commit();
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${firebaseUser.uid}`);
  }
}

export async function applyReferralCodeToProfile(userId: string, codeInput: string): Promise<string> {
  const cleanCode = codeInput.trim().toUpperCase();
  if (!/^[a-zA-Z0-9_-]{4,32}$/.test(cleanCode)) {
    throw new Error('Invalid referral code format.');
  }
  const refSnap = await getDoc(doc(db, 'referral_codes', cleanCode));
  if (!refSnap.exists()) {
    throw new Error('Referral code not found.');
  }
  const refData = refSnap.data() as ReferralCodeRecord;
  if (refData.ownerUid === userId) {
    throw new Error('You cannot apply your own referral code.');
  }

  const userRef = doc(db, 'users', userId);
  try {
    await runTransaction(db, async (transaction) => {
      const uSnap = await transaction.get(userRef);
      if (!uSnap.exists()) throw new Error('Profile not found.');
      const uData = uSnap.data() as UserProfile;
      if (uData.referredByCode) {
        throw new Error(`Referral code ${uData.referredByCode} is already linked to your account.`);
      }

      const updatePayload: Record<string, unknown> = {
        referredByUid: refData.ownerUid,
        referredByCode: cleanCode,
        updatedAt: serverTimestamp()
      };
      if (refData.uplineL2Uid) updatePayload.referredByL2Uid = refData.uplineL2Uid;
      if (refData.uplineL3Uid) updatePayload.referredByL3Uid = refData.uplineL3Uid;

      transaction.update(userRef, updatePayload);
    });
    return cleanCode;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('already') || error.message.includes('not found'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
  }
}

export async function ensureDefaultPlansSeeded(): Promise<void> {
  try {
    const batch = writeBatch(db);
    for (const plan of DEFAULT_INVESTMENT_PLANS) {
      const planRef = doc(db, 'plans', plan.id);
      batch.set(planRef, {
        ...plan,
        updatedAt: serverTimestamp()
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'plans');
  }
}

export async function savePlanByAdmin(plan: InvestmentPlan): Promise<void> {
  const path = `plans/${plan.id}`;
  try {
    await setDoc(doc(db, 'plans', plan.id), {
      id: plan.id,
      name: plan.name.trim(),
      tierCode: plan.tierCode,
      minAmount: Number(plan.minAmount),
      maxAmount: Number(plan.maxAmount),
      minMonthlyRoi: Number(plan.minMonthlyRoi),
      maxMonthlyRoi: Number(plan.maxMonthlyRoi),
      lockDays: Number(plan.lockDays),
      payoutCycle: plan.payoutCycle,
      description: plan.description.trim(),
      isActive: Boolean(plan.isActive),
      sortOrder: Number(plan.sortOrder),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function bindWalletAddress(
  userId: string,
  walletAddress: string,
  walletVerified: boolean
): Promise<void> {
  const path = `users/${userId}`;
  try {
    await updateDoc(doc(db, 'users', userId), {
      walletAddress,
      walletVerified,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateInvestorDisplayName(userId: string, displayName: string): Promise<void> {
  const path = `users/${userId}`;
  try {
    await updateDoc(doc(db, 'users', userId), {
      displayName: displayName.trim().slice(0, 120),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function investFromWalletBalance(params: {
  userId: string;
  userEmail: string;
  plan: InvestmentPlan;
  principal: number;
  monthlyRoi: number;
}): Promise<void> {
  const { userId, userEmail, plan, principal, monthlyRoi } = params;
  const userRef = doc(db, 'users', userId);
  const invId = makeId('inv');
  const txId = makeId('tx');
  const ntfId = makeId('ntf');

  try {
    await runTransaction(db, async (transaction) => {
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists()) {
        throw new Error('Investor profile not found.');
      }
      const userData = userSnap.data() as UserProfile;
      if (userData.availableBalance < principal) {
        throw new Error('Insufficient wallet balance. Please deposit funds first.');
      }

      const nextAvailable = Number((userData.availableBalance - principal).toFixed(2));
      const nextInvested = Number((userData.totalInvested + principal).toFixed(2));

      transaction.update(userRef, {
        availableBalance: nextAvailable,
        totalInvested: nextInvested,
        updatedAt: serverTimestamp()
      });

      transaction.set(doc(db, 'investments', invId), {
        userId,
        userEmail,
        planId: plan.id,
        planName: plan.name,
        principal: Number(principal.toFixed(2)),
        monthlyRoi: Number(monthlyRoi.toFixed(2)),
        lockDays: plan.lockDays,
        status: 'active',
        lastClaimedAt: serverTimestamp(),
        totalClaimed: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      transaction.set(doc(db, 'transactions', txId), {
        userId,
        userEmail,
        type: 'investment',
        amount: Number(principal.toFixed(2)),
        asset: 'USD',
        network: 'EraEarn Vault',
        status: 'completed',
        note: `Allocated to ${plan.name} at ${monthlyRoi.toFixed(2)}% monthly ROI`,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      transaction.set(doc(db, 'notifications', ntfId), {
        userId,
        title: 'Investment Position Active',
        message: `$${principal.toFixed(2)} allocated to ${plan.name} at ${monthlyRoi.toFixed(2)}% monthly ROI.`,
        category: 'yield',
        isRead: false,
        createdAt: serverTimestamp()
      });

      // 3-Level Referral Commission Attribution: L1 = 5%, L2 = 3%, L3 = 2%
      const uplines: { uid?: string; level: 1 | 2 | 3; rate: 5 | 3 | 2 }[] = [
        { uid: userData.referredByUid, level: 1, rate: 5 },
        { uid: userData.referredByL2Uid, level: 2, rate: 3 },
        { uid: userData.referredByL3Uid, level: 3, rate: 2 }
      ];

      for (const up of uplines) {
        if (up.uid && up.uid !== userId) {
          const commissionAmount = Number(((principal * up.rate) / 100).toFixed(2));
          if (commissionAmount > 0) {
            const commId = makeId(`ref_l${up.level}`);
            transaction.set(doc(db, 'referral_commissions', commId), {
              beneficiaryUid: up.uid,
              fromUid: userId,
              fromEmail: userEmail,
              level: up.level,
              ratePercent: up.rate,
              investmentAmount: Number(principal.toFixed(2)),
              commissionAmount,
              status: 'claimable',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
          }
        }
      }
    });
  } catch (error) {
    if (error instanceof Error && (error.message.includes('Insufficient') || error.message.includes('not found'))) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `investments/${invId}`);
  }
}

export async function claimReferralCommissions(params: {
  userId: string;
  userEmail: string;
  commissions: ReferralCommission[];
}): Promise<number> {
  const { userId, userEmail, commissions } = params;
  const claimable = commissions.filter((c) => c.status === 'claimable');
  if (claimable.length === 0) {
    throw new Error('No claimable referral commissions available.');
  }

  const totalBonus = Number(
    claimable.reduce((sum, c) => sum + c.commissionAmount, 0).toFixed(2)
  );
  if (totalBonus <= 0) {
    throw new Error('Referral commission total must be greater than $0.00.');
  }

  const userRef = doc(db, 'users', userId);
  const txId = makeId('tx');
  const ntfId = makeId('ntf');

  try {
    await runTransaction(db, async (transaction) => {
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists()) throw new Error('Investor profile not found.');
      const u = userSnap.data() as UserProfile;

      transaction.update(userRef, {
        availableBalance: Number((u.availableBalance + totalBonus).toFixed(2)),
        referralEarnings: Number(((u.referralEarnings || 0) + totalBonus).toFixed(2)),
        totalEarned: Number((u.totalEarned + totalBonus).toFixed(2)),
        updatedAt: serverTimestamp()
      });

      for (const comm of claimable.slice(0, 20)) {
        transaction.update(doc(db, 'referral_commissions', comm.id), {
          status: 'claimed',
          updatedAt: serverTimestamp()
        });
      }

      transaction.set(doc(db, 'transactions', txId), {
        userId,
        userEmail,
        type: 'referral_bonus',
        amount: totalBonus,
        asset: 'USD',
        network: 'EraEarn 3-Level Referral',
        status: 'completed',
        note: `Claimed 3-level referral commissions (${claimable.length} payouts)`,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      transaction.set(doc(db, 'notifications', ntfId), {
        userId,
        title: 'Referral Commissions Credited',
        message: `+$${totalBonus.toFixed(2)} in multi-level referral earnings credited to your wallet.`,
        category: 'yield',
        isRead: false,
        createdAt: serverTimestamp()
      });
    });
    return totalBonus;
  } catch (error) {
    if (error instanceof Error && error.message.includes('claimable')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `users/${userId}`);
  }
}

export async function claimAccruedYield(params: {
  userId: string;
  userEmail: string;
  investment: Investment;
  claimAmount: number;
}): Promise<void> {
  const { userId, userEmail, investment, claimAmount } = params;
  const roundedClaim = Number(claimAmount.toFixed(2));
  if (roundedClaim < 0.01) {
    throw new Error('Minimum claimable yield is $0.01.');
  }

  const userRef = doc(db, 'users', userId);
  const invRef = doc(db, 'investments', investment.id);
  const txId = makeId('tx');
  const ntfId = makeId('ntf');

  try {
    await runTransaction(db, async (transaction) => {
      const [userSnap, invSnap] = await Promise.all([
        transaction.get(userRef),
        transaction.get(invRef)
      ]);
      if (!userSnap.exists() || !invSnap.exists()) {
        throw new Error('Account or investment record not found.');
      }

      const userData = userSnap.data() as UserProfile;
      const invData = invSnap.data() as Investment;

      if (invData.status !== 'active') {
        throw new Error('Investment position is no longer active.');
      }

      const maxAllowed = Number((userData.totalInvested * 0.25).toFixed(2));
      const safeClaim = Math.min(roundedClaim, maxAllowed);
      if (safeClaim <= 0) {
        throw new Error('No claimable yield available yet.');
      }

      transaction.update(userRef, {
        availableBalance: Number((userData.availableBalance + safeClaim).toFixed(2)),
        totalEarned: Number((userData.totalEarned + safeClaim).toFixed(2)),
        updatedAt: serverTimestamp()
      });

      transaction.update(invRef, {
        lastClaimedAt: serverTimestamp(),
        totalClaimed: Number((invData.totalClaimed + safeClaim).toFixed(2)),
        updatedAt: serverTimestamp()
      });

      transaction.set(doc(db, 'transactions', txId), {
        userId,
        userEmail,
        type: 'yield_claim',
        amount: safeClaim,
        asset: 'USD',
        network: 'EraEarn Yield Engine',
        status: 'completed',
        note: `Claimed ROI from ${investment.planName}`,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      transaction.set(doc(db, 'notifications', ntfId), {
        userId,
        title: 'Yield Credited to Wallet',
        message: `+$${safeClaim.toFixed(2)} yield from ${investment.planName} moved to your available balance.`,
        category: 'yield',
        isRead: false,
        createdAt: serverTimestamp()
      });
    });
  } catch (error) {
    if (error instanceof Error && (error.message.includes('Minimum') || error.message.includes('No claimable') || error.message.includes('not found'))) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `investments/${investment.id}`);
  }
}

export async function executeAutoDeposit(params: {
  userId: string;
  userEmail: string;
  amount: number;
  asset: AssetSymbol;
  network: string;
  txHash: string;
  note?: string;
}): Promise<void> {
  const { userId, userEmail, amount, asset, network, txHash, note } = params;
  const userRef = doc(db, 'users', userId);
  const txId = makeId('tx');
  const ntfId = makeId('ntf');

  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(userRef);
      if (!snap.exists()) throw new Error('Investor profile not found.');
      const userData = snap.data() as UserProfile;

      transaction.update(userRef, {
        availableBalance: Number((userData.availableBalance + amount).toFixed(2)),
        updatedAt: serverTimestamp()
      });

      transaction.set(doc(db, 'transactions', txId), {
        userId,
        userEmail,
        type: 'deposit',
        amount: Number(amount.toFixed(2)),
        asset,
        network,
        txHash: txHash.trim(),
        status: 'completed',
        note: note || `Auto-settled ${asset} deposit on ${network}`,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      transaction.set(doc(db, 'notifications', ntfId), {
        userId,
        title: 'Deposit Auto-Settled',
        message: `+$${amount.toFixed(2)} (${asset}) verified and credited instantly to your wallet.`,
        category: 'wallet',
        isRead: false,
        createdAt: serverTimestamp()
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `transactions/${txId}`);
  }
}

export async function executeAutoWithdrawal(params: {
  userId: string;
  userEmail: string;
  amount: number;
  asset: AssetSymbol;
  network: string;
  toAddress: string;
  txHash: string;
  instantMode: boolean;
}): Promise<void> {
  const { userId, userEmail, amount, asset, network, toAddress, txHash, instantMode } = params;
  const userRef = doc(db, 'users', userId);
  const txId = makeId('tx');
  const ntfId = makeId('ntf');

  try {
    await runTransaction(db, async (transaction) => {
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists()) {
        throw new Error('Investor profile not found.');
      }
      const userData = userSnap.data() as UserProfile;
      if (userData.availableBalance < amount) {
        throw new Error('Insufficient available balance for withdrawal.');
      }

      transaction.update(userRef, {
        availableBalance: Number((userData.availableBalance - amount).toFixed(2)),
        updatedAt: serverTimestamp()
      });

      transaction.set(doc(db, 'transactions', txId), {
        userId,
        userEmail,
        type: 'withdrawal',
        amount: Number(amount.toFixed(2)),
        asset,
        network,
        txHash: txHash.trim(),
        toAddress: toAddress.trim(),
        status: instantMode ? 'completed' : 'pending',
        note: instantMode
          ? `Auto-dispatched ${asset} to ${toAddress.trim().slice(0, 10)}…`
          : `Queued withdrawal to ${toAddress.trim().slice(0, 10)}…`,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      transaction.set(doc(db, 'notifications', ntfId), {
        userId,
        title: instantMode ? 'Withdrawal Auto-Dispatched' : 'Withdrawal Queued',
        message: instantMode
          ? `$${amount.toFixed(2)} (${asset}) settled automatically to ${toAddress.trim().slice(0, 10)}…`
          : `Withdrawal of $${amount.toFixed(2)} (${asset}) queued for manual treasury review.`,
        category: 'wallet',
        isRead: false,
        createdAt: serverTimestamp()
      });
    });
  } catch (error) {
    if (error instanceof Error && (error.message.includes('Insufficient') || error.message.includes('not found'))) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `transactions/${txId}`);
  }
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const path = `notifications/${notificationId}`;
  try {
    await updateDoc(doc(db, 'notifications', notificationId), { isRead: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function markAllNotificationsRead(notifications: { id: string; isRead: boolean }[]): Promise<void> {
  const unread = notifications.filter((n) => !n.isRead);
  if (unread.length === 0) return;
  try {
    const batch = writeBatch(db);
    for (const item of unread.slice(0, 25)) {
      batch.update(doc(db, 'notifications', item.id), { isRead: true });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'notifications');
  }
}

export async function adminProcessTransaction(params: {
  tx: Transaction;
  decision: 'completed' | 'rejected';
  note?: string;
}): Promise<void> {
  const { tx, decision, note } = params;
  const txRef = doc(db, 'transactions', tx.id);
  const userRef = doc(db, 'users', tx.userId);
  const ntfId = makeId('ntf');

  try {
    await runTransaction(db, async (transaction) => {
      const [txSnap, userSnap] = await Promise.all([
        transaction.get(txRef),
        transaction.get(userRef)
      ]);
      if (!txSnap.exists() || !userSnap.exists()) {
        throw new Error('Transaction or user record missing.');
      }

      const txData = txSnap.data() as Transaction;
      const userData = userSnap.data() as UserProfile;

      if (txData.status !== 'pending') {
        throw new Error('Transaction has already been processed.');
      }

      transaction.update(txRef, {
        status: decision,
        note: note || txData.note || `Processed by administrator (${decision})`,
        updatedAt: serverTimestamp()
      });

      if (decision === 'completed' && txData.type === 'deposit') {
        transaction.update(userRef, {
          availableBalance: Number((userData.availableBalance + txData.amount).toFixed(2)),
          updatedAt: serverTimestamp()
        });
      }

      if (decision === 'rejected' && txData.type === 'withdrawal') {
        transaction.update(userRef, {
          availableBalance: Number((userData.availableBalance + txData.amount).toFixed(2)),
          updatedAt: serverTimestamp()
        });
      }

      const label = txData.type === 'deposit' ? 'Deposit' : 'Withdrawal';
      transaction.set(doc(db, 'notifications', ntfId), {
        userId: txData.userId,
        title: `${label} ${decision === 'completed' ? 'Approved' : 'Rejected'}`,
        message:
          decision === 'completed'
            ? `Your ${txData.type} of $${txData.amount.toFixed(2)} (${txData.asset}) has been settled.`
            : `Your ${txData.type} of $${txData.amount.toFixed(2)} was declined.${txData.type === 'withdrawal' ? ' Funds returned to available balance.' : ''}`,
        category: 'wallet',
        isRead: false,
        createdAt: serverTimestamp()
      });
    });
  } catch (error) {
    if (error instanceof Error && (error.message.includes('already') || error.message.includes('missing'))) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `transactions/${tx.id}`);
  }
}

export async function adminCreditUserBalance(params: {
  targetUser: UserProfile;
  amount: number;
  note: string;
}): Promise<void> {
  const { targetUser, amount, note } = params;
  const userRef = doc(db, 'users', targetUser.uid);
  const txId = makeId('tx');
  const ntfId = makeId('ntf');

  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(userRef);
      if (!snap.exists()) throw new Error('User not found.');
      const userData = snap.data() as UserProfile;

      transaction.update(userRef, {
        availableBalance: Number((userData.availableBalance + amount).toFixed(2)),
        updatedAt: serverTimestamp()
      });

      transaction.set(doc(db, 'transactions', txId), {
        userId: targetUser.uid,
        userEmail: targetUser.email,
        type: 'admin_credit',
        amount: Number(amount.toFixed(2)),
        asset: 'USD',
        network: 'EraEarn Treasury',
        status: 'completed',
        note: note.trim() || 'Treasury balance adjustment',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      transaction.set(doc(db, 'notifications', ntfId), {
        userId: targetUser.uid,
        title: 'Treasury Credit Received',
        message: `+$${amount.toFixed(2)} has been credited to your wallet. ${note}`,
        category: 'wallet',
        isRead: false,
        createdAt: serverTimestamp()
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${targetUser.uid}`);
  }
}

export async function adminUpdateUserGovernance(params: {
  targetUser: UserProfile;
  kycStatus: KycStatus;
  role: UserRole;
}): Promise<void> {
  const { targetUser, kycStatus, role } = params;
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'users', targetUser.uid), {
      kycStatus,
      role,
      updatedAt: serverTimestamp()
    });
    if (role === 'admin') {
      batch.set(doc(db, 'admins', targetUser.uid), {
        uid: targetUser.uid,
        email: targetUser.email,
        role: 'admin',
        createdAt: serverTimestamp()
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${targetUser.uid}`);
  }
}

export async function adminDistributeYieldToInvestment(investment: Investment, bonusPercent?: number): Promise<void> {
  const pct = bonusPercent ?? investment.monthlyRoi;
  const payout = Number(((investment.principal * pct) / 100).toFixed(2));
  const userRef = doc(db, 'users', investment.userId);
  const invRef = doc(db, 'investments', investment.id);
  const txId = makeId('tx');
  const ntfId = makeId('ntf');

  try {
    await runTransaction(db, async (transaction) => {
      const [userSnap, invSnap] = await Promise.all([transaction.get(userRef), transaction.get(invRef)]);
      if (!userSnap.exists() || !invSnap.exists()) throw new Error('Record missing.');
      const u = userSnap.data() as UserProfile;
      const inv = invSnap.data() as Investment;

      transaction.update(userRef, {
        availableBalance: Number((u.availableBalance + payout).toFixed(2)),
        totalEarned: Number((u.totalEarned + payout).toFixed(2)),
        updatedAt: serverTimestamp()
      });

      transaction.update(invRef, {
        lastClaimedAt: serverTimestamp(),
        totalClaimed: Number((inv.totalClaimed + payout).toFixed(2)),
        updatedAt: serverTimestamp()
      });

      transaction.set(doc(db, 'transactions', txId), {
        userId: investment.userId,
        userEmail: investment.userEmail,
        type: 'yield_claim',
        amount: payout,
        asset: 'USD',
        network: 'EraEarn Monthly Settlement',
        status: 'completed',
        note: `Admin settled ${pct}% ROI payout for ${investment.planName}`,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      transaction.set(doc(db, 'notifications', ntfId), {
        userId: investment.userId,
        title: 'Monthly ROI Settled',
        message: `+$${payout.toFixed(2)} (${pct}%) ROI from ${investment.planName} credited to your wallet.`,
        category: 'yield',
        isRead: false,
        createdAt: serverTimestamp()
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `investments/${investment.id}`);
  }
}

export async function adminBroadcastNotification(params: {
  users: UserProfile[];
  title: string;
  message: string;
  category: NotificationCategory;
}): Promise<void> {
  const { users, title, message, category } = params;
  try {
    const batch = writeBatch(db);
    for (const u of users.slice(0, 100)) {
      const ref = doc(collection(db, 'notifications'), makeId('ntf'));
      batch.set(ref, {
        userId: u.uid,
        title: title.trim().slice(0, 120),
        message: message.trim().slice(0, 400),
        category,
        isRead: false,
        createdAt: serverTimestamp()
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'notifications');
  }
}
