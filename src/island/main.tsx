import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// The interface fonts (the island follows the app's font setting; a family is only fetched when used).
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
import '../styles/globals.css';
import { DesktopIsland } from '@/features/island/desktop/DesktopIsland';
import { useIsland } from '@/features/island/desktop/store';

/**
 * Entry of the `island` window: the desktop island alone, no stores of the
 * app — everything it shows arrives as events from the main window and from
 * Rust (see features/island/desktop).
 */
// Automation hook for dev scripts only (never shipped in production builds).
if (import.meta.env.DEV) (window as unknown as { __island?: unknown }).__island = { useIsland };

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DesktopIsland />
  </StrictMode>,
);
