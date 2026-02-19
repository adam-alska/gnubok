'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ReceiptCamera from '../../components/ReceiptCamera'
import ReceiptReviewView from '../../components/ReceiptReviewView'
import TransactionMatcher from '../../components/TransactionMatcher'
import { Loader2 } from 'lucide-react'
import type { Receipt, ReceiptLineItem, ConfirmLineItemInput } from '@/types'

type PageState = 'camera' | 'uploading' | 'review' | 'match' | 'done'

export default function ScanReceiptPage() {
  const router = useRouter()
  const [pageState, setPageState] = useState<PageState>('camera')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<(Receipt & { line_items: ReceiptLineItem[] }) | null>(null)

  // Handle image capture
  const handleCapture = async (imageData: string, mimeType: string) => {
    setPageState('uploading')
    setUploadError(null)

    try {
      // Convert base64 to blob
      const byteCharacters = atob(imageData)
      const byteNumbers = new Array(byteCharacters.length)
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i)
      }
      const byteArray = new Uint8Array(byteNumbers)
      const blob = new Blob([byteArray], { type: mimeType })

      // Create form data
      const formData = new FormData()
      formData.append('image', blob, 'receipt.jpg')

      // Upload and analyze
      const response = await fetch('/api/extensions/receipt-ocr/upload', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (response.ok && data.data) {
        setReceipt(data.data)
        setPageState('review')
      } else {
        setUploadError(data.error || 'Kunde inte analysera kvittot')
        setPageState('camera')
      }
    } catch (error) {
      console.error('Upload error:', error)
      setUploadError('Nätverksfel. Försök igen.')
      setPageState('camera')
    }
  }

  // Handle close/cancel
  const handleClose = () => {
    router.push('/receipts')
  }

  // Handle confirm receipt
  const handleConfirm = async (data: {
    line_items: ConfirmLineItemInput[]
    representation_persons?: number
    representation_purpose?: string
  }) => {
    if (!receipt) return

    const response = await fetch(`/api/extensions/receipt-ocr/${receipt.id}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })

    if (response.ok) {
      const updatedData = await response.json()
      setReceipt(updatedData.data)
      setPageState('match')
    } else {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Kunde inte bekräfta kvitto')
    }
  }

  // Handle match to transaction
  const handleMatch = async (transactionId: string, confidence: number) => {
    if (!receipt) return

    const response = await fetch(`/api/extensions/receipt-ocr/${receipt.id}/match`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transaction_id: transactionId, match_confidence: confidence }),
    })

    if (response.ok) {
      router.push('/receipts')
    }
  }

  // Handle skip matching
  const handleSkipMatch = () => {
    router.push('/receipts')
  }

  // Render uploading state
  if (pageState === 'uploading') {
    return (
      <div className="fixed inset-0 bg-background z-50 flex flex-col items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg font-medium">Analyserar kvitto...</p>
        <p className="text-sm text-muted-foreground mt-1">
          AI läser av artiklar och belopp
        </p>
      </div>
    )
  }

  // Render review view
  if (pageState === 'review' && receipt) {
    return (
      <ReceiptReviewView
        receipt={receipt}
        onConfirm={handleConfirm}
        onCancel={handleClose}
        onFindMatches={() => setPageState('match')}
      />
    )
  }

  // Render match view
  if (pageState === 'match' && receipt) {
    return (
      <TransactionMatcher
        receipt={receipt}
        onMatch={handleMatch}
        onSkip={handleSkipMatch}
        onClose={handleClose}
      />
    )
  }

  // Render camera (default)
  return (
    <>
      {uploadError && (
        <div className="fixed top-4 left-4 right-4 z-[60] bg-destructive text-destructive-foreground p-3 rounded-lg text-sm">
          {uploadError}
        </div>
      )}
      <ReceiptCamera onCapture={handleCapture} onClose={handleClose} />
    </>
  )
}
