'use client'

import dynamic from 'next/dynamic'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ENABLED_EXTENSION_IDS } from '@/lib/extensions/_generated/enabled-extensions'
import { Loader2 } from 'lucide-react'

const ScanReceiptPageOCR = dynamic(
  () => import('@/extensions/general/receipt-ocr/pages/scan/ScanReceiptPage'),
  { loading: () => <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div> }
)

const ocrEnabled = ENABLED_EXTENSION_IDS.has('receipt-ocr')

export default function ScanReceiptPage() {
  const router = useRouter()

  useEffect(() => {
    if (!ocrEnabled) {
      router.replace('/receipts')
    }
  }, [router])

  if (!ocrEnabled) {
    return null
  }

  return <ScanReceiptPageOCR />
}
