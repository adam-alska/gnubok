'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, Landmark } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { BankSelector, type Bank } from './BankSelector'
import { BankConnectionStatus } from './BankConnectionStatus'
import type { BankConnection } from '@/types'

/**
 * Self-contained banking settings panel for the enable-banking extension.
 * Loaded dynamically by the settings panel registry.
 */
export default function BankingSettingsPanel() {
  const { toast } = useToast()
  const supabase = createClient()

  const [bankConnections, setBankConnections] = useState<BankConnection[]>([])
  const [isSyncing, setIsSyncing] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedBank, setSelectedBank] = useState<Bank | null>(null)

  useEffect(() => {
    fetchConnections()
  }, [])

  async function fetchConnections() {
    setIsLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: connections } = await supabase
      .from('bank_connections')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    setBankConnections(connections || [])
    setIsLoading(false)
  }

  async function handleConnectBank(bankName: string, bankCountry: string) {
    setIsConnecting(true)

    try {
      const response = await fetch('/api/extensions/ext/enable-banking/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aspsp_name: bankName, aspsp_country: bankCountry }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error)
      }

      window.location.href = data.authorization_url
    } catch (error) {
      toast({
        title: 'Fel',
        description: error instanceof Error ? error.message : 'Kunde inte ansluta bank',
        variant: 'destructive',
      })
      setIsConnecting(false)
    }
  }

  async function handleSyncTransactions(connectionId: string) {
    setIsSyncing(true)

    try {
      const response = await fetch('/api/extensions/ext/enable-banking/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_id: connectionId }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error)
      }

      toast({
        title: 'Synkronisering klar',
        description: `${data.imported} nya transaktioner importerade`,
      })

      fetchConnections()
    } catch (error) {
      toast({
        title: 'Fel',
        description: error instanceof Error ? error.message : 'Synkronisering misslyckades',
        variant: 'destructive',
      })
    }

    setIsSyncing(false)
  }

  async function handleDisconnectBank(connectionId: string) {
    const { error } = await supabase
      .from('bank_connections')
      .update({ status: 'revoked' })
      .eq('id', connectionId)

    if (error) {
      toast({
        title: 'Fel',
        description: 'Kunde inte koppla bort bank',
        variant: 'destructive',
      })
    } else {
      toast({
        title: 'Bank bortkopplad',
        description: 'Bankanslutningen har tagits bort',
      })
      fetchConnections()
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const activeConnections = bankConnections.filter((c) => c.status === 'active')

  return (
    <div className="space-y-6">
      {/* Connected banks */}
      {activeConnections.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Anslutna banker</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {activeConnections.map((connection) => (
              <BankConnectionStatus
                key={connection.id}
                connection={connection}
                onSync={handleSyncTransactions}
                onDisconnect={handleDisconnectBank}
                isSyncing={isSyncing}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Connect new bank */}
      <Card>
        <CardHeader>
          <CardTitle>Anslut ny bank</CardTitle>
          <CardDescription>
            Välj din bank nedan för att koppla ditt konto via PSD2.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <BankSelector
            onSelect={setSelectedBank}
            isLoading={isConnecting}
          />
          {selectedBank && (
            <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/50">
              <div className="flex items-center gap-3">
                <Landmark className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-medium">{selectedBank.name}</p>
                  <p className="text-xs text-muted-foreground">{selectedBank.country}</p>
                </div>
              </div>
              <Button
                onClick={() => handleConnectBank(selectedBank.name, selectedBank.country)}
                disabled={isConnecting}
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Ansluter...
                  </>
                ) : (
                  'Anslut bank'
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info about PSD2 */}
      <Card>
        <CardHeader>
          <CardTitle>Om bankintegration (PSD2)</CardTitle>
          <CardDescription>
            Automatisk import av transaktioner via PSD2 open banking.
            Samtycket gäller i 90 dagar och behöver sedan förnyas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Vi använder säker bankintegration (PSD2). Vi kan endast läsa transaktioner,
            aldrig flytta pengar. Du kan också importera transaktioner manuellt via
            bankfiler på importsidan.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
