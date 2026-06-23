import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Inject spinner animation (no build-time CSS needed)
const style = document.createElement('style');
style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
document.head.appendChild(style);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
