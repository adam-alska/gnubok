'use client'

import dynamic from 'next/dynamic'
import { useExtensionToggle } from '@/lib/extensions/hooks'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'

const ScanReceiptPageOCR = dynamic(
  () => import('@/extensions/general/receipt-ocr/pages/scan/ScanReceiptPage'),
  { loading: () => <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div> }
)

export default function ScanReceiptPage() {
  const { enabled, isLoading } = useExtensionToggle('general', 'receipt-ocr')
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && !enabled) {
      router.replace('/receipts')
    }
  }, [isLoading, enabled, router])

  if (isLoading || !enabled) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return <ScanReceiptPageOCR />
}
