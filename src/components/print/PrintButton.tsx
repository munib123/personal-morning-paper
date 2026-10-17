'use client';
// The print route's one control: the browser's own print dialog (Save as PDF). Hidden when printing.
import { Button } from '@/components/morrow';

export function PrintButton() {
  return (
    <div className="screen-only">
      <Button variant="primary" icon="download" onClick={() => window.print()}>
        Print / Save as PDF
      </Button>
    </div>
  );
}
