import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LandingPage } from './components/LandingPage';
import { TopNavbar } from './components/TopNavbar';
import { BottomNavbar } from './components/BottomNavbar';
import { HomeTab } from './components/tabs/HomeTab';
import { PlansTab } from './components/tabs/PlansTab';
import { EarnTab } from './components/tabs/EarnTab';
import { WalletTab } from './components/tabs/WalletTab';
import { ProfileTab } from './components/tabs/ProfileTab';
import { AdminPanel } from './components/admin/AdminPanel';
import {
  auth,
  BOOTSTRAP_ADMIN_EMAIL,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType
} from './lib/firebase';
import {
  ensureDefaultPlansSeeded,
  ensureUserProfile,
  markAllNotificationsRead,
  markNotificationRead
} from './lib/ledger';
import { DEFAULT_INVESTMENT_PLANS } from './lib/roi';
import type {
  AppTab,
  Investment,
  InvestmentPlan,
  MarketSnapshot,
  NotificationItem,
  ReferralCommission,
  Transaction,
  UserProfile
} from './types';

function byCreatedDesc<T extends { createdAt?: { toMillis?: () => number } }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aMs = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
    const bMs = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
    return bMs - aMs;
  });
}

function captureReferralParam(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const refParam = params.get('ref');
  if (refParam && /^[a-zA-Z0-9_-]{4,32}$/.test(refParam.trim())) {
    const clean = refParam.trim().toUpperCase();
    try {
      sessionStorage.setItem('eraearn_pending_ref', clean);
    } catch {
      // Ignore storage failures
    }
    return clean;
  }
  try {
    return sessionStorage.getItem('eraearn_pending_ref');
  } catch {
    return null;
  }
}

