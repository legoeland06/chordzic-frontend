/**
 * Point d'entrée React — monte le composant principal ChordApp
 * dans l'élément #root du DOM, avec StrictMode activé.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './components/ChordApp';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
