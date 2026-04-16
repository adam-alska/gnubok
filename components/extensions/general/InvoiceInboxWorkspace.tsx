'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
  RefreshCw,
  Check,
  X,
  Eye,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { formatCurrency, formatDate } from '@/lib/utils'
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

function confidenceBadge(confidence: number | null) {
  if (confidence === null) return null
  if (confidence >= 0.9) return <Badge variant="success">Hög</Badge>
  if (confidence >= 0.7) return <Badge variant="warning">Medium</Badge>
  return <Badge variant="destructive">Låg</Badge>
}

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

function buildInitialForm(item: InboxItem, defaultExpenseAccount?: string): ConvertForm {
  const data = item.extracted_data
  const fallbackAccount = defaultExpenseAccount || '5410'

  let formItems: ConvertFormItem[]
  if (data?.lineItems?.length) {
    formItems = data.lineItems.map((li) => ({
      description: li.description,
      amount: li.lineTotal ?? 0,
      account_number: li.accountSuggestion || fallbackAccount,
      vat_rate: li.vatRate != null ? li.vatRate / 100 : 0.25,
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

export default function InvoiceInboxWorkspace({ userId }: WorkspaceComponentProps) {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const searchParams = useSearchParams()
  const router = useRouter()

  const [items, setItems] = useState<InboxItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [isScanning, setIsScanning] = useState(false)
  const [isUploading, setIsUploading] = useState(false)

  // Gmail connection state
  const [gmailConnection, setGmailConnection] = useState<{
    email_address: string; status: string; last_sync_at: string | null
  } | null>(null)
  const [isConnectingGmail, setIsConnectingGmail] = useState(false)

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

  const fetchGmailStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/extensions/ext/invoice-inbox/gmail/status')
      if (!res.ok) return
      const { data } = await res.json()
      const active = data?.connections?.find((c: { status: string }) => c.status === 'active')
      setGmailConnection(active || null)
    } catch { /* silent */ }
  }, [])

  const handleConnectGmail = useCallback(async () => {
    setIsConnectingGmail(true)
    try {
      const res = await fetch('/api/extensions/ext/invoice-inbox/gmail/auth')
      if (!res.ok) throw new Error('Failed to get auth URL')
      const { data } = await res.json()
      window.location.href = data.authUrl
    } catch {
      toast({ title: 'Kunde inte starta Gmail-koppling', variant: 'destructive' })
      setIsConnectingGmail(false)
    }
  }, [toast])

  const handleDisconnectGmail = useCallback(async () => {
    try {
      const res = await fetch('/api/extensions/ext/invoice-inbox/gmail/disconnect', { method: 'POST' })
      if (!res.ok) throw new Error('Failed to disconnect')
      setGmailConnection(null)
      toast({ title: 'Gmail frånkopplad' })
    } catch {
      toast({ title: 'Kunde inte koppla från Gmail', variant: 'destructive' })
    }
  }, [toast])

  useEffect(() => {
    fetchItems()
    fetchGmailStatus()

    // Handle OAuth callback redirect
    const gmailParam = searchParams.get('gmail')
    const errorParam = searchParams.get('error')
    if (gmailParam === 'connected') {
      toast({ title: 'Gmail kopplad' })
      router.replace('/e/general/invoice-inbox')
    } else if (errorParam?.startsWith('gmail_')) {
      toast({ title: 'Gmail-koppling misslyckades', variant: 'destructive' })
      router.replace('/e/general/invoice-inbox')
    }
  }, [fetchItems, fetchGmailStatus, searchParams, router, toast])

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

  const handleScanGmail = useCallback(async () => {
    setIsScanning(true)
    try {
      const res = await fetch('/api/extensions/ext/invoice-inbox/gmail/scan', { method: 'POST' })
      if (!res.ok) throw new Error('Scan failed')
      const { data } = await res.json()
      toast({ title: `Gmail skannad: ${data.scanned} dokument, ${data.classified} klassificerade` })
      await fetchItems()
      await fetchGmailStatus()
    } catch {
      toast({ title: 'Gmail-skanning misslyckades', variant: 'destructive' })
    } finally {
      setIsScanning(false)
    }
  }, [fetchItems, fetchGmailStatus, toast])

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
    setConvertForm(buildInitialForm(item, matchedSupplier?.default_expense_account || undefined))
    setFormErrors({})
    setDocumentUrl(null)
    setDocumentMimeType(null)
    fetchSuppliers()

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
      items[index] = { ...items[index], [field]: value }
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
  }, [convertItem, convertForm, validateForm, toast])

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

  const readyCount = items.filter((i) => i.status === 'ready').length
  const confirmedCount = items.filter((i) => i.status === 'confirmed').length
  const errorCount = items.filter((i) => i.status === 'error').length
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
      {/* Gmail connection banner */}
      {gmailConnection ? (
        <Card>
          <CardContent className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-50 dark:bg-green-950">
                <Check className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-medium">{gmailConnection.email_address}</p>
                <p className="text-xs text-muted-foreground">
                  {gmailConnection.last_sync_at
                    ? `Senast skannad: ${timeAgo(gmailConnection.last_sync_at)}`
                    : 'Inte skannad ännu'}
                </p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={handleDisconnectGmail}>
              Koppla från
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                <Mail className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">Koppla Gmail</p>
                <p className="text-xs text-muted-foreground">Hämta leverantörsfakturor automatiskt från din e-post</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleConnectGmail} disabled={isConnectingGmail}>
              {isConnectingGmail ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
              Koppla Gmail
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Att granska</p>
            <p className="text-2xl font-semibold tabular-nums">{readyCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Konverterade</p>
            <p className="text-2xl font-semibold tabular-nums">{confirmedCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Fel</p>
            <p className="text-2xl font-semibold tabular-nums">{errorCount}</p>
          </CardContent>
        </Card>
      </div>

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
        {gmailConnection && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleScanGmail}
            disabled={isScanning}
          >
            {isScanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
            Skanna Gmail
          </Button>
        )}
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

      {/* Items table */}
      {items.length === 0 ? (
        gmailConnection ? (
          <EmptyState
            icon={Inbox}
            title="Ingen inkorg"
            description="Skanna Gmail eller ladda upp en faktura."
            actionLabel="Skanna Gmail"
            onAction={handleScanGmail}
            secondaryActionLabel="Ladda upp"
          >
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" />
              Ladda upp
            </Button>
          </EmptyState>
        ) : (
          <EmptyState
            icon={Inbox}
            title="Ingen inkorg"
            description="Koppla Gmail eller ladda upp en faktura för att komma igång."
            actionLabel="Koppla Gmail"
            onAction={handleConnectGmail}
          >
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" />
              Ladda upp
            </Button>
          </EmptyState>
        )
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Dokumenttyp</TableHead>
                  <TableHead>Leverantör</TableHead>
                  <TableHead className="text-right">Belopp</TableHead>
                  <TableHead>Konfidensgrad</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Mottagen</TableHead>
                  <TableHead className="text-right">Åtgärder</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const supplierName = extractSupplierName(item)
                  const amount = extractAmount(item)
                  const isConvertable = item.status === 'ready' && item.document_type === 'supplier_invoice'
                  const isDismissable = item.status === 'ready'

                  return (
                    <TableRow key={item.id} className={item.document_type === 'unknown' ? 'opacity-60' : ''}>
                      <TableCell>
                        {item.source === 'email' ? (
                          <Mail className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Upload className="h-4 w-4 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{DOC_TYPE_LABELS[item.document_type] || item.document_type}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{supplierName || '—'}</span>
                        {item.email_from && !supplierName && (
                          <span className="block text-xs text-muted-foreground truncate max-w-[200px]">{item.email_from}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {amount != null ? formatCurrency(amount, extractCurrency(item)) : '—'}
                      </TableCell>
                      <TableCell>{confidenceBadge(item.confidence)}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANTS[item.status] || 'outline'}>
                          {STATUS_LABELS[item.status] || item.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {timeAgo(item.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {isConvertable && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openConvertDialog(item)}
                            >
                              <Eye className="mr-1 h-3.5 w-3.5" />
                              Granska
                            </Button>
                          )}
                          {isDismissable && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleReject(item.id)}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
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
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {VAT_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                </div>
              </div>
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
