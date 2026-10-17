'use client';

import type { CSSProperties, ReactNode } from 'react';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';

const THEMES = ['morning', 'night'];
// Theme name → data-theme value. next-themes 0.4.6 sets data-theme to value[theme] and REMOVES the
// attribute when the key is missing, so the explicit picks must be listed next to the system ones.
const THEME_VALUE = { light: 'morning', dark: 'night', morning: 'morning', night: 'night' };

// Toasts in Morrow tokens: raised paper, ink, a strong rule, radius-2, the float shadow, Libre Franklin.
const TOASTER_STYLE = {
  '--normal-bg': 'var(--paper-raised)',
  '--normal-text': 'var(--ink)',
  '--normal-border': 'var(--rule-strong)',
  '--border-radius': 'var(--radius-2)',
  fontFamily: 'var(--font-sans)',
} as CSSProperties;
const TOAST_OPTIONS = { style: { boxShadow: 'var(--shadow-float)' } };
// Clear the mobile BottomNav (56px + the iOS home indicator) with a gap to spare.
const TOAST_OFFSET = { bottom: 'calc(72px + env(safe-area-inset-bottom))' };

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="data-theme" themes={THEMES} defaultTheme="system" enableSystem value={THEME_VALUE}>
      {children}
      <Toaster position="bottom-center" offset={TOAST_OFFSET} mobileOffset={TOAST_OFFSET} style={TOASTER_STYLE} toastOptions={TOAST_OPTIONS} />
    </ThemeProvider>
  );
}

export default Providers;
