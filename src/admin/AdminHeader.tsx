/**
 * Top bar of the team area: business name, the Leads / Calendar / Settings tabs (Leads shows how many payments wait
 * to be checked), who is logged in, and Log out.
 */
import React from 'react';
import { CalendarDays, ExternalLink, LogOut, Settings, Users } from 'lucide-react';
import type { AdminUser } from '../data/leads';
import { BUSINESS_INFO } from '../data/portfolioData';

export type AdminPage = 'leads' | 'calendar' | 'settings';

export const ADMIN_PAGES: { id: AdminPage; label: string; path: string; icon: typeof Users }[] = [
  { id: 'leads', label: 'Leads', path: '/admin', icon: Users },
  { id: 'calendar', label: 'Calendar', path: '/admin/calendar', icon: CalendarDays },
  { id: 'settings', label: 'Settings', path: '/admin/settings', icon: Settings },
];

export const pageFromPath = (path: string): AdminPage =>
  /^\/admin\/calendar\/?$/.test(path) ? 'calendar' : /^\/admin\/settings\/?$/.test(path) ? 'settings' : 'leads';

export const AdminHeader: React.FC<{
  user: AdminUser;
  page: AdminPage;
  /** WhatsApp bookings whose payment screenshot waits to be checked: a badge on the Leads tab. */
  paymentsToVerify: number;
  onNavigate: (page: AdminPage) => void;
  onLogout: () => void;
}> = ({ user, page, paymentsToVerify, onNavigate, onLogout }) => (
  <header className="sticky top-0 z-30 border-b border-[#E7DFD6] bg-white/95 backdrop-blur">
    <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
      <div className="flex items-center gap-3 sm:gap-6 min-w-0">
        <a href="/" className="hidden md:block font-serif italic text-xl lg:text-2xl truncate hover:text-[#9E7D53]">
          {BUSINESS_INFO.name}
        </a>
        <nav aria-label="Team area" className="flex items-center gap-1 rounded-full bg-[#F4EFEA] p-1">
          {ADMIN_PAGES.map((p) => {
            const active = p.id === page;
            const Icon = p.icon;
            const badge = p.id === 'leads' && paymentsToVerify > 0 ? paymentsToVerify : 0;
            return (
              <a
                key={p.id}
                href={p.path}
                aria-current={active ? 'page' : undefined}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // let "open in new tab" work
                  e.preventDefault();
                  onNavigate(p.id);
                }}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 sm:px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  active ? 'bg-white text-[#1D1714] shadow-xs' : 'text-[#6A5F56] hover:text-[#1D1714]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" aria-hidden /> <span className={p.id === 'settings' ? 'hidden sm:inline' : undefined}>{p.label}</span>
                {p.id === 'settings' && <span className="sr-only sm:hidden">{p.label}</span>}
                {badge > 0 && (
                  <span
                    className="ml-0.5 inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-[#D04F7A] px-1 text-[10px] font-bold tabular-nums text-white"
                    title={`${badge} payment${badge > 1 ? 's' : ''} to verify`}
                  >
                    {badge}
                    <span className="sr-only"> payment{badge > 1 ? 's' : ''} to verify</span>
                  </span>
                )}
              </a>
            );
          })}
        </nav>
      </div>
      <div className="flex items-center gap-2 sm:gap-4 shrink-0">
        <span className="hidden lg:inline text-sm text-[#6A5F56]">{user.name}</span>
        <a href="/" target="_blank" rel="noopener noreferrer" className="hidden sm:inline-flex items-center gap-1.5 text-xs text-[#6A5F56] hover:text-[#1D1714]">
          Website <ExternalLink className="w-3.5 h-3.5" />
        </a>
        <button onClick={onLogout} aria-label="Log out" className="inline-flex items-center gap-1.5 rounded-full border border-[#E7DFD6] px-3.5 py-2 text-xs font-medium hover:bg-[#F4EFEA]">
          <LogOut className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Log out</span>
        </button>
      </div>
    </div>
  </header>
);
