// STUB (L0) — owner: L6. Replace freely; keep the props.
import { Button } from '@/components/morrow';
import { ROUTES } from '@/contracts/api';

export interface PdfButtonProps {
  date: string;
  editionId: string | null;
}

// The one accent button on the screen. The route 302s to the stored PDF, renders it, or answers
// 503 { fallback: '/paper/{date}/print' }. L6 adds the fallback handling and the pdf_download signal.
export function PdfButton({ date, editionId }: PdfButtonProps) {
  return (
    <Button variant="accent" icon="download" href={ROUTES.pdf(date)} data-edition-id={editionId ?? undefined}>
      Download PDF
    </Button>
  );
}

export default PdfButton;
