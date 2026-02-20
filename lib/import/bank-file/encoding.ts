/**
 * Encoding detection and conversion for Swedish bank files.
 *
 * Swedish bank exports use either UTF-8 or Windows-1252 (ISO-8859-1).
 * We detect encoding by checking for valid Swedish characters.
 */

/**
 * Decode file content, handling both UTF-8 and Windows-1252 encodings.
 *
 * Strategy: Try UTF-8 first. If the result contains replacement characters
 * (U+FFFD) or garbled Swedish chars, fall back to Windows-1252.
 */
export function decodeFileContent(buffer: ArrayBuffer): string {
  // Try UTF-8 first
  const utf8Decoder = new TextDecoder('utf-8', { fatal: false })
  const utf8Result = utf8Decoder.decode(buffer)

  // Check if UTF-8 decode produced valid Swedish text
  if (!hasEncodingIssues(utf8Result)) {
    return utf8Result
  }

  // Fall back to Windows-1252 (superset of ISO-8859-1)
  const latin1Decoder = new TextDecoder('windows-1252', { fatal: false })
  return latin1Decoder.decode(buffer)
}

/**
 * Decode a string that may have been incorrectly decoded as UTF-8
 * when the source was actually Windows-1252.
 */
export function decodeStringContent(content: string): string {
  // If the string already contains valid Swedish chars, return as-is
  if (!hasEncodingIssues(content)) {
    return content
  }

  // Try re-encoding as Latin-1 and decoding as Windows-1252
  try {
    const bytes = new Uint8Array(content.length)
    for (let i = 0; i < content.length; i++) {
      bytes[i] = content.charCodeAt(i) & 0xff
    }
    const decoder = new TextDecoder('windows-1252', { fatal: false })
    return decoder.decode(bytes)
  } catch {
    return content
  }
}

/**
 * Check if a string has encoding issues (garbled Swedish characters).
 */
function hasEncodingIssues(text: string): boolean {
  // U+FFFD = replacement character (means invalid UTF-8 byte sequences)
  if (text.includes('\uFFFD')) return true

  // Common garbled patterns when Windows-1252 is read as UTF-8:
  // Ã¥ = å, Ã¤ = ä, Ã¶ = ö, Ã… = Å, Ã„ = Ä, Ã– = Ö
  const garbledPatterns = ['Ã¥', 'Ã¤', 'Ã¶', 'Ã\u0085', 'Ã\u0084', 'Ã\u0096']
  return garbledPatterns.some((pattern) => text.includes(pattern))
}

/**
 * Normalize line endings to \n
 */
export function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

/**
 * Strip BOM (Byte Order Mark) from start of content
 */
export function stripBOM(content: string): string {
  if (content.charCodeAt(0) === 0xfeff) {
    return content.slice(1)
  }
  return content
}

/**
 * Prepare file content for parsing: strip BOM, normalize line endings, handle encoding
 */
export function prepareContent(content: string): string {
  return normalizeLineEndings(stripBOM(decodeStringContent(content)))
}
