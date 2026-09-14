import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Bundled fonts (files are only fetched when a family is actually used).
import '@fontsource-variable/inter';
import '@fontsource-variable/geist';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/manrope';
import '@fontsource-variable/space-grotesk';
import '@fontsource-variable/plus-jakarta-sans';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource-variable/geist-mono';
import '@fontsource-variable/fira-code';
import '@fontsource-variable/source-code-pro';
import '@fontsource-variable/roboto-mono';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/dejavu-mono/400.css';
import '@fontsource/dejavu-mono/700.css';
import './styles/globals.css';
import { App } from './app/App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
