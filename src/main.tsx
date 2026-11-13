import { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { captureAttribution } from './attribution';
import './index.css';

// The team's leads dashboard lives at /admin and loads as a separate bundle, so the public site stays light.
const AdminApp = lazy(() => import('./admin/AdminApp'));
const isAdmin = /^\/admin(\/|$)/.test(window.location.pathname);

if (!isAdmin) captureAttribution();

createRoot(document.getElementById('root')!).render(
  isAdmin ? (
    <Suspense fallback={null}>
      <AdminApp />
    </Suspense>
  ) : (
    <App />
  ),
);
