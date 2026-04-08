'use client'

import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { AlertTriangle, CheckCircle2, CreditCard, ExternalLink, Loader2 } from 'lucide-react'
import { getSettingsPanel } from '@/lib/extensions/settings-panel-registry'
import { ENABLED_EXTENSION_IDS } from '@/lib/extensions/_generated/enabled-extensions'

const BankingPanel = getSettingsPanel('enable-banking')

export default function BankingSettingsPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { toast } = useToast()
  const [bankConnectionError, setBankConnectionError] = useState<string | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ imported: number } | null>(null)
  const successTimerRef = useRef<ReturnType<typeof setTimeout>>(null)
  const hasBankingExtension = ENABLED_EXTENSION_IDS.has('enable-banking')

  useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current)
    }
  }, [])

  useEffect(() => {
    const bankConnected = searchParams.get('bank_connected')
    const bankError = searchParams.get('bank_error')

    if (bankConnected === 'true' && !isSyncing) {
      const connectionId = searchParams.get('connection_id')
      router.replace('/settings/banking')

      if (connectionId) {
        setIsSyncing(true)
        ;(async () => {
          try {
            const res = await fetch('/api/extensions/ext/enable-banking/sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ connection_id: connectionId, days_back: 120 }),
            })
            const data = await res.json()
            if (res.ok) {
              setSyncResult({ imported: data.imported ?? 0 })
              successTimerRef.current = setTimeout(() => {
                setIsSyncing(false)
                setSyncResult(null)
              }, 3000)
            } else {
              throw new Error(data.error || 'Sync failed')
            }
          } catch (err) {
            toast({
              title: 'Synkronisering misslyckades',
              description: err instanceof Error ? err.message : 'Kunde inte hämta transaktioner',
              variant: 'destructive',
            })
            setIsSyncing(false)
          }
        })()
      } else {
        toast({
          title: 'Bank ansluten!',
          description: 'Din bank är nu kopplad.',
        })
      }
    }

    if (bankError) {
      const errorMsg = decodeURIComponent(bankError)
      toast({
        title: 'Anslutning misslyckades',
        description: errorMsg,
        variant: 'destructive',
      })
      setBankConnectionError(errorMsg)
      router.replace('/settings/banking')
    }
  }, [searchParams, router, toast, isSyncing])

  if (isSyncing) {
    return (
      <div className="space-y-6">
        <Card className="mx-auto max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            {syncResult ? (
              <>
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                  <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <p className="font-medium text-lg">Bank ansluten!</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {syncResult.imported} transaktioner importerade
                </p>
              </>
            ) : (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
                <p className="font-medium">Hämtar transaktioner från din bank...</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Detta kan ta upp till en minut
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {bankConnectionError && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="flex-1">
            <p className="text-sm font-medium text-destructive">{bankConnectionError}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Du kan också <Link href="/import?mode=bank" className="underline hover:text-foreground">importera transaktioner via bankfil</Link> istället.
            </p>
          </div>
          <button
            onClick={() => setBankConnectionError(null)}
            className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground"
            aria-label="Stäng"
          >
            <span className="text-lg leading-none">&times;</span>
          </button>
        </div>
      )}

      {hasBankingExtension && BankingPanel ? (
        <BankingPanel />
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <CreditCard className="h-10 w-10 text-muted-foreground/40 mb-4" />
            <p className="font-medium mb-1">Bankintegration (PSD2) är inte aktiverad</p>
            <p className="text-sm text-muted-foreground mb-4 max-w-md">
              Aktivera tillägget Enable Banking för att koppla ditt bankkonto och automatiskt hämta transaktioner.
            </p>
            <Button variant="outline" asChild>
              <Link href="/extensions">
                <ExternalLink className="mr-2 h-4 w-4" />
                Gå till Tillägg
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
