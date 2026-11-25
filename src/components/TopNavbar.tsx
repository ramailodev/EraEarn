import { useState, useRef, useEffect } from 'react';
import { Bell, CheckCheck, Search, Shield, X } from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import type { AppTab, NotificationItem, UserProfile } from '../types';

interface SearchResult {
  id: string;
  label: string;
  sublabel: string;
  targetTab: AppTab;
}

interface TopNavbarProps {
  profile: UserProfile | null;
  notifications: NotificationItem[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  searchResults: SearchResult[];
  onSelectSearchResult: (tab: AppTab) => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  isAdmin: boolean;
  adminMode: boolean;
  onToggleAdminMode: () => void;
  onOpenProfile: () => void;
}

export function TopNavbar({
  profile,
  notifications,
  searchQuery,
  onSearchChange,
  searchResults,
  onSelectSearchResult,
  onMarkRead,
  onMarkAllRead,
  isAdmin,
  adminMode,
  onToggleAdminMode,
  onOpenProfile
}: TopNavbarProps) {
  const [notifOpen, setNotifOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchFocused(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-white/8 bg-[#07090D]/92 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3 sm:gap-6">
        {/* Left: Logo + Text Name */}
        <button
          type="button"
          onClick={() => onSelectSearchResult('home')}
          className="cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded-lg"
        >
          <BrandLogo />
        </button>

        {/* Center: Search */}
        <div ref={searchRef} className="relative flex-1 max-w-md">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onFocus={() => setSearchFocused(true)}
              onChange={(e) => {
                onSearchChange(e.target.value);
                setSearchFocused(true);
              }}
              placeholder="Search plans, transactions, positions…"
              aria-label="Search EraEarn"
              className="w-full h-10 pl-10 pr-8 rounded-xl bg-[#0F131A] border border-white/10 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500/70 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                aria-label="Clear search"
                className="absolute right-2.5 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {searchFocused && searchQuery.trim().length > 0 && (
            <div className="absolute left-0 right-0 mt-2 rounded-xl border border-white/10 bg-[#0F131A] shadow-2xl overflow-hidden z-50">
              {searchResults.length === 0 ? (
                <div className="px-4 py-3 text-xs text-slate-400">
                  No matching plans, investments, or transactions found.
                </div>
              ) : (
                <ul className="divide-y divide-white/5 max-h-64 overflow-y-auto">
                  {searchResults.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onSelectSearchResult(item.targetTab);
                          setSearchFocused(false);
                        }}
                        className="w-full px-4 py-2.5 text-left hover:bg-white/5 transition-colors flex items-center justify-between gap-3 cursor-pointer"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-100 truncate">{item.label}</p>
                          <p className="text-xs text-slate-400 truncate">{item.sublabel}</p>
                        </div>
                        <span className="text-xs font-mono text-amber-400 capitalize shrink-0">
                          {item.targetTab}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Right: Admin Switch (if admin) + Notification Bell + Profile */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {isAdmin && (
            <button
              type="button"
              onClick={onToggleAdminMode}
              className={`min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                adminMode
                  ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                  : 'bg-[#0F131A] border border-amber-500/35 text-amber-400 hover:bg-amber-500/10'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{adminMode ? 'Investor View' : 'Admin Panel'}</span>
            </button>
          )}

          {/* Notification Bell */}
          <div ref={notifRef} className="relative">
            <button
              type="button"
              onClick={() => setNotifOpen((prev) => !prev)}
              aria-label="Notifications"
              className="relative min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-white/10 bg-[#0F131A] text-slate-300 hover:text-white hover:border-white/20 transition-colors cursor-pointer"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-slate-950 font-mono text-[10px] font-bold flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl border border-white/10 bg-[#0F131A] shadow-2xl overflow-hidden z-50">
                <div className="px-4 py-3 border-b border-white/8 flex items-center justify-between">
                  <span className="text-sm font-semibold text-white">Notifications</span>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={onMarkAllRead}
                      className="inline-flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 cursor-pointer"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      Mark all read
                    </button>
                  )}
                </div>

                <div className="max-h-80 overflow-y-auto divide-y divide-white/5">
                  {notifications.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400">
                      No notifications yet. Activity alerts will appear here in real time.
                    </div>
                  ) : (
                    notifications.slice(0, 12).map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => !n.isRead && onMarkRead(n.id)}
                        className={`w-full text-left px-4 py-3 transition-colors cursor-pointer ${
                          n.isRead ? 'bg-transparent opacity-70' : 'bg-amber-500/[0.04] hover:bg-white/5'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-100">{n.title}</span>
                          <span className="text-[11px] text-slate-500 capitalize">{n.category}</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-400 leading-relaxed">{n.message}</p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Profile Trigger */}
          <button
            type="button"
            onClick={onOpenProfile}
            aria-label="Open profile"
            className="min-h-[40px] flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-xl border border-white/10 bg-[#0F131A] hover:border-white/20 transition-colors cursor-pointer"
          >
            {profile?.photoURL ? (
              <img
                src={profile.photoURL}
                alt={profile.displayName}
                referrerPolicy="no-referrer"
                className="w-7 h-7 rounded-lg object-cover"
              />
            ) : (
              <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 font-semibold text-xs flex items-center justify-center">
                {(profile?.displayName?.[0] || 'E').toUpperCase()}
              </div>
            )}
            <span className="hidden md:inline text-xs font-medium text-slate-200 max-w-[100px] truncate">
              {profile?.displayName || 'Investor'}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
