import { describe, it, expect, vi } from 'vitest'

// Mock server-only
vi.mock('server-only', () => ({}))

// Mock sharp - use vi.hoisted to avoid initialization order issues
const { mockSharp, mockSharpChain, mockToBuffer } = vi.hoisted(() => {
  const mockToBuffer = vi.fn()
  const mockSharpChain = {
    grayscale: vi.fn().mockReturnThis(),
    normalize: vi.fn().mockReturnThis(),
    sharpen: vi.fn().mockReturnThis(),
    jpeg: vi.fn().mockReturnThis(),
    toBuffer: mockToBuffer,
  }
  const mockSharp = vi.fn().mockReturnValue(mockSharpChain)
  return { mockSharp, mockSharpChain, mockToBuffer }
})

vi.mock('sharp', () => ({ default: mockSharp }))

import { preprocessImage } from '../preprocess-image'

describe('preprocessImage', () => {
  it('returns PDFs unchanged', async () => {
    const result = await preprocessImage('pdf-base64-data', 'application/pdf')

    expect(result.base64).toBe('pdf-base64-data')
    expect(result.mimeType).toBe('application/pdf')
    expect(mockSharp).not.toHaveBeenCalled()
  })

  it('processes JPEG images through sharp pipeline', async () => {
    const inputBase64 = Buffer.from('fake-image-data').toString('base64')
    const outputBuffer = Buffer.from('processed-image')
    mockToBuffer.mockResolvedValueOnce(outputBuffer)

    const result = await preprocessImage(inputBase64, 'image/jpeg')

    expect(mockSharp).toHaveBeenCalled()
    expect(mockSharpChain.grayscale).toHaveBeenCalled()
    expect(mockSharpChain.normalize).toHaveBeenCalled()
    expect(mockSharpChain.sharpen).toHaveBeenCalledWith({ sigma: 1.5 })
    expect(mockSharpChain.jpeg).toHaveBeenCalledWith({ quality: 90 })
    expect(result.mimeType).toBe('image/jpeg')
    expect(result.base64).toBe(outputBuffer.toString('base64'))
  })

  it('processes PNG images and outputs as JPEG', async () => {
    const inputBase64 = Buffer.from('fake-png-data').toString('base64')
    const outputBuffer = Buffer.from('processed-png')
    mockToBuffer.mockResolvedValueOnce(outputBuffer)

    const result = await preprocessImage(inputBase64, 'image/png')

    expect(result.mimeType).toBe('image/jpeg')
    expect(mockSharp).toHaveBeenCalled()
  })

  it('processes WebP images', async () => {
    const inputBase64 = Buffer.from('fake-webp').toString('base64')
    mockToBuffer.mockResolvedValueOnce(Buffer.from('out'))

    const result = await preprocessImage(inputBase64, 'image/webp')

    expect(result.mimeType).toBe('image/jpeg')
  })
})
