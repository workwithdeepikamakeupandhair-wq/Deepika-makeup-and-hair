import { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import BridalInquiryPage from './components/BridalInquiryPage';
import { captureAttribution } from './attribution';
import './index.css';

// The team's leads dashboard lives at /admin and loads as a separate bundle, so the public site stays light.
const AdminApp = lazy(() => import('./admin/AdminApp'));
const path = window.location.pathname;
const isAdmin = /^\/admin(\/|$)/.test(path);
// The Instagram-bio link: a one-page "email your inquiry" screen (see BridalInquiryPage)
const isBridalInquiry = /^\/bridal-inquiry\/?$/i.test(path);

if (!isAdmin) captureAttribution();

createRoot(document.getElementById('root')!).render(
  isAdmin ? (
    <Suspense fallback={null}>
      <AdminApp />
    </Suspense>
  ) : isBridalInquiry ? (
    <BridalInquiryPage />
  ) : (
    <App />
  ),
);
