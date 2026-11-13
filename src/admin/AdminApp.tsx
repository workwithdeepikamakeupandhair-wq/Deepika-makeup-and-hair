/**
 * The team area at /admin: shows the login page, or the leads dashboard once logged in.
 */
import { useEffect, useState } from 'react';
import type { AdminUser } from '../data/leads';
import { api } from './api';
import { LeadsPage } from './LeadsPage';
import { LoginPage } from './LoginPage';

export default function AdminApp() {
  // undefined while checking the session cookie, null when logged out
  const [user, setUser] = useState<AdminUser | null | undefined>(undefined);

  useEffect(() => {
    document.title = 'Leads · Deepika Makeup & Hair';
    // Keep the team area out of search engines
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex, nofollow';
    document.head.appendChild(robots);
    api.me().then(setUser, () => setUser(null));
    return () => robots.remove();
  }, []);

  if (user === undefined) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center" aria-busy="true">
        <p className="text-sm text-[#6A5F56] font-sans">Loading…</p>
      </div>
    );
  }
  return user ? <LeadsPage user={user} onLoggedOut={() => setUser(null)} /> : <LoginPage onLoggedIn={setUser} />;
}
