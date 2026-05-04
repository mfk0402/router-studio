import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/globals.css';
import { scheduleSplashDismissFailsafe } from './hooks/useSplashDismiss';

const rootEl = document.getElementById('root');
if (!rootEl) {
  const splash = document.getElementById('app-splash');
  if (splash) {
    splash.innerHTML =
      '<p style="color:#e6e8eb;font-family:system-ui;padding:2rem">Missing #root — check renderer build.</p>';
  }
  throw new Error('Renderer root element #root not found');
}

scheduleSplashDismissFailsafe();

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
