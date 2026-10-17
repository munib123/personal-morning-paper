import type { MetadataRoute } from 'next';
import { BRAND } from '@/lib/brand';

// The installable app (PWA): "Add to Home Screen" opens today's paper full screen. Colours are the
// Morrow light paper token (tokens.css --paper); the icons are the nameplate "M" in ink on paper
// (public/icons, src/app/icon.png, src/app/apple-icon.png). No service worker on purpose: the demo
// fallback is the seeded edition, not a browser cache that could serve a stale paper.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/today',
    name: BRAND.nameplate,
    short_name: BRAND.name,
    description: BRAND.tagline,
    start_url: '/today',
    scope: '/',
    display: 'standalone',
    background_color: '#f5f0e6',
    theme_color: '#f5f0e6', // matches the viewport theme-color, so the status bar never flashes ink
    categories: ['news', 'books', 'education'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: "Today's paper", short_name: 'Today', url: '/today' },
      { name: 'Past editions', short_name: 'Archive', url: '/archive' },
      { name: 'Saved stories', short_name: 'Saved', url: '/saved' },
    ],
  };
}
