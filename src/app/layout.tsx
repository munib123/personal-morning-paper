import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { Providers } from '@/components/shell/Providers';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BRAND } from '@/lib/brand';
import './globals.css';

// Morrow fonts, self-hosted (design/project/fonts): Newsreader for news, Libre Franklin for UI,
// UnifrakturMaguntia for the nameplate only. tokens.css reads these variables.
const newsreader = localFont({
  src: [
    { path: './fonts/Newsreader-Variable.woff2', weight: '200 800', style: 'normal' },
    { path: './fonts/Newsreader-Variable-Italic.woff2', weight: '200 800', style: 'italic' },
  ],
  variable: '--font-newsreader',
  display: 'swap',
});
const franklin = localFont({
  src: './fonts/LibreFranklin-Variable.woff2',
  weight: '100 900',
  variable: '--font-franklin',
  display: 'swap',
});
const unifraktur = localFont({
  src: './fonts/UnifrakturMaguntia-Regular.woff2',
  weight: '400',
  variable: '--font-unifraktur',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: BRAND.nameplate, template: `%s · ${BRAND.name}` },
  description: BRAND.tagline,
  applicationName: BRAND.nameplate,
  // Installed from the iOS share sheet: full screen, named "Morrow", paper-coloured status bar.
  appleWebApp: { capable: true, title: BRAND.name, statusBarStyle: 'default' },
  formatDetection: { telephone: false },
};

// Browser chrome follows the Morrow paper token (tokens.css --paper, light and dark).
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f0e6' },
    { media: '(prefers-color-scheme: dark)', color: '#15130f' },
  ],
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${newsreader.variable} ${franklin.variable} ${unifraktur.variable}`}
    >
      <body className="min-h-dvh bg-paper text-ink antialiased">
        <Providers>
          <TooltipProvider>{children}</TooltipProvider>
        </Providers>
      </body>
    </html>
  );
}
