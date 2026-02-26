'use client'

import { useCallback, useEffect, useState } from 'react'
import type { WorkspaceComponentProps } from '@/lib/extensions/workspace-registry'
import type { InvoiceInboxItem, Supplier, DocumentClassificationType } from '@/types'
import type { InvoiceInboxSettings } from '@/extensions/general/invoice-inbox/types'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Settings, Inbox, CheckCircle2, AlertTriangle, Receipt, FileText, RefreshCw } from 'lucide-react'
import DocumentInboxCard from '@/components/extensions/general/document-inbox/DocumentInboxCard'
import ReceiptInboxDetail from '@/components/extensions/general/document-inbox/ReceiptInboxDetail'
import InboxUploadZone from '@/components/extensions/general/invoice-inbox/InboxUploadZone'
import InboxDetailDialog from '@/components/extensions/general/invoice-inbox/InboxDetailDialog'
import InboxSettingsDialog from '@/components/extensions/general/invoice-inbox/InboxSettingsDialog'

type TabValue = 'all' | DocumentClassificationType

const TABS: { value: TabValue; label: string }[] = [
  { value: 'all', label: 'Alla' },
  { value: 'supplier_invoice', label: 'Fakturor' },
  { value: 'receipt', label: 'Kvitton' },
  { value: 'government_letter', label: 'Myndighetspost' },
  { value: 'unknown', label: 'Övrigt' },
]

const DEFAULT_SETTINGS: InvoiceInboxSettings = {
  autoProcessEnabled: true,
  autoMatchSupplierEnabled: true,
  supplierMatchThreshold: 0.7,
  inboxEmail: null,
}

