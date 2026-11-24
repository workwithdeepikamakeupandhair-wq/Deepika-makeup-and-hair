/**
 * The team area at /admin: the login page, or once logged in the leads dashboard (/admin), the availability calendar
 * (/admin/calendar) and the booking settings (/admin/settings).
 */
import { useCallback, useEffect, useState } from 'react';
import type { AdminUser } from '../data/leads';
import { AdminHeader, ADMIN_PAGES, pageFromPath, type AdminPage } from './AdminHeader';
import { api, NotLoggedIn, type WaitingCounts } from './api';
import { CalendarPage } from './CalendarPage';
import { LeadsPage } from './LeadsPage';
import { LoginPage } from './LoginPage';
import { SettingsPage } from './SettingsPage';

const TITLES: Record<AdminPage, string> = {
  leads: 'Leads · Deepika Makeup & Hair',
  calendar: 'Calendar · Deepika Makeup & Hair',
  settings: 'Settings · Deepika Makeup & Hair',
};

/** How often the to-approve badge is refreshed while the tab is visible. */
const SUMMARY_EVERY_MS = 60_000;

export default function AdminApp() {
  // undefined while checking the session cookie, null when logged out
  const [user, setUser] = useState<AdminUser | null | undefined>(undefined);
  const [page, setPage] = useState<AdminPage>(() => pageFromPath(window.location.pathname));
  const [waiting, setWaiting] = useState<WaitingCounts>({ enquiriesToApprove: 0, paymentsToVerify: 0 });
  const toApprove = waiting.enquiriesToApprove + waiting.paymentsToVerify;

  useEffect(() => {
    // Keep the team area out of search engines
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex, nofollow';
    document.head.appendChild(robots);
    api.me().then(setUser, () => setUser(null));
    const onBack = () => setPage(pageFromPath(window.location.pathname));
    window.addEventListener('popstate', onBack);
    return () => {
      robots.remove();
      window.removeEventListener('popstate', onBack);
    };
  }, []);

  useEffect(() => {
    document.title = `${toApprove > 0 ? `(${toApprove}) ` : ''}${TITLES[page]}`;
  }, [page, toApprove]);

  const loggedOut = useCallback(() => setUser(null), []);

  const refreshSummary = useCallback(() => {
    api.summary().then(
      (s) => setWaiting({ enquiriesToApprove: s.enquiriesToApprove, paymentsToVerify: s.paymentsToVerify }),
      (err) => {
        if (err instanceof NotLoggedIn) setUser(null);
      },
    );
  }, []);

  // The badge: on login, every minute while the tab is visible, and when the tab comes back into view
  useEffect(() => {
    if (!user) return;
    refreshSummary();
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') refreshSummary();
    }, SUMMARY_EVERY_MS);
    const onVisible = () => document.visibilityState === 'visible' && refreshSummary();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user, refreshSummary]);

  const navigate = useCallback((next: AdminPage) => {
    const path = ADMIN_PAGES.find((p) => p.id === next)!.path;
    if (window.location.pathname !== path) window.history.pushState(null, '', path);
    setPage(next);
    window.scrollTo(0, 0);
  }, []);

  const logout = async () => {
    await api.logout().catch(() => {});
    setUser(null);
  };

  if (user === undefined) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center" aria-busy="true">
        <p className="text-sm text-[#6A5F56] font-sans">Loading…</p>
      </div>
    );
  }
  if (!user) return <LoginPage onLoggedIn={setUser} />;
  return (
    <div className="min-h-screen bg-[#FAF7F2] font-sans text-[#1D1714]">
      <AdminHeader user={user} page={page} waiting={waiting} onNavigate={navigate} onLogout={logout} />
      {page === 'calendar' ? (
        <CalendarPage onLoggedOut={loggedOut} />
      ) : page === 'settings' ? (
        <SettingsPage onLoggedOut={loggedOut} />
      ) : (
        <LeadsPage onLoggedOut={loggedOut} onWaiting={setWaiting} onBookingChanged={refreshSummary} />
      )}
    </div>
  );
}
