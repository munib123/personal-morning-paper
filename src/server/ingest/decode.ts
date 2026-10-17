const HEADER_CHARSET = /charset\s*=\s*["']?([^"';\s]+)/i;
const PROLOG_ENCODING = /<\?xml[^>]*?\bencoding\s*=\s*["']([^"']+)["']/i;

function decoder(label: string): TextDecoder | null {
  try {
    return new TextDecoder(label);
  } catch {
    return null; // unknown label
  }
}

const isUtf8 = (label: string) => decoder(label)?.encoding === 'utf-8';

function bomLabel(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'utf-8';
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le';
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be';
  return null;
}

/**
 * Feed bytes → text (§10.1 "decode by the declared charset"). The label comes from a BOM, else the
 * Content-Type charset, else the XML prolog encoding (sniffed from the first 200 bytes), else utf-8.
 * Bytes labelled utf-8 that are not valid utf-8 are decoded with the prolog label (when it names
 * another charset) or windows-1252. WHATWG decodes iso-8859-1 as windows-1252, which is what the
 * Geo / The News feeds actually contain (curly quotes in 0x80-0x9f). The BOM and any leading
 * whitespace (Dezeen) are removed.
 */
export function decodeFeedBody(bytes: Uint8Array, contentType: string | null): string {
  const header = contentType?.match(HEADER_CHARSET)?.[1]?.trim() || null;
  const prolog = new TextDecoder('latin1').decode(bytes.subarray(0, 200)).match(PROLOG_ENCODING)?.[1]?.trim() || null;
  const label = bomLabel(bytes) ?? (header && decoder(header) ? header : null) ?? (prolog && decoder(prolog) ? prolog : null) ?? 'utf-8';

  let text: string;
  if (isUtf8(label)) {
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      const alt = prolog && decoder(prolog) && !isUtf8(prolog) ? prolog : 'windows-1252';
      text = new TextDecoder(alt).decode(bytes);
    }
  } else {
    text = new TextDecoder(label).decode(bytes);
  }
  return text.replace(/^﻿/, '').trimStart();
}
