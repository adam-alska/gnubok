'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import JournalEntryList from '@/components/bookkeeping/JournalEntryList'
import JournalEntryForm, { type FormLine } from '@/components/bookkeeping/JournalEntryForm'
import ChartOfAccountsManager from '@/components/bookkeeping/ChartOfAccountsManager'
import { FiscalYearSelector } from '@/components/common/FiscalYearSelector'
import { useToast } from '@/components/ui/use-toast'
import { Lock, Loader2 } from 'lucide-react'
import type { JournalEntry, JournalEntryLine } from '@/types'

interface CopyPrefill {
  sourceId: string
  lines: FormLine[]
  description: string
  notes: string
}

function readCopyFromParam(): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get('copy_from')
}

export default function BookkeepingPage() {
  const { toast } = useToast()
  const [refreshKey, setRefreshKey] = useState(0)
  const [copyFromId] = useState<string | null>(readCopyFromParam)
  const [activeTab, setActiveTab] = useState(() =>
    copyFromId ? 'new-entry' : 'journal',
  )
  const [periodId, setPeriodId] = useState<string | null>(null)
  const [copyPrefill, setCopyPrefill] = useState<CopyPrefill | null>(null)
  const [isLoadingCopy, setIsLoadingCopy] = useState<boolean>(() => copyFromId !== null)

  useEffect(() => {
    if (!copyFromId) return

    fetch(`/api/bookkeeping/journal-entries/${copyFromId}`)
      .then((res) => res.json())
      .then(({ data, error }: { data?: JournalEntry; error?: string }) => {
        if (error || !data) {
          toast({
            title: 'Kunde inte kopiera verifikat',
            description: error || 'Källverifikatet hittades inte.',
            variant: 'destructive',
          })
          return
        }
        const sourceLines = ((data.lines || []) as JournalEntryLine[])
          .slice()
          .sort((a, b) => a.sort_order - b.sort_order)
        const lines: FormLine[] = sourceLines.map((l) => {
          const debit = Number(l.debit_amount) || 0
          const credit = Number(l.credit_amount) || 0
          return {
            account_number: l.account_number,
            debit_amount: debit > 0 ? debit.toFixed(2) : '',
            credit_amount: credit > 0 ? credit.toFixed(2) : '',
            line_description: l.line_description || '',
          }
        })
        setCopyPrefill({
          sourceId: copyFromId,
          lines,
          description: data.description || '',
          notes: data.notes || '',
        })
      })
      .catch(() => {
        toast({
          title: 'Kunde inte kopiera verifikat',
          description: 'Källverifikatet kunde inte hämtas.',
          variant: 'destructive',
        })
      })
      .finally(() => {
        setIsLoadingCopy(false)
        // Clean the URL so a page refresh doesn't re-trigger the copy prefill.
        window.history.replaceState({}, '', '/bookkeeping')
      })
  }, [copyFromId, toast])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-medium tracking-tight">Bokföring</h1>
          <p className="text-muted-foreground">
            Skapa verifikationer, hantera kontoplanen och bifoga underlag
          </p>
        </div>
        <Button variant="outline" asChild className="w-full sm:w-auto">
          <Link href="/bookkeeping/year-end">
            <Lock className="mr-2 h-4 w-4" />
            Årsbokslut
          </Link>
        </Button>
      </div>

      {activeTab === 'journal' && (
        <FiscalYearSelector value={periodId} onChange={setPeriodId} />
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="journal">Verifikationer</TabsTrigger>
          <TabsTrigger value="new-entry">Ny verifikation</TabsTrigger>
          <TabsTrigger value="accounts">Kontoplan</TabsTrigger>
        </TabsList>

        <TabsContent value="journal">
          <JournalEntryList key={`${refreshKey}-${periodId ?? 'all'}`} periodId={periodId ?? undefined} />
        </TabsContent>

        <TabsContent value="new-entry">
          {isLoadingCopy ? (
            <div className="flex items-center gap-2 py-12 justify-center text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Laddar källverifikat...</span>
            </div>
          ) : (
            <JournalEntryForm
              key={copyPrefill?.sourceId ?? 'fresh'}
              onCreated={() => {
                setRefreshKey((k) => k + 1)
                setCopyPrefill(null)
              }}
              initialLines={copyPrefill?.lines}
              initialDescription={copyPrefill?.description}
              initialNotes={copyPrefill?.notes}
            />
          )}
        </TabsContent>

        <TabsContent value="accounts">
          <ChartOfAccountsManager />
        </TabsContent>
      </Tabs>
    </div>
  )
}
