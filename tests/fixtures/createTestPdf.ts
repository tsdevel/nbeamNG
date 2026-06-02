import { readFileSync } from 'fs';
import { join } from 'path';

let cachedPdf: Buffer | null = null;

/**
 * Returns a known-valid PDF buffer for integration tests.
 * The dummy.pdf file contains the text "Dummy PDF file".
 */
export function createTestPdf(_text?: string): Buffer {
  if (!cachedPdf) {
    cachedPdf = readFileSync(join(__dirname, 'dummy.pdf'));
  }
  return cachedPdf;
}