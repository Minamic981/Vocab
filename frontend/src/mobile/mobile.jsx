import React from 'react';
import ReactDOM from 'react-dom/client';
import MobileApp from './mobileApp.jsx';
import './mobile.css';
import '../fonts/fonts.css';

ReactDOM.createRoot(document.getElementById('mobile-shell')).render(
  <React.StrictMode>
    <MobileApp />
  </React.StrictMode>
);
