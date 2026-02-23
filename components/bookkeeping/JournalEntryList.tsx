'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ChevronDown, ChevronRight, Paperclip, AlertTriangle } from 'lucide-react'
import { AccountNumber } from '@/components/ui/account-number'
import JournalEntryAttachments from '@/components/bookkeeping/JournalEntryAttachments'
import type { JournalEntry, JournalEntryLine } from '@/types'

const NEEDS_ATTACHMENT = new Set([
  'manual',
  'bank_transaction',
  'supplier_invoice_registered',
  'supplier_invoice_paid',
  'supplier_invoice_cash_payment',
  'import',
])

interface Props {
  periodId?: string
}

export default function JournalEntryList({ periodId }: Props) {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(0)
  const [attachmentCounts, setAttachmentCounts] = useState<Record<string, number>>({})
  const [showMissingOnly, setShowMissingOnly] = useState(false)
  const pageSize = 20

  const fetchAttachmentCounts = useCallback(async (entryIds: string[]) => {
    if (entryIds.length === 0) return
    try {
      const res = await fetch(
        `/api/documents/counts?journal_entry_ids=${entryIds.join(',')}`
      )
      const { data } = await res.json()
      setAttachmentCounts(data || {})
    } catch {
      console.error('Failed to fetch attachment counts')
    }
  }, [])

  useEffect(() => {
    fetchEntries()
  }, [periodId, page])

  async function fetchEntries() {
    setLoading(true)
    const params = new URLSearchParams({
      limit: String(pageSize),
      offset: String(page * pageSize),
    })
    if (periodId) params.set('period_id', periodId)

    const res = await fetch(`/api/bookkeeping/journal-entries?${params}`)
    const { data, count: total } = await res.json()
    const loadedEntries = data || []
    setEntries(loadedEntries)
    setCount(total || 0)
    setLoading(false)

    // Fetch attachment counts for the loaded entries
    const ids = loadedEntries.map((e: JournalEntry) => e.id)
    fetchAttachmentCounts(ids)
  }

  const handleAttachmentCountChange = useCallback((entryId: string, count: number) => {
    setAttachmentCounts((prev) => ({ ...prev, [entryId]: count }))
  }, [])

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id)
  }

  const statusLabel = (status: string) => {
    switch (status) {
      case 'posted':
        return <Badge variant="success">Bokförd</Badge>
      case 'draft':
        return <Badge variant="secondary">Utkast</Badge>
      case 'reversed':
        return <Badge variant="destructive">Makulerad</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const sourceLabel = (source: string) => {
    const labels: Record<string, string> = {
      manual: 'Manuell',
      bank_transaction: 'Banktransaktion',
      invoice_created: 'Faktura',
      invoice_paid: 'Betalning',
      credit_note: 'Kreditfaktura',
      salary_payment: 'Lön',
      opening_balance: 'Ingående balans',
      year_end: 'Årsbokslut',
      supplier_invoice_registered: 'Leverantörsfaktura',
      supplier_invoice_paid: 'Leverantörsbetalning',
      supplier_invoice_cash_payment: 'Kontant leverantörsbetalning',
      import: 'Import',
      storno: 'Storno',
      correction: 'Korrigering',
    }
    return labels[source] || source
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          Laddar verifikationer...
        </CardContent>
      </Card>
    )
  }

  if (entries.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          Inga verifikationer hittades.
        </CardContent>
      </Card>
    )
  }

  const filteredEntries = showMissingOnly
    ? entries.filter(
        (e) =>
          NEEDS_ATTACHMENT.has(e.source_type) &&
          !attachmentCounts[e.id] &&
          e.status === 'posted'
      )
    : entries

  return (
    <div className="space-y-4">
      {/* Missing attachment filter */}
      <div className="flex items-center gap-2">
        <Switch
          id="missing-attachments"
          checked={showMissingOnly}
          onCheckedChange={setShowMissingOnly}
        />
        <Label htmlFor="missing-attachments" className="text-sm cursor-pointer">
          Visa saknade underlag
        </Label>
        {showMissingOnly && (
          <Badge variant="secondary" className="text-xs">
            {filteredEntries.length}
          </Badge>
        )}
      </div>

      <div className="space-y-2">
        {filteredEntries.map((entry) => {
          const isExpanded = expandedId === entry.id
          const lines = (entry.lines || []) as JournalEntryLine[]

          return (
            <Card key={entry.id}>
              <button
                onClick={() => toggleExpand(entry.id)}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3 flex-1">
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0" />
                  )}
                  <span className="font-mono text-sm text-muted-foreground w-16">
                    {entry.voucher_series}{entry.voucher_number}
                  </span>
                  <span className="text-sm text-muted-foreground w-24">
                    {entry.entry_date}
                  </span>
                  <span className="flex-1 truncate">{entry.description}</span>
                  {/* Attachment indicator */}
                  {attachmentCounts[entry.id] ? (
                    <span className="flex items-center gap-0.5 text-muted-foreground mr-1" title={`${attachmentCounts[entry.id]} underlag`}>
                      <Paperclip className="h-3.5 w-3.5" />
                      <span className="text-xs">{attachmentCounts[entry.id]}</span>
                    </span>
                  ) : (
                    NEEDS_ATTACHMENT.has(entry.source_type) && entry.status === 'posted' && (
                      <span className="mr-1" title="Underlag saknas">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                      </span>
                    )
                  )}
                  <Badge variant="outline" className="text-xs mr-2">
                    {sourceLabel(entry.source_type)}
                  </Badge>
                  {statusLabel(entry.status)}
                </div>
              </button>

              {isExpanded && lines.length > 0 && (
                <CardContent className="pt-0 pb-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 w-48">Konto</th>
                        <th className="py-2">Beskrivning</th>
                        <th className="py-2 w-28 text-right">Debet</th>
                        <th className="py-2 w-28 text-right">Kredit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines
                        .sort((a, b) => a.sort_order - b.sort_order)
                        .map((line) => (
                          <tr key={line.id} className="border-b last:border-0">
                            <td className="py-2"><AccountNumber number={line.account_number} showName /></td>
                            <td className="py-2 text-muted-foreground">
                              {line.line_description || ''}
                            </td>
                            <td className="py-2 text-right">
                              {Number(line.debit_amount) > 0
                                ? Number(line.debit_amount).toLocaleString('sv-SE', {
                                    minimumFractionDigits: 2,
                                  })
                                : ''}
                            </td>
                            <td className="py-2 text-right">
                              {Number(line.credit_amount) > 0
                                ? Number(line.credit_amount).toLocaleString('sv-SE', {
                                    minimumFractionDigits: 2,
                                  })
                                : ''}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                    <tfoot>
                      <tr className="font-semibold">
                        <td colSpan={2} className="py-2">
                          Summa
                        </td>
                        <td className="py-2 text-right">
                          {lines
                            .reduce((sum, l) => sum + (Number(l.debit_amount) || 0), 0)
                            .toLocaleString('sv-SE', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 text-right">
                          {lines
                            .reduce((sum, l) => sum + (Number(l.credit_amount) || 0), 0)
                            .toLocaleString('sv-SE', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    </tfoot>
                  </table>

                  <JournalEntryAttachments
                    journalEntryId={entry.id}
                    onCountChange={(c) => handleAttachmentCountChange(entry.id, c)}
                  />
                </CardContent>
              )}
            </Card>
          )
        })}
      </div>

      {/* Pagination */}
      {count > pageSize && (
        <div className="flex justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            Föregående
          </Button>
          <span className="text-sm text-muted-foreground self-center">
            Sida {page + 1} av {Math.ceil(count / pageSize)}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={(page + 1) * pageSize >= count}
            onClick={() => setPage(page + 1)}
          >
            Nästa
          </Button>
        </div>
      )}
    </div>
  )
}
