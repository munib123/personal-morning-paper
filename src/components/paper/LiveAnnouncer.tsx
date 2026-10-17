'use client';
// One polite live region per edition: skip, undo and feedback notes are read out to screen readers.
// The region exists from the first render (a region inserted with its text is often not announced),
// and repeating the same message nudges it with a zero-width space so it is read again.
import { useCallback, useState, type ReactNode } from 'react';

export function useLiveAnnouncer(): { announce: (msg: string) => void; region: ReactNode } {
  const [message, setMessage] = useState('');
  const announce = useCallback((msg: string) => setMessage((prev) => (prev === msg ? `${msg}​` : msg)), []);
  const region = (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </div>
  );
  return { announce, region };
}
