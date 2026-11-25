import { Home, Layers, TrendingUp, User, Wallet } from 'lucide-react';
import type { AppTab } from '../types';

interface BottomNavbarProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
}

const NAV_ITEMS: { id: AppTab; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'plans', label: 'Plans', icon: Layers },
  { id: 'earn', label: 'Earn', icon: TrendingUp },
  { id: 'wallet', label: 'Wallet', icon: Wallet },
  { id: 'profile', label: 'Profile', icon: User }
];

export function BottomNavbar({ activeTab, onSelectTab }: BottomNavbarProps) {
  return (
    <nav
      aria-label="Primary application navigation"
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-[#0B0E14]/95 backdrop-blur-md"
    >
      <div className="max-w-3xl mx-auto px-2 h-16 grid grid-cols-5 items-center">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`min-h-[44px] flex flex-col items-center justify-center gap-1 rounded-xl transition-colors cursor-pointer ${
                active
                  ? 'text-amber-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="w-5 h-5" strokeWidth={active ? 2.2 : 1.75} />
              <span className="text-[11px] font-medium tracking-tight whitespace-nowrap">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
