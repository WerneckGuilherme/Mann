import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App.tsx';import {LanguageProvider} from './i18n/LanguageContext.tsx';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles/app.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
    throw new Error('Root element #root was not found.');
}

ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
        <LanguageProvider><App /></LanguageProvider>
    </React.StrictMode>,
);
