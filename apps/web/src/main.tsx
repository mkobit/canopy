import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app';
import '@fontsource/inter/300.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/700.css';
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import './index.css';

if (import.meta.env.VITE_CANOPY_DEMO_SEED === 'true' || import.meta.env.CANOPY_DEMO_SEED === 'true') {
  console.info('Canopy demo seed mode active');
}

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- #root is guaranteed by index.html
ReactDOM.createRoot(document.querySelector('#root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
