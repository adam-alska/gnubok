/**
 * PDF Utilities
 *
 * Helper functions for PDF handling.
 * Note: Actual PDF reading is done by Claude directly via document input.
 */

/**
 * Convert PDF buffer to base64 for Claude API
 */
export function pdfToBase64(buffer: Buffer): string {
  return buffer.toString('base64')
}

/**
 * Get basic PDF info from buffer (file size check)
 */
export function getPDFInfo(buffer: Buffer): {
  sizeBytes: number
  sizeMB: number
  isValidSize: boolean
} {
  const sizeBytes = buffer.length
  const sizeMB = sizeBytes / (1024 * 1024)
  // Claude supports PDFs up to 32MB
  const isValidSize = sizeMB <= 32

  return {
    sizeBytes,
    sizeMB,
    isValidSize,
  }
}
