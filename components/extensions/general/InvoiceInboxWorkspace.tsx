'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/components/ui/use-toast'
import {
  Inbox,
  Upload,
  Mail,
  FileText,
  Receipt as ReceiptIcon,
  RefreshCw,
  Check,
  X,
  Eye,
  Loader2,
  Plus,
  Trash2,
  Copy,
  RotateCcw,
  ArrowRight,
  Sparkles,
  Globe,
  Info,
} from 'lucide-react'
import Link from 'next/link'
import { cn, formatCurrency } from '@/lib/utils'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import type { WorkspaceComponentProps } from '@/lib/extensions/workspace-registry'
import type { InvoiceExtractionResult } from '@/types'

// ── Types ────────────────────────────────────────────────────

interface InboxItem {
  id: string
  status: string
  document_type: string
  confidence: number | null
  source: 'email' | 'upload'
  created_at: string
  extracted_data: InvoiceExtractionResult | null
  matched_supplier_id: string | null
  document_id: string | null
  email_from: string | null
  email_subject: string | null
  error_message: string | null
  resend_email_id: string | null
  matched_transaction_id: string | null
  match_confidence: number | null
  match_method: string | null
  match_reasoning: string | null
  matched_transaction: {
    id: string
    description: string | null
    amount: number
    currency: string
    date: string
  } | null
}

interface Supplier {
  id: string
  name: string
  org_number: string | null
  default_expense_account: string | null
}

interface ConvertForm {
  supplier_id: string
  supplier_invoice_number: string
  invoice_date: string
  due_date: string
  currency: string
  payment_reference: string
  notes: string
  items: ConvertFormItem[]
}

interface ConvertFormItem {
  description: string
  amount: number
  account_number: string
  vat_rate: number
  // True when the rate was inferred from the document's totals rather than
  // read off this specific line — surfaces "needs review" UI affordances.
  vat_inferred?: boolean
}

// ── Constants ────────────────────────────────────────────────

const DOC_TYPE_LABELS: Record<string, string> = {
  supplier_invoice: 'Leverantörsfaktura',
  receipt: 'Kvitto',
  government_letter: 'Myndighetsbrev',
  unknown: 'Okänt',
}

const STATUS_LABELS: Record<string, string> = {
  ready: 'Klar',
  confirmed: 'Bekräftad',
  rejected: 'Avvisad',
  error: 'Fel',
  processing: 'Bearbetar',
  pending: 'Väntar',
}

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'outline'> = {
  ready: 'secondary',
  confirmed: 'success',
  rejected: 'outline',
  error: 'destructive',
  processing: 'warning',
  pending: 'outline',
}

const VAT_OPTIONS = [
  { value: '0.25', label: '25%' },
  { value: '0.12', label: '12%' },
  { value: '0.06', label: '6%' },
  { value: '0', label: '0%' },
]

// ── Helpers ──────────────────────────────────────────────────

function extractSupplierName(item: InboxItem): string | null {
  if (item.document_type !== 'supplier_invoice' || !item.extracted_data) return null
  return item.extracted_data.supplier?.name || null
}

function extractAmount(item: InboxItem): number | null {
  if (!item.extracted_data) return null
  return item.extracted_data.totals?.total ?? null
}

function extractCurrency(item: InboxItem): string {
  const data = item.extracted_data as Record<string, unknown> | null
  if (!data) return 'SEK'
  // InvoiceExtractionResult uses invoice.currency, ReceiptExtractionResult uses receipt.currency
  const invoice = data.invoice as Record<string, unknown> | undefined
  const receipt = data.receipt as Record<string, unknown> | undefined
  return (invoice?.currency as string) || (receipt?.currency as string) || 'SEK'
}

type ConfidenceLevel = 'high' | 'medium' | 'low'

function confidenceLevel(conf: number | null): ConfidenceLevel {
  if (conf == null) return 'low'
  if (conf >= 0.85) return 'high'
  if (conf >= 0.6) return 'medium'
  return 'low'
}

function MatchBlock({ item }: { item: InboxItem }) {
  if (item.document_type !== 'receipt') return null

  const isMatching = item.match_method === null && item.status === 'ready'
  const isPending = item.match_method === 'pending_transaction'
  const isMatched = !!item.matched_transaction_id && !!item.matched_transaction

  if (isMatching) {
    return (
      <div className="mt-2.5 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>AI letar efter matchande transaktion…</span>
      </div>
    )
  }

  if (isPending) {
    return (
      <div className="mt-2.5 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
        <span>Inväntar matchande banktransaktion</span>
        {item.match_reasoning && (
          <InfoTooltip content={item.match_reasoning} side="right" maxWidth="340px" />
        )}
      </div>
    )
  }

  if (isMatched && item.matched_transaction) {
    const tx = item.matched_transaction
    const confidencePct = item.match_confidence != null ? Math.round(item.match_confidence * 100) : null
    const level = confidenceLevel(item.match_confidence)
    return (
      <div
        className={cn(
          'mt-2.5 rounded-md border px-3 py-2.5',
          level === 'high' && 'border-emerald-500/25 bg-emerald-500/5',
          level === 'medium' && 'border-amber-500/25 bg-amber-500/5',
          level === 'low' && 'border-red-500/25 bg-red-500/5'
        )}
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0 text-sm">
            <ArrowRight className={cn(
              'h-3.5 w-3.5 shrink-0',
              level === 'high' && 'text-emerald-700 dark:text-emerald-400',
              level === 'medium' && 'text-amber-700 dark:text-amber-500',
              level === 'low' && 'text-red-700 dark:text-red-400'
            )} />
            <span className="truncate font-medium">{tx.description || 'Matchad transaktion'}</span>
            <span className="text-muted-foreground">·</span>
            <span className="tabular-nums shrink-0">{formatCurrency(Math.abs(tx.amount), tx.currency)}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground whitespace-nowrap">{tx.date}</span>
          </div>
          {confidencePct != null && (
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums shrink-0',
                level === 'high' && 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
                level === 'medium' && 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
                level === 'low' && 'bg-red-500/15 text-red-700 dark:text-red-300'
              )}
            >
              <Sparkles className="h-3 w-3" />
              {confidencePct}%
            </span>
          )}
        </div>
        {item.match_reasoning && (
          <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
            {item.match_reasoning}
          </p>
        )}
      </div>
    )
  }

  return null
}

