'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { Copy, Check, CreditCard } from 'lucide-react'

interface OCRDisplayProps {
  ocrNumber: string
  bankgiro?: string | null
  plusgiro?: string | null
  paymentType?: string | null
}

export function OCRDisplay({ ocrNumber, bankgiro, plusgiro, paymentType }: OCRDisplayProps) {
  const [copied, setCopied] = useState(false)
  const { toast } = useToast()

  async function copyOCR() {
    try {
      await navigator.clipboard.writeText(ocrNumber)
      setCopied(true)
      toast({
        title: 'Kopierat',
        description: 'OCR-nummer kopierat till urklipp',
      })
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast({
        title: 'Fel',
        description: 'Kunde inte kopiera till urklipp',
        variant: 'destructive',
      })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Betalningsinformation
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* OCR Number */}
        <div>
          <p className="text-sm text-muted-foreground mb-1">OCR-nummer</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 bg-muted rounded-md font-mono text-lg tracking-wider">
              {ocrNumber}
            </code>
            <Button
              variant="outline"
              size="icon"
              onClick={copyOCR}
              title="Kopiera OCR-nummer"
            >
              {copied ? (
                <Check className="h-4 w-4 text-success" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Payment details */}
        {bankgiro && (
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Bankgiro</span>
            <span className="font-mono">{bankgiro}</span>
          </div>
        )}

        {plusgiro && (
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Plusgiro</span>
            <span className="font-mono">{plusgiro}</span>
          </div>
        )}

        {paymentType && (
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Betalningssatt</span>
            <span className="text-sm capitalize">{paymentType}</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
