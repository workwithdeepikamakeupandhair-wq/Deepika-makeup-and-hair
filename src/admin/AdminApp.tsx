/**
 * The team area at /admin: the login page, or once logged in the leads dashboard (/admin) and the availability
 * calendar (/admin/calendar).
 */
import { useCallback, useEffect, useState } from 'react';
import type { AdminUser } from '../data/leads';
import { AdminHeader, ADMIN_PAGES, pageFromPath, type AdminPage } from './AdminHeader';
import { api } from './api';
import { CalendarPage } from './CalendarPage';
import { LeadsPage } from './LeadsPage';
import { LoginPage } from './LoginPage';

const TITLES: Record<AdminPage, string> = {
  leads: 'Leads · Deepika Makeup & Hair',
  calendar: 'Calendar · Deepika Makeup & Hair',
};

export default function AdminApp() {
  // undefined while checking the session cookie, null when logged out
  const [user, setUser] = useState<AdminUser | null | undefined>(undefined);
  const [page, setPage] = useState<AdminPage>(() => pageFromPath(window.location.pathname));

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
    document.title = TITLES[page];
  }, [page]);

  const navigate = useCallback((next: AdminPage) => {
    const path = ADMIN_PAGES.find((p) => p.id === next)!.path;
    if (window.location.pathname !== path) window.history.pushState(null, '', path);
    setPage(next);
    window.scrollTo(0, 0);
  }, []);

  const loggedOut = useCallback(() => setUser(null), []);
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
      <AdminHeader user={user} page={page} onNavigate={navigate} onLogout={logout} />
      {page === 'calendar' ? <CalendarPage onLoggedOut={loggedOut} /> : <LeadsPage onLoggedOut={loggedOut} />}
    </div>
  );
}
