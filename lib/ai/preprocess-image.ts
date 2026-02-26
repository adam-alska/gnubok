/**
 * Image Preprocessing for OCR
 *
 * SERVER-ONLY: Uses sharp for image processing.
 *
 * Preprocesses receipt/invoice images before sending to Claude Vision.
 * Targets faded thermal prints with low contrast — the primary source
 * of garbled OCR output.
 */

import 'server-only'
import sharp from 'sharp'

/**
 * Preprocess an image for better OCR accuracy.
 * Converts to grayscale, normalizes contrast, and sharpens.
 * Returns base64-encoded JPEG.
 *
 * For PDFs: returns input unchanged (sharp doesn't handle PDFs).
 */
export async function preprocessImage(
  base64: string,
  mimeType: string
): Promise<{ base64: string; mimeType: string }> {
  // PDFs are not image files — return as-is
  if (mimeType === 'application/pdf') {
    return { base64, mimeType }
  }

  const buffer = Buffer.from(base64, 'base64')

  const processed = await sharp(buffer)
    .grayscale()
    .normalize()
    .sharpen({ sigma: 1.5 })
    .jpeg({ quality: 90 })
    .toBuffer()

  return {
    base64: processed.toString('base64'),
    mimeType: 'image/jpeg',
  }
}
