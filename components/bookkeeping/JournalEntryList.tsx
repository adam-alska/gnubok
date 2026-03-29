'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ArrowDownNarrowWide, ArrowUpNarrowWide, ChevronDown, ChevronRight, Paperclip, AlertTriangle, Loader2, BookOpen, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { AccountNumber } from '@/components/ui/account-number'
import JournalEntryAttachments from '@/components/bookkeeping/JournalEntryAttachments'
import CorrectionEntryDialog from '@/components/bookkeeping/CorrectionEntryDialog'
import JournalEntryStatusBadge from '@/components/bookkeeping/JournalEntryStatusBadge'
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
  const [correctionEntry, setCorrectionEntry] = useState<JournalEntry | null>(null)
  const [dateSortDir, setDateSortDir] = useState<'desc' | 'asc'>('desc')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [dateFromInput, setDateFromInput] = useState('')
  const [dateToInput, setDateToInput] = useState('')
  const pageSize = 20

  const normalizeDate = (v: string): string | null => {
    const trimmed = v.trim()
    if (!trimmed) return null
    // YYYY
    if (/^\d{4}$/.test(trimmed)) {
      const y = parseInt(trimmed, 10)
      if (y < 1900 || y > 2100) return null
      return `${trimmed}-01-01`
    }
    // YYYY-MM
    if (/^\d{4}-\d{2}$/.test(trimmed)) {
      const [y, m] = trimmed.split('-').map(Number)
      if (y < 1900 || y > 2100 || m < 1 || m > 12) return null
      return `${trimmed}-01`
    }
    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const d = new Date(trimmed + 'T00:00:00')
      if (isNaN(d.getTime())) return null
      // Verify the date didn't roll over (e.g. 2024-02-31 → March)
      const [y, m, day] = trimmed.split('-').map(Number)
      if (d.getFullYear() !== y || d.getMonth() + 1 !== m || d.getDate() !== day) return null
      return trimmed
    }
    return null
  }

  const applyDateFilter = () => {
    const fromVal = dateFromInput.trim()
    const toVal = dateToInput.trim()
    const nextFrom = fromVal === '' ? '' : normalizeDate(fromVal) ?? dateFrom
    const nextTo = toVal === '' ? '' : normalizeDate(toVal) ?? dateTo
    setDateFromInput(nextFrom)
    setDateToInput(nextTo)
    if (nextFrom !== dateFrom || nextTo !== dateTo) {
      setDateFrom(nextFrom)
      setDateTo(nextTo)
      setPage(0)
    }
  }

  const fetchAttachmentCounts = useCallback(async (entryIds: string[]) => {
    if (entryIds.length === 0) return
    try {
      const res = await fetch(
        `/api/documents/counts?journal_entry_ids=${entryIds.join(',')}`
      )
      const { data } = await res.json()
      setAttachmentCounts(data || {})
    } catch {
      // Non-critical — silently ignore
    }
  }, [])

  async function fetchEntries() {
    setLoading(true)
    const params = new URLSearchParams({
      limit: String(pageSize),
      offset: String(page * pageSize),
      sort_date: dateSortDir,
    })
    if (periodId) params.set('period_id', periodId)
    if (dateFrom) params.set('date_from', dateFrom)
    if (dateTo) params.set('date_to', dateTo)

    const res = await fetch(`/api/bookkeeping/journal-entries?${params}`)
    if (!res.ok) {
      setLoading(false)
      return
    }
    const { data, count: total } = await res.json()
    const loadedEntries = data || []
    setEntries(loadedEntries)
    setCount(total || 0)
    setLoading(false)

    // Fetch attachment counts for the loaded entries
    const ids = loadedEntries.map((e: JournalEntry) => e.id)
    fetchAttachmentCounts(ids)
  }

  useEffect(() => {
    fetchEntries()
  }, [periodId, page, dateSortDir, dateFrom, dateTo])

  const handleAttachmentCountChange = useCallback((entryId: string, count: number) => {
    setAttachmentCounts((prev) => ({ ...prev, [entryId]: count }))
  }, [])

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id)
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">Laddar verifikationer...</p>
        </CardContent>
      </Card>
    )
  }

  if (entries.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div className="p-4 rounded-full bg-muted mb-4">
            <BookOpen className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-1">Inga verifikationer</h3>
          <p className="text-sm text-muted-foreground text-center max-w-sm">
            Verifikationer skapas automatiskt vid fakturering och transaktionsbokföring, eller manuellt via fliken &quot;Ny verifikation&quot;.
          </p>
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
      {/* Filters and sorting */}
      <div className="flex items-center gap-4 flex-wrap">
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
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5"
          onClick={() => { setDateSortDir(dateSortDir === 'desc' ? 'asc' : 'desc'); setPage(0) }}
        >
          {dateSortDir === 'desc' ? (
            <ArrowDownNarrowWide className="h-4 w-4" />
          ) : (
            <ArrowUpNarrowWide className="h-4 w-4" />
          )}
          <span className="text-xs">Datum {dateSortDir === 'desc' ? 'nyast först' : 'äldst först'}</span>
        </Button>
        <div className="flex items-center gap-1.5">
          <Input
            type="text"
            placeholder="Från YYYY-MM-DD"
            value={dateFromInput}
            onChange={(e) => setDateFromInput(e.target.value)}
            onBlur={() => {
              const v = dateFromInput.trim()
              if (v === '') return
              const normalized = normalizeDate(v)
              if (normalized) setDateFromInput(normalized)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                applyDateFilter()
              }
            }}
            className="h-8 w-[145px] text-xs"
          />
          <Input
            type="text"
            placeholder="Till YYYY-MM-DD"
            value={dateToInput}
            onChange={(e) => setDateToInput(e.target.value)}
            onBlur={() => {
              const v = dateToInput.trim()
              if (v === '') return
              const normalized = normalizeDate(v)
              if (normalized) setDateToInput(normalized)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                applyDateFilter()
              }
            }}
            className="h-8 w-[145px] text-xs"
          />
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={applyDateFilter}
          >
            Filtrera
          </Button>
          {(dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => { setDateFrom(''); setDateTo(''); setDateFromInput(''); setDateToInput(''); setPage(0) }}
              className="p-1 rounded-sm hover:bg-muted text-muted-foreground"
              title="Rensa datumfilter"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {filteredEntries.map((entry) => {
          const isExpanded = expandedId === entry.id
          const lines = (entry.lines || []) as JournalEntryLine[]

          return (
            <Card key={entry.id}>
              <button
                onClick={() => toggleExpand(entry.id)}
                aria-expanded={isExpanded}
                className="w-full p-4 text-left hover:bg-muted/50 transition-colors min-h-[44px]"
              >
                {/* Desktop: single row */}
                <div className="hidden sm:flex items-center gap-3 flex-1">
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0" />
                  )}
                  <Link
                    href={`/bookkeeping/${entry.id}`}
                    className="font-mono text-sm text-primary hover:underline w-16"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {entry.voucher_series}{entry.voucher_number}
                  </Link>
                  <span className="text-sm text-muted-foreground w-24">
                    {entry.entry_date}
                  </span>
                  {(entry.status === 'reversed' || entry.source_type === 'storno' || entry.source_type === 'correction') && (
                    <JournalEntryStatusBadge entry={entry} showStatus={entry.status === 'reversed'} />
                  )}
                  <span className="flex-1 truncate">{entry.description}</span>
                  {attachmentCounts[entry.id] ? (
                    <span className="flex items-center gap-0.5 text-muted-foreground mr-1" title={`${attachmentCounts[entry.id]} underlag`}>
                      <Paperclip className="h-3.5 w-3.5" />
                      <span className="text-xs">{attachmentCounts[entry.id]}</span>
                    </span>
                  ) : (
                    NEEDS_ATTACHMENT.has(entry.source_type) && entry.status === 'posted' && (
                      <span className="mr-1" title="Underlag saknas">
                        <AlertTriangle className="h-3.5 w-3.5 text-warning-foreground" />
                      </span>
                    )
                  )}
                </div>
                {/* Mobile: two rows */}
                <div className="sm:hidden">
                  <div className="flex items-center gap-2">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0" />
                    )}
                    <Link
                      href={`/bookkeeping/${entry.id}`}
                      className="font-mono text-sm text-primary hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {entry.voucher_series}{entry.voucher_number}
                    </Link>
                    <span className="text-sm text-muted-foreground">
                      {entry.entry_date}
                    </span>
                    <span className="ml-auto flex items-center gap-1">
                      {attachmentCounts[entry.id] ? (
                        <span className="flex items-center gap-0.5 text-muted-foreground" title={`${attachmentCounts[entry.id]} underlag`}>
                          <Paperclip className="h-3.5 w-3.5" />
                          <span className="text-xs">{attachmentCounts[entry.id]}</span>
                        </span>
                      ) : (
                        NEEDS_ATTACHMENT.has(entry.source_type) && entry.status === 'posted' && (
                          <span title="Underlag saknas">
                            <AlertTriangle className="h-3.5 w-3.5 text-warning-foreground" />
                          </span>
                        )
                      )}
                    </span>
                  </div>
                  <p className="mt-1 ml-6 text-sm truncate">{entry.description}</p>
                </div>
              </button>

              {isExpanded && (
                <CardContent className="pt-0 pb-4">
                  {lines.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">Inga kontorader hittades för denna verifikation.</p>
                  ) : (
                  <>
                    {/* Mobile: stacked cards */}
                    <div className="sm:hidden space-y-2">
                      {lines
                        .sort((a, b) => a.sort_order - b.sort_order)
                        .map((line) => (
                          <div key={line.id} className="flex items-center justify-between py-2 border-b last:border-0 gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="text-sm"><AccountNumber number={line.account_number} showName /></div>
                              {line.line_description && (
                                <p className="text-xs text-muted-foreground truncate">{line.line_description}</p>
                              )}
                            </div>
                            <div className="text-right shrink-0 text-sm tabular-nums">
                              {Number(line.debit_amount) > 0 && (
                                <p>{Number(line.debit_amount).toLocaleString('sv-SE', { minimumFractionDigits: 2 })} D</p>
                              )}
                              {Number(line.credit_amount) > 0 && (
                                <p>{Number(line.credit_amount).toLocaleString('sv-SE', { minimumFractionDigits: 2 })} K</p>
                              )}
                            </div>
                          </div>
                        ))}
                      <div className="flex justify-between font-semibold text-sm pt-1">
                        <span>Summa</span>
                        <div className="flex gap-3 tabular-nums">
                          <span>D: {lines.reduce((sum, l) => sum + (Number(l.debit_amount) || 0), 0).toLocaleString('sv-SE', { minimumFractionDigits: 2 })}</span>
                          <span>K: {lines.reduce((sum, l) => sum + (Number(l.credit_amount) || 0), 0).toLocaleString('sv-SE', { minimumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                    </div>

                    {/* Desktop: table */}
                    <div className="hidden sm:block">
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
                              <td className="py-2 text-right tabular-nums">
                                {Number(line.debit_amount) > 0
                                  ? Number(line.debit_amount).toLocaleString('sv-SE', {
                                      minimumFractionDigits: 2,
                                    })
                                  : ''}
                              </td>
                              <td className="py-2 text-right tabular-nums">
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
                    </div>
                  </>
                  )}

                  <JournalEntryAttachments
                    journalEntryId={entry.id}
                    onCountChange={(c) => handleAttachmentCountChange(entry.id, c)}
                  />

                  <div className="mt-4 pt-3 border-t flex gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/bookkeeping/${entry.id}`}>Visa detaljer</Link>
                    </Button>
                    {entry.status === 'posted' && entry.source_type !== 'storno' && entry.source_type !== 'correction' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCorrectionEntry(entry)}
                      >
                        Skapa ändringsverifikation
                      </Button>
                    )}
                  </div>
                </CardContent>
              )}
            </Card>
          )
        })}
      </div>

      {/* Correction dialog */}
      {correctionEntry && (
        <CorrectionEntryDialog
          entry={correctionEntry}
          open={!!correctionEntry}
          onOpenChange={(open) => { if (!open) setCorrectionEntry(null) }}
          onCorrected={() => { setCorrectionEntry(null); fetchEntries() }}
        />
      )}

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
