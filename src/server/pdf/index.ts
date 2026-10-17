// L6 PDF module (ARCHITECTURE §9.3). Signatures are the contract:
//   getEditionPdfUrl(editionId: string): Promise<string | null>     signed URL if stored
//   renderAndStoreEditionPdf(edition: Edition): Promise<string>      returns the storage path
export { getEditionPdfUrl, renderAndStoreEditionPdf } from './storage';
