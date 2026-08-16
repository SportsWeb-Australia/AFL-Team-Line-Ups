// FIRST import on purpose: this reads the URL fragment before supabase-js is
// created and consumes it. Moving it below the App import breaks password reset.
import './lib/recovery';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
