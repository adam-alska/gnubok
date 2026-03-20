'use client'

import dynamic from 'next/dynamic'
import { ENABLED_EXTENSION_IDS } from '@/lib/extensions/_generated/enabled-extensions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Receipt, Loader2 } from 'lucide-react'
import Link from 'next/link'

const ReceiptsPageOCR = dynamic(
  () => import('@/extensions/general/receipt-ocr/pages/ReceiptsPage'),
  { loading: () => <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div> }
)

const ocrEnabled = ENABLED_EXTENSION_IDS.has('receipt-ocr')

export default function ReceiptsPage() {
  if (ocrEnabled) {
    return <ReceiptsPageOCR />
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl md:text-3xl font-medium tracking-tight">Kvitton</h1>
        <p className="text-muted-foreground">
          Hantera och granska dina kvitton
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Kvittoscanning
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Aktivera tillägget &quot;Kvittoscanning&quot; för att skanna kvitton med AI,
            extrahera data automatiskt och matcha mot transaktioner.
          </p>
          <Button asChild>
            <Link href="/extensions/general?highlight=receipt-ocr">
              Aktivera i Tillägg
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
