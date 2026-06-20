import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app';
import './index.css';

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- #root is guaranteed by index.html
ReactDOM.createRoot(document.querySelector('#root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
