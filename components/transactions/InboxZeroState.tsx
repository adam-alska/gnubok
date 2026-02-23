'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Check, Upload, Plus } from 'lucide-react'
import Link from 'next/link'

interface InboxZeroStateProps {
  hasTransactions: boolean
  onCreateTransaction: () => void
}

export default function InboxZeroState({ hasTransactions, onCreateTransaction }: InboxZeroStateProps) {
  if (!hasTransactions) {
    // No transactions at all
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div className="p-5 rounded-full bg-muted mb-6">
            <Upload className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-2">Inga transaktioner</h3>
          <p className="text-sm text-muted-foreground text-center max-w-sm mb-6">
            Importera kontoutdrag från din bank eller lägg till transaktioner manuellt för att komma igång.
          </p>
          <div className="flex gap-2">
            <Button asChild>
              <Link href="/import">
                <Upload className="mr-2 h-4 w-4" />
                Importera transaktioner
              </Link>
            </Button>
            <Button variant="outline" onClick={onCreateTransaction}>
              <Plus className="mr-2 h-4 w-4" />
              Lägg till manuellt
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // All transactions categorized - inbox zero!
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12">
        <div className="h-16 w-16 rounded-full bg-success/10 flex items-center justify-center mb-4">
          <Check className="h-8 w-8 text-success" />
        </div>
        <h3 className="text-lg font-bold">Alla transaktioner bokförda!</h3>
        <p className="text-muted-foreground text-center mt-1 max-w-sm">
          Bra jobbat! Alla dina transaktioner är bokförda. Importera fler eller växla till historik.
        </p>
        <div className="flex gap-2 mt-6">
          <Button asChild variant="outline">
            <Link href="/import">
              <Upload className="mr-2 h-4 w-4" />
              Importera fler
            </Link>
          </Button>
          <Button variant="outline" onClick={onCreateTransaction}>
            <Plus className="mr-2 h-4 w-4" />
            Ny transaktion
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