function EraEarnShell() {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [plans, setPlans] = useState<InvestmentPlan[]>(DEFAULT_INVESTMENT_PLANS);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [referralCommissions, setReferralCommissions] = useState<ReferralCommission[]>([]);
  const [isAdminDoc, setIsAdminDoc] = useState(false);

  // Admin platform-wide collections
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [allInvestments, setAllInvestments] = useState<Investment[]>([]);
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);

  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [adminMode, setAdminMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [market, setMarket] = useState<MarketSnapshot | null>(null);

  // Capture ?ref=CODE on mount
  useEffect(() => {
    captureReferralParam();
  }, []);

  // Live Market & Blockchain Oracle polling
  useEffect(() => {
    let mounted = true;
    async function loadMarket() {
      try {
        const res = await fetch('/api/market');
        if (res.ok && mounted) {
          const data = (await res.json()) as MarketSnapshot;
          setMarket(data);
        }
      } catch {
        // Keep previous snapshot
      }
    }
    loadMarket();
    const timer = setInterval(loadMarket, 30_000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  // Publicly readable investment plans subscription
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'plans'),
      (snap) => {
        if (!snap.empty) {
          const list = snap.docs.map((d) => d.data() as InvestmentPlan);
          setPlans(list.sort((a, b) => a.sortOrder - b.sortOrder));
        } else {
          setPlans(DEFAULT_INVESTMENT_PLANS);
        }
      },
      (error) => {
        console.warn('Plans subscription fallback:', error.message);
      }
    );
    return () => unsub();
  }, []);

  // Auth state subscription
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
      if (user) {
        const pendingRef = captureReferralParam();
        await ensureUserProfile(user, pendingRef);
      } else {
        setProfile(null);
        setInvestments([]);
        setTransactions([]);
        setNotifications([]);
        setReferralCommissions([]);
        setIsAdminDoc(false);
        setAdminMode(false);
      }
    });
    return () => unsub();
  }, []);

  const isAdmin = useMemo(() => {
    if (!firebaseUser) return false;
    return (
      firebaseUser.email === BOOTSTRAP_ADMIN_EMAIL ||
      profile?.role === 'admin' ||
      isAdminDoc
    );
  }, [firebaseUser, profile, isAdminDoc]);

  // Ensure default plans are seeded in Firestore once an admin logs in
  useEffect(() => {
    if (!isAdmin) return;
    const unsub = onSnapshot(
      collection(db, 'plans'),
      (snap) => {
        if (snap.empty) {
          ensureDefaultPlansSeeded();
        }
      },
      () => {
        // Ignore
      }
    );
    return () => unsub();
  }, [isAdmin]);

  // Authenticated user Firestore subscriptions
  useEffect(() => {
    if (!firebaseUser) return;
    const uid = firebaseUser.uid;

    const unsubProfile = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        if (snap.exists()) {
          setProfile(snap.data() as UserProfile);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `users/${uid}`)
    );

    const unsubAdmin = onSnapshot(
      doc(db, 'admins', uid),
      (snap) => setIsAdminDoc(snap.exists()),
      () => setIsAdminDoc(false)
    );

    const unsubInvestments = onSnapshot(
      query(collection(db, 'investments'), where('userId', '==', uid)),
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Investment, 'id'>) }));
        setInvestments(byCreatedDesc(rows));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'investments')
    );

    const unsubTransactions = onSnapshot(
      query(collection(db, 'transactions'), where('userId', '==', uid)),
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Transaction, 'id'>) }));
        setTransactions(byCreatedDesc(rows));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'transactions')
    );

    const unsubNotifications = onSnapshot(
      query(collection(db, 'notifications'), where('userId', '==', uid)),
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<NotificationItem, 'id'>) }));
        setNotifications(byCreatedDesc(rows));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'notifications')
    );

    const unsubReferrals = onSnapshot(
      query(collection(db, 'referral_commissions'), where('beneficiaryUid', '==', uid)),
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ReferralCommission, 'id'>) }));
        setReferralCommissions(byCreatedDesc(rows));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'referral_commissions')
    );

    return () => {
      unsubProfile();
      unsubAdmin();
      unsubInvestments();
      unsubTransactions();
      unsubNotifications();
      unsubReferrals();
    };
  }, [firebaseUser]);

  // Admin platform-wide subscriptions when Admin Panel is open
  useEffect(() => {
    if (!firebaseUser || !isAdmin || !adminMode) return;

    const unsubUsers = onSnapshot(
      collection(db, 'users'),
      (snap) => setAllUsers(snap.docs.map((d) => d.data() as UserProfile)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'users')
    );

    const unsubAllInv = onSnapshot(
      collection(db, 'investments'),
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Investment, 'id'>) }));
        setAllInvestments(byCreatedDesc(rows));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'investments')
    );

    const unsubAllTx = onSnapshot(
      collection(db, 'transactions'),
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Transaction, 'id'>) }));
        setAllTransactions(byCreatedDesc(rows));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'transactions')
    );

    return () => {
      unsubUsers();
      unsubAllInv();
      unsubAllTx();
    };
  }, [firebaseUser, isAdmin, adminMode]);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const results: { id: string; label: string; sublabel: string; targetTab: AppTab }[] = [];

    for (const p of plans) {
      if (p.name.toLowerCase().includes(q) || p.tierCode.toLowerCase().includes(q)) {
        results.push({
          id: `plan_${p.id}`,
          label: p.name,
          sublabel: `${p.minMonthlyRoi}%–${p.maxMonthlyRoi}% Monthly ROI`,
          targetTab: 'plans'
        });
      }
    }

    for (const inv of investments) {
      if (inv.planName.toLowerCase().includes(q)) {
        results.push({
          id: `inv_${inv.id}`,
          label: `${inv.planName} ($${inv.principal.toLocaleString()})`,
          sublabel: `${inv.monthlyRoi}%/mo · ${inv.status}`,
          targetTab: 'earn'
        });
      }
    }

    for (const tx of transactions) {
      if (
        tx.type.toLowerCase().includes(q) ||
        tx.asset.toLowerCase().includes(q) ||
        (tx.txHash || '').toLowerCase().includes(q)
      ) {
        results.push({
          id: `tx_${tx.id}`,
          label: `${tx.type.replace('_', ' ')} · $${tx.amount.toFixed(2)}`,
          sublabel: `${tx.asset} · ${tx.status}`,
          targetTab: 'wallet'
        });
      }
    }

    return results.slice(0, 6);
  }, [searchQuery, plans, investments, transactions]);

  async function handleSignIn() {
    setAuthError(null);
    setAuthBusy(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Sign-in cancelled or blocked by browser.');
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleSignOut() {
    await signOut(auth);
    setActiveTab('home');
    setAdminMode(false);
  }

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#07090D] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!firebaseUser) {
    return (
      <>
        {authError && (
          <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-xl border border-rose-500/30 bg-[#0F131A] p-4 text-xs text-rose-300 shadow-2xl">
            {authError}
          </div>
        )}
        <LandingPage
          plans={plans}
          market={market}
          authLoading={authBusy}
          onSignIn={handleSignIn}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#07090D] text-[#F8FAFC] flex flex-col">
      <TopNavbar
        profile={profile}
        notifications={notifications}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchResults={searchResults}
        onSelectSearchResult={(tab) => {
          setAdminMode(false);
          setActiveTab(tab);
        }}
        onMarkRead={markNotificationRead}
        onMarkAllRead={() => markAllNotificationsRead(notifications)}
        isAdmin={isAdmin}
        adminMode={adminMode}
        onToggleAdminMode={() => setAdminMode((prev) => !prev)}
        onOpenProfile={() => {
          setAdminMode(false);
          setActiveTab('profile');
        }}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 pt-6 pb-24">
        {!profile ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 py-8">
            {[1, 2, 3].map((k) => (
              <div
                key={k}
                className="h-36 rounded-2xl border border-white/8 bg-[#0F131A] animate-pulse"
              />
            ))}
          </div>
        ) : adminMode && isAdmin ? (
          <AdminPanel
            allUsers={allUsers}
            allInvestments={allInvestments}
            allTransactions={allTransactions}
            plans={plans}
            searchQuery={searchQuery}
          />
        ) : (
          <>
            {activeTab === 'home' && (
              <HomeTab
                profile={profile}
                investments={investments}
                transactions={transactions}
                market={market}
                onNavigate={setActiveTab}
              />
            )}
            {activeTab === 'plans' && (
              <PlansTab
                profile={profile}
                plans={plans}
                onNavigate={setActiveTab}
              />
            )}
            {activeTab === 'earn' && (
              <EarnTab
                profile={profile}
                investments={investments}
                transactions={transactions}
                referralCommissions={referralCommissions}
                onNavigate={setActiveTab}
              />
            )}
            {activeTab === 'wallet' && (
              <WalletTab
                profile={profile}
                transactions={transactions}
                market={market}
              />
            )}
            {activeTab === 'profile' && (
              <ProfileTab
                profile={profile}
                isAdmin={isAdmin}
                onOpenAdminPanel={() => setAdminMode(true)}
                onSignOut={handleSignOut}
              />
            )}
          </>
        )}
      </main>

      {!adminMode && (
        <BottomNavbar
          activeTab={activeTab}
          onSelectTab={setActiveTab}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <EraEarnShell />
    </ErrorBoundary>
  );
}
