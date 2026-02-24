'use client'

import { useState, useEffect, useCallback } from 'react'
import { useExtensionData } from './use-extension-data'

interface MockMeta {
  importedAt: string
  source: 'csv' | 'json'
  fileName: string
  rowCount: number
}

interface UseMockDataResult<T> {
  mockReport: T | null
  isMockActive: boolean
  isLoading: boolean
  importedAt: string | null
  meta: MockMeta | null
  saveMockData: (report: T, meta: Omit<MockMeta, 'importedAt'>) => Promise<void>
  clearMockData: () => Promise<void>
}

export function useMockData<T>(sector: string, slug: string): UseMockDataResult<T> {
  const { getByKey, save, remove, isLoading } = useExtensionData(sector, slug)

  const [mockReport, setMockReport] = useState<T | null>(null)
  const [isMockActive, setIsMockActive] = useState(false)
  const [meta, setMeta] = useState<MockMeta | null>(null)

  // Read mock state from extension data on load
  useEffect(() => {
    if (isLoading) return

    const enabledRecord = getByKey('mock:enabled')
    const reportRecord = getByKey('mock:report')
    const metaRecord = getByKey('mock:meta')

    if (enabledRecord && (enabledRecord.value as { enabled?: boolean }).enabled && reportRecord) {
      setIsMockActive(true)
      setMockReport(reportRecord.value as T)
      if (metaRecord) {
        setMeta(metaRecord.value as unknown as MockMeta)
      }
    } else {
      setIsMockActive(false)
      setMockReport(null)
      setMeta(null)
    }
  }, [isLoading, getByKey])

  const saveMockData = useCallback(async (report: T, metaInput: Omit<MockMeta, 'importedAt'>) => {
    const fullMeta: MockMeta = {
      ...metaInput,
      importedAt: new Date().toISOString(),
    }

    await save('mock:enabled', { enabled: true })
    await save('mock:report', report as unknown as Record<string, unknown>)
    await save('mock:meta', fullMeta as unknown as Record<string, unknown>)

    setIsMockActive(true)
    setMockReport(report)
    setMeta(fullMeta)
  }, [save])

  const clearMockData = useCallback(async () => {
    await remove('mock:enabled')
    await remove('mock:report')
    await remove('mock:meta')

    setIsMockActive(false)
    setMockReport(null)
    setMeta(null)
  }, [remove])

  return {
    mockReport,
    isMockActive,
    isLoading,
    importedAt: meta?.importedAt ?? null,
    meta,
    saveMockData,
    clearMockData,
  }
}