export default function DocumentInboxWorkspace({ userId }: WorkspaceComponentProps) {
  const [items, setItems] = useState<InvoiceInboxItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabValue>('all')
  const [selectedItem, setSelectedItem] = useState<InvoiceInboxItem | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [settings, setSettings] = useState<InvoiceInboxSettings>(DEFAULT_SETTINGS)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch('/api/extensions/ext/invoice-inbox/inbox')
      if (res.ok) {
        const { data } = await res.json()
        setItems(data ?? [])
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/extensions/ext/invoice-inbox/settings')
      if (res.ok) {
        const { data } = await res.json()
        if (data) setSettings(data)
      }
    } catch {
      // Use defaults
    }
  }, [])

  const fetchSuppliers = useCallback(async () => {
    try {
      const res = await fetch('/api/suppliers')
      if (res.ok) {
        const { data } = await res.json()
        setSuppliers(data ?? [])
      }
    } catch {
      // ok
    }
  }, [])

  useEffect(() => {
    fetchItems()
    fetchSettings()
    fetchSuppliers()
  }, [fetchItems, fetchSettings, fetchSuppliers])

  function handleUploadComplete(result: InvoiceInboxItem | InvoiceInboxItem[]) {
    const newItems = Array.isArray(result) ? result : [result]
    setItems((prev) => [...newItems, ...prev])
    for (const item of newItems) {
      pollItem(item.id)
    }
  }

  const [isMatching, setIsMatching] = useState(false)

  async function handleMatchSweep() {
    setIsMatching(true)
    try {
      const res = await fetch('/api/documents/match-sweep', { method: 'POST' })
      if (res.ok) {
        await fetchItems()
      }
    } catch {
      // Non-critical
    } finally {
      setIsMatching(false)
    }
  }

  async function pollItem(itemId: string) {
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 3000))
      try {
        const res = await fetch(`/api/extensions/ext/invoice-inbox/inbox/${itemId}`)
        if (!res.ok) continue
        const { data } = await res.json()
        if (data && data.status !== 'processing') {
          setItems((prev) =>
            prev.map((it) => (it.id === itemId ? data : it))
          )
          setSelectedItem((current) =>
            current?.id === itemId ? data : current
          )
          return
        }
      } catch {
        // continue
      }
    }
  }

  function handleItemClick(item: InvoiceInboxItem) {
    setSelectedItem(item)
  }

  async function handleConfirm(itemId: string, supplierId?: string) {
    const body: Record<string, string> = {}
    if (supplierId) body.supplier_id = supplierId

    const res = await fetch(`/api/extensions/ext/invoice-inbox/inbox/${itemId}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (res.ok) {
      setItems((prev) =>
        prev.map((it) => (it.id === itemId ? { ...it, status: 'confirmed' as const } : it))
      )
      setSelectedItem(null)
      fetchSuppliers()
    }
  }

  async function handleReject(itemId: string) {
    const res = await fetch(`/api/extensions/ext/invoice-inbox/inbox/${itemId}`, {
      method: 'DELETE',
    })

    if (res.ok) {
      setItems((prev) =>
        prev.map((it) => (it.id === itemId ? { ...it, status: 'rejected' as const } : it))
      )
      setSelectedItem(null)
    }
  }

  async function handleReprocess(itemId: string) {
    setItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, status: 'processing' as const } : it))
    )
    setSelectedItem(null)

    const res = await fetch(`/api/extensions/ext/invoice-inbox/inbox/${itemId}/process`, {
      method: 'POST',
    })

    if (res.ok) {
      const { data } = await res.json()
      if (data) {
        setItems((prev) => prev.map((it) => (it.id === itemId ? data : it)))
      }
    } else {
      fetchItems()
    }
  }

  function handleReceiptConfirm() {
    fetchItems()
    setSelectedItem(null)
  }

  async function handleSaveSettings(updated: InvoiceInboxSettings) {
    const res = await fetch('/api/extensions/ext/invoice-inbox/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    })

    if (res.ok) {
      const { data } = await res.json()
      if (data) setSettings(data)
    }
  }

  const filteredItems =
    activeTab === 'all'
      ? items
      : items.filter((it) => (it.document_type ?? 'supplier_invoice') === activeTab)

  const totalPending = items.filter((it) => it.status === 'ready' || it.status === 'pending').length
  const receiptCount = items.filter((it) => it.document_type === 'receipt' && it.status === 'ready').length
  const invoiceCount = items.filter((it) => (it.document_type ?? 'supplier_invoice') === 'supplier_invoice' && it.status === 'ready').length

  // Determine which detail dialog to show
  const isReceiptSelected = selectedItem?.document_type === 'receipt'

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dokumentinkorg"
        description="Alla inkommande dokument — fakturor, kvitton och myndighetspost"
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleMatchSweep}
              disabled={isMatching}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isMatching ? 'animate-spin' : ''}`} />
              Matcha alla
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Inbox className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-medium">{totalPending}</p>
              <p className="text-xs text-muted-foreground">Att granska</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/15">
              <FileText className="h-5 w-5 text-warning-foreground" />
            </div>
            <div>
              <p className="text-2xl font-medium">{invoiceCount}</p>
              <p className="text-xs text-muted-foreground">Fakturor att granska</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary/50">
              <Receipt className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-medium">{receiptCount}</p>
              <p className="text-xs text-muted-foreground">Kvitton att granska</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Upload zone */}
      <InboxUploadZone
        onUploadComplete={handleUploadComplete}
        isUploading={isUploading}
        setIsUploading={setIsUploading}
      />

      {/* Tabs by document type */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)}>
        <TabsList>
          {TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {TABS.map((tab) => (
          <TabsContent key={tab.value} value={tab.value}>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-xl" />
                ))}
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Inbox className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">
                  {activeTab === 'all'
                    ? 'Inga dokument ännu. Ladda upp ett dokument ovan eller skicka via e-post.'
                    : 'Inga dokument av denna typ.'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredItems.map((item) => (
                  <DocumentInboxCard
                    key={item.id}
                    item={item}
                    onClick={() => handleItemClick(item)}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* Receipt detail dialog */}
      {isReceiptSelected && (
        <ReceiptInboxDetail
          item={selectedItem}
          open={selectedItem != null && isReceiptSelected}
          onOpenChange={(open) => {
            if (!open) setSelectedItem(null)
          }}
          onConfirm={handleReceiptConfirm}
        />
      )}

      {/* Invoice/other detail dialog (existing) */}
      {!isReceiptSelected && (
        <InboxDetailDialog
          item={selectedItem}
          open={selectedItem != null && !isReceiptSelected}
          onOpenChange={(open) => {
            if (!open) setSelectedItem(null)
          }}
          onConfirm={handleConfirm}
          onReject={handleReject}
          onReprocess={handleReprocess}
          suppliers={suppliers}
        />
      )}

      {/* Settings dialog */}
      <InboxSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        onSave={handleSaveSettings}
      />
    </div>
  )
}
