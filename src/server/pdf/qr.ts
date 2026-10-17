import QRCode from 'qrcode';

// Morning `ink` (tokens.json) on transparent, so the newsprint shows through. Level M survives a creased page.
export const QR_OPTIONS = {
  type: 'svg',
  margin: 0,
  errorCorrectionLevel: 'M',
  color: { dark: '#1b1813', light: '#0000' },
} as const;

/** The QR code of a printed story's /r link, as an inline SVG string. */
export function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { ...QR_OPTIONS, color: { ...QR_OPTIONS.color } });
}