// One-line payload summary per processing_history event_type — keeps the
// timeline scannable without dumping raw JSON on the user.
function formatHistorySummary(eventType: string, payload: Record<string, unknown>): string {
  const mime = payload.mime_type as string | undefined
  const size = typeof payload.size_bytes === 'number' ? payload.size_bytes : null
  const tokensIn = typeof payload.llm_input_tokens === 'number' ? payload.llm_input_tokens : null
  const tokensOut = typeof payload.llm_output_tokens === 'number' ? payload.llm_output_tokens : null
  const conf = typeof payload.confidence === 'number' ? payload.confidence : null
  const cls = payload.classification as string | undefined
  const matched = payload.matched as boolean | undefined
  const candidates = typeof payload.candidate_count === 'number' ? payload.candidate_count : null
  const errMsg = payload.error as string | null | undefined

  switch (eventType) {
    case 'DocumentIngested':
      return `${mime || 'okänd'}${size ? ` · ${(size / 1024).toFixed(1)} kB` : ''}`
    case 'DocumentExtractionAttempted':
      if (errMsg) return `fel: ${errMsg.slice(0, 80)}`
      return [
        tokensIn != null && tokensOut != null ? `${tokensIn} + ${tokensOut} tokens` : null,
        conf != null ? `${Math.round(conf * 100)}%` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    case 'DocumentClassified':
      return [cls, conf != null ? `${Math.round(conf * 100)}%` : null].filter(Boolean).join(' · ')
    case 'MatchAttemptedDeterministic':
      return `${candidates ?? 0} kandidater`
    case 'MatchAttemptedLlm':
      return [
        matched === true ? 'matchad' : matched === false ? 'ingen match' : null,
        conf != null ? `${Math.round(conf * 100)}%` : null,
        tokensIn != null && tokensOut != null ? `${tokensIn} + ${tokensOut} tokens` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    default:
      return ''
  }
}

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just nu'
  if (minutes < 60) return `${minutes} min sedan`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} tim sedan`
  const days = Math.floor(hours / 24)
  return `${days} dag${days > 1 ? 'ar' : ''} sedan`
}

// Infer a default VAT rate (as decimal, e.g. 0.25) from the document's own
// totals and vatBreakdown so null-rate line items don't silently default to 25%.
// Rules, in order:
//   1. If vatAmount total is 0 → 0% (document has no VAT)
//   2. If vatBreakdown has exactly one entry → that rate
//   3. If all non-null line rates agree → that rate
//   4. Else → 25% fallback
// Mirror of the server-side reconciliation check in classify-document.ts so the
// UI can show the same math that drove the confidence cap. Returns null when
// there's nothing to compare against (no lines or no totals).
function computeReconciliation(data: InvoiceExtractionResult | null): {
  sumOfLines: number
  subtotal: number | null
  vatAmount: number
  total: number | null
  anchor: number
  delta: number
  tolerance: number
  reconciles: boolean
} | null {
  if (!data?.lineItems?.length) return null
  const subtotal = data.totals?.subtotal ?? null
  const total = data.totals?.total ?? null
  const vatAmount = data.totals?.vatAmount ?? 0
  if (subtotal == null && total == null) return null

  const sumOfLines = data.lineItems.reduce((acc, li) => acc + (li.lineTotal ?? 0), 0)
  const anchor = subtotal != null ? subtotal : (total ?? 0) - vatAmount
  const tolerance = Math.max(0.02, Math.abs(anchor) * 0.02)
  const delta = sumOfLines - anchor

  return {
    sumOfLines: Math.round(sumOfLines * 100) / 100,
    subtotal,
    vatAmount,
    total,
    anchor: Math.round(anchor * 100) / 100,
    delta: Math.round(delta * 100) / 100,
    tolerance: Math.round(tolerance * 100) / 100,
    reconciles: Math.abs(delta) <= tolerance,
  }
}

function inferDocumentDefaultVat(data: InvoiceExtractionResult | null): number {
  if (!data) return 0.25

  const vatAmount = data.totals?.vatAmount
  if (vatAmount === 0) return 0

  const breakdown = data.vatBreakdown ?? []
  if (breakdown.length === 1) {
    return (breakdown[0].rate ?? 25) / 100
  }

  const explicitRates = (data.lineItems ?? [])
    .map((li) => li.vatRate)
    .filter((r): r is number => r != null)

  if (explicitRates.length > 0) {
    const unique = new Set(explicitRates)
    if (unique.size === 1) {
      return explicitRates[0] / 100
    }
  }

  return 0.25
}

function buildInitialForm(item: InboxItem, defaultExpenseAccount?: string): ConvertForm {
  const data = item.extracted_data
  const fallbackAccount = defaultExpenseAccount || '5410'
  const inferredDefault = inferDocumentDefaultVat(data)

  let formItems: ConvertFormItem[]
  if (data?.lineItems?.length) {
    formItems = data.lineItems.map((li) => ({
      description: li.description,
      amount: li.lineTotal ?? 0,
      account_number: li.accountSuggestion || fallbackAccount,
      vat_rate: li.vatRate != null ? li.vatRate / 100 : inferredDefault,
      vat_inferred: li.vatRate == null,
    }))

    // If all line item amounts are 0 but we have a total, distribute evenly
    const allZero = formItems.every((item) => item.amount === 0)
    const extractedTotal = data.totals?.subtotal ?? data.totals?.total
    if (allZero && extractedTotal && extractedTotal > 0) {
      const perItem = Math.round((extractedTotal / formItems.length) * 100) / 100
      formItems.forEach((item) => { item.amount = perItem })
    }
  } else {
    formItems = [{ description: '', amount: 0, account_number: fallbackAccount, vat_rate: 0.25 }]
  }

  return {
    supplier_id: item.matched_supplier_id || '',
    supplier_invoice_number: data?.invoice?.invoiceNumber || '',
    invoice_date: data?.invoice?.invoiceDate || '',
    due_date: data?.invoice?.dueDate || '',
    currency: data?.invoice?.currency || 'SEK',
    payment_reference: data?.invoice?.paymentReference || '',
    notes: '',
    items: formItems,
  }
}

// ── Skeleton ─────────────────────────────────────────────────

function WorkspaceSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex gap-3">
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-32" />
      </div>
      <Skeleton className="h-10 w-64" />
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────

export default function InvoiceInboxWorkspace(_props: WorkspaceComponentProps) {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [items, setItems] = useState<InboxItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [isUploading, setIsUploading] = useState(false)

  // Arcim inbox state
  const [inboxAddress, setInboxAddress] = useState<{
    address: string
    local_part: string
    status: string
  } | null>(null)
  const [isRotating, setIsRotating] = useState(false)

  // Convert dialog state
  const [convertItem, setConvertItem] = useState<InboxItem | null>(null)
  const [convertForm, setConvertForm] = useState<ConvertForm | null>(null)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [isConverting, setIsConverting] = useState(false)
  const [isCreatingSupplier, setIsCreatingSupplier] = useState(false)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [documentUrl, setDocumentUrl] = useState<string | null>(null)
  const [documentMimeType, setDocumentMimeType] = useState<string | null>(null)
  const [suggestedMatch, setSuggestedMatch] = useState<{
    invoiceId: string
    transaction: { id: string; description: string; amount: number; currency: string; date: string }
  } | null>(null)
  const [isConfirmingMatch, setIsConfirmingMatch] = useState(false)

  // Exchange rate for non-SEK invoices, fetched when the convert dialog opens.
  // null = not yet fetched, undefined = SEK (rate=1 implicit), number = resolved.
  const [exchangeRate, setExchangeRate] = useState<number | null>(null)
  const [exchangeRateDate, setExchangeRateDate] = useState<string | null>(null)

  // processing_history events for the open inbox item, shown as a diagnostic
  // timeline inside the convert dialog. Empty array = fetched but no events.
  const [historyEvents, setHistoryEvents] = useState<Array<{
    event_id: string
    event_type: string
    occurred_at: string
    payload: Record<string, unknown> | null
    actor: { type?: string; id?: string } | null
  }> | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)

  // ── Data fetching ────────────────────────────────────────

  const fetchItems = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({ limit: '50' })
      if (statusFilter !== 'all') params.set('status', statusFilter)

      const res = await fetch(`/api/extensions/ext/invoice-inbox/items?${params}`)
      if (!res.ok) throw new Error('Failed to fetch items')
      const { data } = await res.json()
      setItems(data?.items || [])
    } catch {
      toast({ title: 'Kunde inte hämta inkorgen', variant: 'destructive' })
    } finally {
      setIsLoading(false)
    }
  }, [statusFilter, toast])

  const fetchInboxAddress = useCallback(async () => {
    try {
      const res = await fetch('/api/extensions/ext/invoice-inbox/inbox/address')
      if (!res.ok) {
        setInboxAddress(null)
        return
      }
      const { data } = await res.json()
      setInboxAddress(data || null)
    } catch { /* silent */ }
  }, [])

  const handleCopyAddress = useCallback(async () => {
    if (!inboxAddress?.address) return
    try {
      await navigator.clipboard.writeText(inboxAddress.address)
      toast({ title: 'Adress kopierad' })
    } catch {
      toast({ title: 'Kunde inte kopiera', variant: 'destructive' })
    }
  }, [inboxAddress, toast])

  const handleRotateAddress = useCallback(async () => {
    if (!inboxAddress) return
    const confirmed = window.confirm(
      'Den gamla adressen slutar ta emot e-post direkt. Leverantörer som använder den måste uppdateras. Vill du fortsätta?'
    )
    if (!confirmed) return

    setIsRotating(true)
    try {
      const res = await fetch('/api/extensions/ext/invoice-inbox/inbox/rotate', { method: 'POST' })
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Rotation misslyckades' }))
        throw new Error(error)
      }
      const { data } = await res.json()
      setInboxAddress(data)
      toast({ title: 'Ny adress skapad' })
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Rotation misslyckades', variant: 'destructive' })
    } finally {
      setIsRotating(false)
    }
  }, [inboxAddress, toast])

  useEffect(() => {
    fetchItems()
    fetchInboxAddress()
  }, [fetchItems, fetchInboxAddress])

  // Poll while any receipt is mid-match so the UI updates when the LLM returns
  useEffect(() => {
    const hasInFlight = items.some(
      (i) => i.document_type === 'receipt' && i.status === 'ready' && i.match_method === null
    )
    if (!hasInFlight) return
    const interval = setInterval(() => { fetchItems() }, 3000)
    return () => clearInterval(interval)
  }, [items, fetchItems])

  const fetchSuppliers = useCallback(async () => {
    try {
      const res = await fetch('/api/suppliers')
      if (!res.ok) return
      const { data } = await res.json()
      setSuppliers(data || [])
    } catch { /* silent */ }
  }, [])

  // ── Actions ──────────────────────────────────────────────

  const handleUpload = useCallback(async (file: File) => {
    setIsUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/extensions/ext/invoice-inbox/upload', {
        method: 'POST',
        body: form,
      })
      if (!res.ok) {
        const { error } = await res.json()
        throw new Error(error || 'Upload failed')
      }
      toast({ title: 'Dokument uppladdat och klassificerat' })
      await fetchItems()
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Uppladdning misslyckades', variant: 'destructive' })
    } finally {
      setIsUploading(false)
    }
  }, [fetchItems, toast])

  const handleViewDocument = useCallback(async (documentId: string) => {
    try {
      const res = await fetch(`/api/documents/${documentId}`)
      if (!res.ok) throw new Error('Kunde inte hämta dokument')
      const { data } = await res.json()
      if (data?.download_url) {
        window.open(data.download_url, '_blank', 'noopener,noreferrer')
      }
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Kunde inte öppna dokumentet', variant: 'destructive' })
    }
  }, [toast])

  const handleReject = useCallback(async (itemId: string) => {
    try {
      const res = await fetch(`/api/extensions/ext/invoice-inbox/items/${itemId}/reject`, { method: 'PATCH' })
      if (!res.ok) throw new Error('Reject failed')
      setItems((prev) => prev.map((i) => i.id === itemId ? { ...i, status: 'rejected' } : i))
      toast({ title: 'Dokument avvisat' })
    } catch {
      toast({ title: 'Kunde inte avvisa dokumentet', variant: 'destructive' })
    }
  }, [toast])

  const openConvertDialog = useCallback(async (item: InboxItem) => {
    setConvertItem(item)
    // Find matched supplier's default expense account
    const matchedSupplier = item.matched_supplier_id
      ? suppliers.find((s) => s.id === item.matched_supplier_id)
      : null
    const initialForm = buildInitialForm(item, matchedSupplier?.default_expense_account || undefined)
    setConvertForm(initialForm)
    setFormErrors({})
    setDocumentUrl(null)
    setDocumentMimeType(null)
    setExchangeRate(null)
    setExchangeRateDate(null)
    setHistoryEvents(null)
    setHistoryOpen(false)
    fetchSuppliers()

    // Fetch processing_history timeline (diagnostic panel inside dialog).
    // Runs in parallel with the preview/rate fetches below.
    void (async () => {
      try {
        const res = await fetch(`/api/extensions/ext/invoice-inbox/items/${item.id}/history`)
        if (res.ok) {
          const { data } = await res.json()
          setHistoryEvents(data?.events ?? [])
        } else {
          setHistoryEvents([])
        }
      } catch {
        setHistoryEvents([])
      }
    })()

    // Fetch document preview URL
    if (item.document_id) {
      try {
        const res = await fetch(`/api/documents/${item.document_id}`)
        if (res.ok) {
          const { data } = await res.json()
          setDocumentUrl(data.download_url)
          setDocumentMimeType(data.mime_type)
        }
      } catch { /* silent */ }
    }

    // Prefill Riksbanken exchange rate for foreign-currency invoices. The
    // supplier-invoice create handler only populates *_sek columns when
    // exchange_rate is sent, so without this the SEK-equivalent audit fields
    // stay null on foreign invoices.
    const currency = initialForm.currency
    if (currency && currency !== 'SEK' && initialForm.invoice_date) {
      try {
        const res = await fetch(
          `/api/currency/rate?currency=${encodeURIComponent(currency)}&date=${encodeURIComponent(initialForm.invoice_date)}`
        )
        if (res.ok) {
          const { data } = await res.json()
          if (data?.rate) {
            setExchangeRate(Number(data.rate))
            setExchangeRateDate(typeof data.date === 'string' ? data.date : null)
          }
        }
      } catch { /* silent — SEK conversion is a nice-to-have, not required */ }
    }
  }, [fetchSuppliers, suppliers])

  // ── Convert form handlers ────────────────────────────────

  const updateFormField = useCallback((field: keyof ConvertForm, value: string) => {
    setConvertForm((prev) => prev ? { ...prev, [field]: value } : prev)
    setFormErrors((prev) => {
      const next = { ...prev }
      delete next[field]
      return next
    })
  }, [])

  const handleCreateSupplierFromExtraction = useCallback(async () => {
    if (!convertItem?.extracted_data?.supplier?.name) return

    setIsCreatingSupplier(true)
    try {
      const extracted = convertItem.extracted_data.supplier
      const res = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: extracted.name,
          supplier_type: 'swedish_business',
          org_number: extracted.orgNumber || undefined,
          vat_number: extracted.vatNumber || undefined,
          address_line1: extracted.address || undefined,
          bankgiro: extracted.bankgiro || undefined,
          plusgiro: extracted.plusgiro || undefined,
        }),
      })

      if (!res.ok) {
        const { error } = await res.json()
        throw new Error(error || 'Failed to create supplier')
      }

      const { data: newSupplier } = await res.json()
      setSuppliers((prev) => [...prev, newSupplier])
      updateFormField('supplier_id', newSupplier.id)
      toast({ title: `Leverantör "${extracted.name}" skapad` })
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Kunde inte skapa leverantör', variant: 'destructive' })
    } finally {
      setIsCreatingSupplier(false)
    }
  }, [convertItem, updateFormField, toast])

  const updateLineItem = useCallback((index: number, field: keyof ConvertFormItem, value: string | number) => {
    setConvertForm((prev) => {
      if (!prev) return prev
      const items = [...prev.items]
      // Editing the VAT rate promotes an inferred guess to user-confirmed.
      const clearInferred = field === 'vat_rate' ? { vat_inferred: false } : {}
      items[index] = { ...items[index], [field]: value, ...clearInferred }
      return { ...prev, items }
    })
    setFormErrors((prev) => {
      const next = { ...prev }
      delete next[`items.${index}.${field}`]
      return next
    })
  }, [])

  const addLineItem = useCallback(() => {
    setConvertForm((prev) => {
      if (!prev) return prev
      return { ...prev, items: [...prev.items, { description: '', amount: 0, account_number: '', vat_rate: 0.25 }] }
    })
  }, [])

  const removeLineItem = useCallback((index: number) => {
    setConvertForm((prev) => {
      if (!prev || prev.items.length <= 1) return prev
      return { ...prev, items: prev.items.filter((_, i) => i !== index) }
    })
  }, [])

  const validateForm = useCallback((): boolean => {
    if (!convertForm) return false
    const errors: Record<string, string> = {}

    if (!convertForm.supplier_id) errors.supplier_id = 'Välj leverantör'
    if (!convertForm.supplier_invoice_number.trim()) errors.supplier_invoice_number = 'Fakturanummer krävs'
    if (!convertForm.invoice_date) errors.invoice_date = 'Fakturadatum krävs'
    if (!convertForm.due_date) errors.due_date = 'Förfallodatum krävs'

    convertForm.items.forEach((item, i) => {
      if (!item.description.trim()) errors[`items.${i}.description`] = 'Beskrivning krävs'
      if (!item.account_number || !/^\d{4}$/.test(item.account_number)) errors[`items.${i}.account_number`] = '4-siffrigt kontonummer'
      if (item.amount < 0) errors[`items.${i}.amount`] = 'Belopp kan inte vara negativt'
    })

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }, [convertForm])

  const handleConvert = useCallback(async () => {
    if (!convertItem || !convertForm) return
    if (!validateForm()) return

    setIsConverting(true)
    try {
      const payload = {
        supplier_id: convertForm.supplier_id,
        supplier_invoice_number: convertForm.supplier_invoice_number,
        invoice_date: convertForm.invoice_date,
        due_date: convertForm.due_date,
        currency: convertForm.currency || 'SEK',
        exchange_rate:
          convertForm.currency && convertForm.currency !== 'SEK' && exchangeRate
            ? exchangeRate
            : undefined,
        payment_reference: convertForm.payment_reference || undefined,
        notes: convertForm.notes || undefined,
        items: convertForm.items.map((item) => ({
          description: item.description,
          amount: item.amount,
          account_number: item.account_number,
          vat_rate: item.vat_rate,
        })),
      }

      const res = await fetch(`/api/extensions/ext/invoice-inbox/items/${convertItem.id}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const text = await res.text()
        console.error('[convert] Server error:', res.status, text)
        let msg = 'Konvertering misslyckades'
        try { msg = JSON.parse(text).error || msg } catch { /* use default */ }
        throw new Error(msg)
      }

      const { data: result } = await res.json()
      setItems((prev) => prev.map((i) => i.id === convertItem.id ? { ...i, status: 'confirmed' } : i))
      setConvertItem(null)
      setConvertForm(null)

      // If a matching transaction was found, show confirmation prompt
      if (result.suggested_transaction) {
        const tx = result.suggested_transaction
        const txAmount = formatCurrency(Math.abs(tx.amount), tx.currency)
        setSuggestedMatch({ invoiceId: result.id, transaction: tx })
        toast({ title: `Leverantörsfaktura skapad — matchande transaktion hittad (${tx.description}, ${txAmount})` })
      } else {
        toast({ title: 'Leverantörsfaktura skapad' })
      }
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Konvertering misslyckades', variant: 'destructive' })
    } finally {
      setIsConverting(false)
    }
  }, [convertItem, convertForm, validateForm, toast, exchangeRate])

  const handleConfirmMatch = useCallback(async () => {
    if (!suggestedMatch) return
    setIsConfirmingMatch(true)
    try {
      const res = await fetch(`/api/transactions/${suggestedMatch.transaction.id}/match-supplier-invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplier_invoice_id: suggestedMatch.invoiceId }),
      })
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Matchning misslyckades' }))
        throw new Error(error)
      }
      toast({ title: 'Transaktion matchad och bokförd' })
      setSuggestedMatch(null)
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Matchning misslyckades', variant: 'destructive' })
    } finally {
      setIsConfirmingMatch(false)
    }
  }, [suggestedMatch, toast])

  // ── Computed ─────────────────────────────────────────────

  // Collapse same-email rows: emails often ship both an invoice PDF and a
  // receipt PDF for the same transaction. Prefer the supplier_invoice as the
  // primary row and surface the rest as a "+N dokument" chip. Rows without a
  // resend_email_id (manual uploads, legacy rows) pass through unchanged.
  const visibleItems = (() => {
    const groups = new Map<string, InboxItem[]>()
    const standalone: InboxItem[] = []
    for (const item of items) {
      if (!item.resend_email_id) {
        standalone.push(item)
        continue
      }
      const existing = groups.get(item.resend_email_id)
      if (existing) existing.push(item)
      else groups.set(item.resend_email_id, [item])
    }

    const collapsed: Array<{ primary: InboxItem; hiddenCount: number }> = []
    for (const group of groups.values()) {
      const primary =
        group.find((g) => g.document_type === 'supplier_invoice') ??
        group.find((g) => g.document_type === 'receipt') ??
        group[0]
      collapsed.push({ primary, hiddenCount: group.length - 1 })
    }
    for (const item of standalone) {
      collapsed.push({ primary: item, hiddenCount: 0 })
    }
    // Re-sort by primary.created_at desc to preserve the original ordering.
    collapsed.sort((a, b) => b.primary.created_at.localeCompare(a.primary.created_at))
    return collapsed
  })()

  const readyCount = items.filter((i) => i.status === 'ready').length
  const confirmedCount = items.filter((i) => i.status === 'confirmed').length
  const formTotal = convertForm
    ? convertForm.items.reduce((sum, item) => {
        const vatAmount = Math.round(item.amount * item.vat_rate * 100) / 100
        return sum + item.amount + vatAmount
      }, 0)
    : 0

  // ── Render ───────────────────────────────────────────────

  if (isLoading && items.length === 0) {
    return <WorkspaceSkeleton />
  }

  return (
    <div className="space-y-6">
      {/* Arcim inbox address */}
      {inboxAddress && (
        <Card>
          <CardContent className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted shrink-0">
                <Mail className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Din fakturainkorg</p>
                <p className="text-sm font-medium font-mono truncate">{inboxAddress.address}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button variant="ghost" size="sm" onClick={handleCopyAddress}>
                <Copy className="mr-2 h-3.5 w-3.5" />
                Kopiera
              </Button>
              <Button variant="ghost" size="sm" onClick={handleRotateAddress} disabled={isRotating}>
                {isRotating ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="mr-2 h-3.5 w-3.5" />}
                Rotera
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action bar */}
      <div className="flex items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleUpload(file)
            e.target.value = ''
          }}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
        >
          {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
          Ladda upp
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchItems}
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Filter tabs */}
      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList>
          <TabsTrigger value="all">Alla ({items.length})</TabsTrigger>
          <TabsTrigger value="ready">Redo ({readyCount})</TabsTrigger>
          <TabsTrigger value="confirmed">Bekräftade ({confirmedCount})</TabsTrigger>
          <TabsTrigger value="rejected">Avvisade</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Items list */}
      {items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Ingen inkorg"
          description={
            inboxAddress
              ? `Skicka fakturor till ${inboxAddress.address} eller ladda upp manuellt.`
              : 'Ladda upp en faktura för att komma igång.'
          }
          actionLabel="Ladda upp"
          onAction={() => fileInputRef.current?.click()}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card divide-y divide-border/60">
          {visibleItems.map(({ primary: item, hiddenCount }) => {
            const supplierName = extractSupplierName(item)
            const amount = extractAmount(item)
            const currency = extractCurrency(item)
            const isReceipt = item.document_type === 'receipt'
            const isConvertable = item.status === 'ready' && item.document_type === 'supplier_invoice'
            const primaryLabel = supplierName
              || item.email_from?.replace(/<.+?>$/, '').replace(/"/g, '').trim()
              || '—'

            return (
              <div
                key={item.id}
                className={cn(
                  'flex gap-4 px-4 py-3.5 transition-colors',
                  item.document_type === 'unknown' && 'opacity-60',
                  item.status === 'rejected' && 'opacity-50'
                )}
              >
                {/* Document icon */}
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted/60 shrink-0 mt-0.5">
                  {isReceipt ? (
                    <ReceiptIcon className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  {/* Header row */}
                  <div className="flex items-baseline justify-between gap-3 flex-wrap">
                    <div className="flex items-baseline gap-2 min-w-0">
                      <span className="text-sm font-medium">
                        {DOC_TYPE_LABELS[item.document_type] || item.document_type}
                      </span>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-sm truncate min-w-0">{primaryLabel}</span>
                      {item.source === 'email' && (
                        <Mail className="h-3 w-3 text-muted-foreground shrink-0" aria-label="Från e-post" />
                      )}
                      {hiddenCount > 0 && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full bg-muted/80 px-2 py-0.5 text-[10px] font-medium text-muted-foreground shrink-0"
                          title="Fler bilagor från samma e-post"
                        >
                          +{hiddenCount} dokument
                        </span>
                      )}
                    </div>
                    <div className="flex items-baseline gap-2 shrink-0">
                      {amount != null && (
                        <span className="text-sm font-medium tabular-nums">
                          {formatCurrency(amount, currency)}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                        {timeAgo(item.created_at)}
                      </span>
                    </div>
                  </div>

                  {/* Status chip line — only non-default states */}
                  {(item.status === 'confirmed' || item.status === 'rejected' || item.status === 'error') && (
                    <div className="mt-1.5">
                      <Badge variant={STATUS_VARIANTS[item.status] || 'outline'}>
                        {STATUS_LABELS[item.status] || item.status}
                      </Badge>
                      {item.error_message && (
                        <span className="ml-2 text-xs text-muted-foreground">{item.error_message}</span>
                      )}
                    </div>
                  )}

                  {/* Match block (receipts only) */}
                  <MatchBlock item={item} />

                  {/* Actions */}
                  {item.status === 'ready' && (
                    <div className="mt-3 flex items-center justify-end gap-1">
                      {isConvertable ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openConvertDialog(item)}
                        >
                          Granska
                        </Button>
                      ) : (
                        item.document_id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewDocument(item.document_id!)}
                          >
                            <Eye className="mr-1.5 h-3.5 w-3.5" />
                            Visa kvitto
                          </Button>
                        )
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleReject(item.id)}
                        aria-label="Avvisa"
                        title="Avvisa"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Convert dialog */}
      <Dialog open={!!convertItem} onOpenChange={(open) => { if (!open) { setConvertItem(null); setConvertForm(null); setDocumentUrl(null) } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Konvertera till leverantörsfaktura</DialogTitle>
          </DialogHeader>

          {convertForm && convertItem && (
            <div className="space-y-6 py-2">
              {/* Document preview */}
              {documentUrl && (
                <div className="rounded-lg border overflow-hidden">
                  {documentMimeType?.startsWith('image/') ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={documentUrl} alt="Dokument" className="w-full max-h-72 object-contain bg-muted" />
                  ) : (
                    <a
                      href={documentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-4 text-sm hover:bg-muted/50 transition-colors"
                    >
                      <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                      <span>Visa originaldokument</span>
                    </a>
                  )}
                </div>
              )}

              {/* Extracted supplier context */}
              {convertItem.extracted_data?.supplier?.name && (
                <div className="rounded-md bg-muted/50 p-3 text-sm">
                  <span className="text-muted-foreground">AI extraherade: </span>
                  <span className="font-medium">{convertItem.extracted_data.supplier.name}</span>
                  {convertItem.extracted_data.supplier.orgNumber && (
                    <span className="text-muted-foreground"> ({convertItem.extracted_data.supplier.orgNumber})</span>
                  )}
                </div>
              )}

              {/* Low-confidence reconciliation hint — surfaces the math that drove the 50% cap */}
              {convertItem.confidence != null && convertItem.confidence <= 0.5 && (() => {
                const recon = computeReconciliation(convertItem.extracted_data)
                if (recon && !recon.reconciles) {
                  const currency = convertForm.currency || 'SEK'
                  return (
                    <div className="flex items-start gap-2.5 rounded-md border border-amber-500/25 bg-amber-500/5 p-3">
                      <Info className="h-4 w-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div className="space-y-1.5 text-xs">
                        <p className="font-medium text-amber-900 dark:text-amber-200">
                          AI är osäker — summan av raderna stämmer inte med totalen
                        </p>
                        <div className="space-y-0.5 text-amber-900/80 dark:text-amber-200/80 tabular-nums leading-relaxed">
                          <p>
                            Summa rader: <span className="font-medium">{formatCurrency(recon.sumOfLines, currency)}</span>
                          </p>
                          <p>
                            Dokumentets nettosumma: <span className="font-medium">{formatCurrency(recon.anchor, currency)}</span>
                          </p>
                          <p>
                            Differens: <span className="font-medium">{formatCurrency(recon.delta, currency)}</span>
                            {' '}(tillåten avvikelse {formatCurrency(recon.tolerance, currency)})
                          </p>
                        </div>
                        <p className="text-amber-900/80 dark:text-amber-200/80 leading-relaxed pt-0.5">
                          En rad kan saknas, dubblerats, eller haft fel tecken på rabatten. Kontrollera raderna nedan.
                        </p>
                      </div>
                    </div>
                  )
                }
                return (
                  <div className="flex items-start gap-2.5 rounded-md border border-amber-500/25 bg-amber-500/5 p-3 text-xs">
                    <Info className="h-4 w-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-amber-900 dark:text-amber-200 leading-relaxed">
                      AI är osäker på extraktionen ({Math.round(convertItem.confidence! * 100)}%). Gå igenom fälten innan du bokför.
                    </p>
                  </div>
                )
              })()}

              {/* Foreign-supplier hint — informational only, never auto-overrides VAT */}
              {convertForm.currency && convertForm.currency !== 'SEK' && (
                <div className="flex items-start gap-2.5 rounded-md border border-blue-500/20 bg-blue-500/5 p-3 text-sm">
                  <Globe className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                  <div className="space-y-1 text-xs">
                    <p className="font-medium text-blue-900 dark:text-blue-200">
                      Utländsk leverantör ({convertForm.currency}
                      {convertItem.extracted_data?.supplier?.address ? ` · ${convertItem.extracted_data.supplier.address}` : ''})
                    </p>
                    <p className="text-blue-900/80 dark:text-blue-200/80 leading-relaxed">
                      Kontrollera momsbehandlingen: använd den sats fakturan anger (t.ex. 25% om leverantören är OSS-registrerad),
                      0% vid export, eller omvänd skattskyldighet för EU-tjänster. Bokföringen ändrar inte det AI läste.
                    </p>
                  </div>
                </div>
              )}

              {/* Supplier selector */}
              <div className="space-y-2">
                <Label>Leverantör *</Label>
                <Select value={convertForm.supplier_id} onValueChange={(v) => updateFormField('supplier_id', v)}>
                  <SelectTrigger className={formErrors.supplier_id ? 'border-destructive' : ''}>
                    <SelectValue placeholder="Välj leverantör" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}{s.org_number ? ` (${s.org_number})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formErrors.supplier_id && <p className="text-xs text-destructive">{formErrors.supplier_id}</p>}
                {!convertForm.supplier_id && convertItem.extracted_data?.supplier?.name ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCreateSupplierFromExtraction}
                    disabled={isCreatingSupplier}
                  >
                    {isCreatingSupplier ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-2 h-3.5 w-3.5" />}
                    Skapa &ldquo;{convertItem.extracted_data.supplier.name}&rdquo;
                  </Button>
                ) : (
                  <Link href="/suppliers/new" className="text-xs text-muted-foreground hover:underline">
                    Skapa ny leverantör
                  </Link>
                )}
              </div>

              {/* Invoice header fields */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Fakturanummer *</Label>
                  <Input
                    value={convertForm.supplier_invoice_number}
                    onChange={(e) => updateFormField('supplier_invoice_number', e.target.value)}
                    className={formErrors.supplier_invoice_number ? 'border-destructive' : ''}
                  />
                  {formErrors.supplier_invoice_number && <p className="text-xs text-destructive">{formErrors.supplier_invoice_number}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Betalningsreferens</Label>
                  <Input
                    value={convertForm.payment_reference}
                    onChange={(e) => updateFormField('payment_reference', e.target.value)}
                    placeholder="OCR / referens"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Fakturadatum *</Label>
                  <Input
                    type="date"
                    value={convertForm.invoice_date}
                    onChange={(e) => updateFormField('invoice_date', e.target.value)}
                    className={formErrors.invoice_date ? 'border-destructive' : ''}
                  />
                  {formErrors.invoice_date && <p className="text-xs text-destructive">{formErrors.invoice_date}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Förfallodatum *</Label>
                  <Input
                    type="date"
                    value={convertForm.due_date}
                    onChange={(e) => updateFormField('due_date', e.target.value)}
                    className={formErrors.due_date ? 'border-destructive' : ''}
                  />
                  {formErrors.due_date && <p className="text-xs text-destructive">{formErrors.due_date}</p>}
                </div>
              </div>

              {/* Line items */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Rader *</Label>
                  <Button variant="ghost" size="sm" onClick={addLineItem}>
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Lägg till rad
                  </Button>
                </div>

                {convertForm.items.map((lineItem, index) => (
                  <div key={index} className="grid grid-cols-12 gap-2 items-start">
                    <div className="col-span-4 space-y-1">
                      {index === 0 && <Label className="text-xs text-muted-foreground">Beskrivning</Label>}
                      <Input
                        value={lineItem.description}
                        onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                        placeholder="Beskrivning"
                        className={formErrors[`items.${index}.description`] ? 'border-destructive' : ''}
                      />
                      {formErrors[`items.${index}.description`] && <p className="text-xs text-destructive">{formErrors[`items.${index}.description`]}</p>}
                    </div>
                    <div className="col-span-2 space-y-1">
                      {index === 0 && <Label className="text-xs text-muted-foreground">Belopp</Label>}
                      <Input
                        key={`amt-${index}-${convertItem?.id}`}
                        type="number"
                        step="0.01"
                        defaultValue={lineItem.amount || ''}
                        onChange={(e) => updateLineItem(index, 'amount', e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                        className={`tabular-nums ${formErrors[`items.${index}.amount`] ? 'border-destructive' : ''}`}
                      />
                      {formErrors[`items.${index}.amount`] && <p className="text-xs text-destructive">{formErrors[`items.${index}.amount`]}</p>}
                    </div>
                    <div className="col-span-2 space-y-1">
                      {index === 0 && <Label className="text-xs text-muted-foreground">Konto</Label>}
                      <Input
                        value={lineItem.account_number}
                        onChange={(e) => updateLineItem(index, 'account_number', e.target.value.replace(/\D/g, '').slice(0, 4))}
                        placeholder="5410"
                        maxLength={4}
                        className={`font-mono tabular-nums ${formErrors[`items.${index}.account_number`] ? 'border-destructive' : ''}`}
                      />
                      {formErrors[`items.${index}.account_number`] && <p className="text-xs text-destructive">{formErrors[`items.${index}.account_number`]}</p>}
                    </div>
                    <div className="col-span-3 space-y-1">
                      {index === 0 && <Label className="text-xs text-muted-foreground">Moms</Label>}
                      <Select
                        value={String(lineItem.vat_rate)}
                        onValueChange={(v) => updateLineItem(index, 'vat_rate', parseFloat(v))}
                      >
                        <SelectTrigger
                          className={lineItem.vat_inferred ? 'border-amber-500/40 bg-amber-500/5' : ''}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {VAT_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {lineItem.vat_inferred && (
                        <p className="text-[10px] text-amber-700 dark:text-amber-400 leading-tight">Uppskattad — kontrollera</p>
                      )}
                    </div>
                    <div className="col-span-1 space-y-1">
                      {index === 0 && <Label className="text-xs text-muted-foreground">&nbsp;</Label>}
                      {convertForm.items.length > 1 && (
                        <Button variant="ghost" size="sm" className="h-9 w-9 p-0" onClick={() => removeLineItem(index)}>
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="flex justify-end">
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Totalt inkl. moms</p>
                  <p className="text-lg font-semibold tabular-nums">{formatCurrency(formTotal, convertForm.currency)}</p>
                  {convertForm.currency && convertForm.currency !== 'SEK' && exchangeRate && (
                    <p className="text-xs text-muted-foreground tabular-nums mt-0.5">
                      ≈ {formatCurrency(Math.round(formTotal * exchangeRate * 100) / 100, 'SEK')}
                      <span className="ml-1 opacity-70">
                        ({exchangeRate.toFixed(4)}
                        {exchangeRateDate ? ` · ${exchangeRateDate}` : ''})
                      </span>
                    </p>
                  )}
                </div>
              </div>

              {/* Processing history timeline (behandlingshistorik) */}
              {historyEvents && historyEvents.length > 0 && (
                <div className="border-t pt-3">
                  <button
                    type="button"
                    onClick={() => setHistoryOpen((v) => !v)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Sparkles className="h-3 w-3" />
                    <span>Behandlingshistorik ({historyEvents.length})</span>
                    <span className="ml-1">{historyOpen ? '▾' : '▸'}</span>
                  </button>
                  {historyOpen && (
                    <ul className="mt-2 space-y-1 text-xs font-mono">
                      {historyEvents.map((evt, i) => {
                        const prev = i > 0 ? historyEvents[i - 1] : null
                        const delta = prev
                          ? Math.round(
                              (new Date(evt.occurred_at).getTime() -
                                new Date(prev.occurred_at).getTime()) /
                                10
                            ) / 100
                          : 0
                        const payload = evt.payload ?? {}
                        const summary = formatHistorySummary(evt.event_type, payload)
                        return (
                          <li key={evt.event_id} className="flex items-baseline gap-2 text-muted-foreground">
                            <span className="tabular-nums opacity-60 w-14 shrink-0">
                              {i === 0 ? 'start' : `+${delta.toFixed(2)}s`}
                            </span>
                            <span className="text-foreground shrink-0 font-medium">{evt.event_type}</span>
                            {summary && <span className="truncate">{summary}</span>}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setConvertItem(null); setConvertForm(null) }}>
              Avbryt
            </Button>
            <Button type="button" disabled={isConverting} onClick={handleConvert}>
              {isConverting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
              Skapa leverantörsfaktura
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Match confirmation dialog */}
      <Dialog open={!!suggestedMatch} onOpenChange={(open) => { if (!open) setSuggestedMatch(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Matchande transaktion hittad</DialogTitle>
          </DialogHeader>
          {suggestedMatch && (
            <div className="space-y-4 py-2">
              <div className="rounded-md border p-4 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-medium">{suggestedMatch.transaction.description}</span>
                  <span className="font-mono tabular-nums font-medium">
                    {formatCurrency(Math.abs(suggestedMatch.transaction.amount), suggestedMatch.transaction.currency)}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{suggestedMatch.transaction.date}</p>
              </div>
              <p className="text-sm text-muted-foreground">
                Vill du matcha denna transaktion med leverantörsfakturan? En betalningsverifikation bokförs automatiskt.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuggestedMatch(null)}>
              Hoppa över
            </Button>
            <Button type="button" onClick={handleConfirmMatch} disabled={isConfirmingMatch}>
              {isConfirmingMatch ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
              Bekräfta matchning
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
