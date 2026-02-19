'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/use-toast'
import { formatCurrency } from '@/lib/utils'
import { Loader2, CheckCircle2, AlertTriangle, BookOpen } from 'lucide-react'
import type { DepreciationPostingPreview as PreviewType } from '@/types/fixed-assets'

interface DepreciationPostingPreviewProps {
  entries: PreviewType[]
  totalAmount: number
  period: string
  isLoading: boolean
  onPosted: () => void
}

const MONTH_NAMES = [
  '', 'Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni',
  'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December',
]

export function DepreciationPostingPreview({
  entries,
  totalAmount,
  period,
  isLoading,
  onPosted,
}: DepreciationPostingPreviewProps) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isPosting, setIsPosting] = useState(false)
  const { toast } = useToast()

  const [year, month] = period.split('-').map(Number)
  const periodLabel = `${MONTH_NAMES[month] || ''} ${year}`

  async function handlePost() {
    setIsPosting(true)
    try {
      const res = await fetch('/api/depreciation/post-monthly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month }),
      })

      const json = await res.json()

      if (!res.ok) {
        throw new Error(json.error || 'Kunde inte bokfora avskrivningar')
      }

      toast({
        title: 'Avskrivningar bokforda',
        description: `${json.data.posted_count} avskrivningar totalt ${formatCurrency(json.data.total_amount)} bokforda for ${periodLabel}`,
      })

      setConfirmOpen(false)
      onPosted()
    } catch (err) {
      toast({
        title: 'Fel',
        description: err instanceof Error ? err.message : 'Ett fel uppstod',
        variant: 'destructive',
      })
    } finally {
      setIsPosting(false)
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Avskrivningar att bokfora
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 animate-pulse">
            <div className="h-4 bg-muted rounded w-48" />
            <div className="h-4 bg-muted rounded w-64" />
            <div className="h-4 bg-muted rounded w-40" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (entries.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-success" />
            Avskrivningar for {periodLabel}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Inga avskrivningar att bokföra för denna period. Alla avskrivningar är redan bokförda
            eller så finns inga aktiva tillgångar med avskrivningsplan.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Avskrivningar for {periodLabel}
            </CardTitle>
            <Button onClick={() => setConfirmOpen(true)}>
              Bokfor avskrivningar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tillgang</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead className="font-mono">Debet</TableHead>
                  <TableHead className="font-mono">Kredit</TableHead>
                  <TableHead className="text-right">Belopp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.asset_id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{entry.asset_name}</p>
                        <p className="text-xs text-muted-foreground font-mono">
                          {entry.asset_number}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {entry.category_name}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {entry.expense_account}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {entry.depreciation_account}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatCurrency(entry.depreciation_amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={4} className="font-medium">
                    Totalt
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-bold">
                    {formatCurrency(totalAmount)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bekräfta bokföring</DialogTitle>
            <DialogDescription>
              Du är på väg att bokföra avskrivningar för {periodLabel}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span>Antal tillgangar:</span>
              <span className="font-medium">{entries.length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Totalt belopp:</span>
              <span className="font-bold">{formatCurrency(totalAmount)}</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-warning/10 p-3 text-sm">
              <AlertTriangle className="h-4 w-4 text-warning-foreground shrink-0" />
              <span className="text-warning-foreground">
                En verifikation skapas per tillgång. Denna åtgärd kan inte ångras.
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Avbryt
            </Button>
            <Button onClick={handlePost} disabled={isPosting}>
              {isPosting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Bokfor {entries.length} avskrivningar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
