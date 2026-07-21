import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './style.css';
import '../common/fonts/fonts.css'

ReactDOM.createRoot(document.getElementById('shell')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
