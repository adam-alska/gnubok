'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/components/ui/use-toast'
import { formatDate } from '@/lib/utils'
import {
  Loader2,
  Building,
  CreditCard,
  User,
  AlertTriangle,
  RefreshCw,
  Trash2,
  LogOut,
  Bell,
  Calendar,
} from 'lucide-react'
import type { CompanySettings, BankConnection } from '@/types'
import { NotificationSettings } from '@/extensions/push-notifications/NotificationSettings'
import { CalendarFeedSettings } from '@/components/settings/CalendarFeedSettings'

export default function SettingsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const supabase = createClient()

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [settings, setSettings] = useState<CompanySettings | null>(null)
  const [bankConnections, setBankConnections] = useState<BankConnection[]>([])
  const [isSyncing, setIsSyncing] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [hasBankingExtension, setHasBankingExtension] = useState(false)

  useEffect(() => {
    fetchData()

    // Handle callback messages
    const bankConnected = searchParams.get('bank_connected')
    const bankError = searchParams.get('bank_error')

    if (bankConnected === 'true') {
      toast({
        title: 'Bank ansluten!',
        description: 'Din bank är nu kopplad och transaktioner kan hämtas.',
      })
      router.replace('/settings')
    }

    if (bankError) {
      toast({
        title: 'Anslutning misslyckades',
        description: decodeURIComponent(bankError),
        variant: 'destructive',
      })
      router.replace('/settings')
    }
  }, [searchParams])

  async function fetchData() {
    setIsLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    // Fetch settings
    const { data: settingsData } = await supabase
      .from('company_settings')
      .select('*')
      .eq('user_id', user.id)
      .single()

    setSettings(settingsData)

    // Check if Enable Banking extension is active by testing for bank connections
    // If there are active connections, show the banking tab
    const { data: connections } = await supabase
      .from('bank_connections')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    setBankConnections(connections || [])

    // Check if extension API is available (will return banks list if extension is loaded)
    try {
      const bankingCheck = await fetch('/api/extensions/enable-banking/callback', {
        method: 'HEAD',
      })
      // The extension route existing means it's deployed - but we also need
      // to check if there are existing connections to show the tab
      setHasBankingExtension(
        (connections && connections.length > 0) || bankingCheck.status !== 404
      )
    } catch {
      // If the extension routes don't exist, only show tab if there are existing connections
      setHasBankingExtension((connections && connections.length > 0) || false)
    }

    setIsLoading(false)
  }

  async function handleSaveSettings(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!settings) return

    setIsSaving(true)

    const formData = new FormData(e.currentTarget)

    const updates: Record<string, unknown> = {
      company_name: formData.get('company_name') as string,
      org_number: formData.get('org_number') as string,
      address_line1: formData.get('address_line1') as string,
      postal_code: formData.get('postal_code') as string,
      city: formData.get('city') as string,
      bank_name: formData.get('bank_name') as string,
      clearing_number: formData.get('clearing_number') as string,
      account_number: formData.get('account_number') as string,
      preliminary_tax_monthly: parseFloat(formData.get('preliminary_tax_monthly') as string) || null,
      invoice_prefix: formData.get('invoice_prefix') as string || null,
      next_invoice_number: parseInt(formData.get('next_invoice_number') as string) || 1,
      invoice_default_days: parseInt(formData.get('invoice_default_days') as string) || 30,
      accounting_method: formData.get('accounting_method') as string || 'accrual',
    }

    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Kunde inte spara inställningar')
      }

      toast({
        title: 'Sparat',
        description: 'Dina inställningar har uppdaterats',
      })
      setSettings({ ...settings, ...updates } as typeof settings)
    } catch (error) {
      toast({
        title: 'Fel',
        description: error instanceof Error ? error.message : 'Kunde inte spara inställningar',
        variant: 'destructive',
      })
    }

    setIsSaving(false)
  }

  async function handleConnectBank(bankName: string, bankCountry: string) {
    setIsConnecting(true)

    try {
      const response = await fetch('/api/extensions/enable-banking/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aspsp_name: bankName, aspsp_country: bankCountry }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error)
      }

      // Redirect to bank authorization
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
      const response = await fetch('/api/extensions/enable-banking/sync/cron', {
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

      fetchData()
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
      fetchData()
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const activeConnections = bankConnections.filter((c) => c.status === 'active')

  // Helper to calculate days until consent expires
  function getDaysUntilExpiry(expiresAt: string | null): number | null {
    if (!expiresAt) return null
    const expiryDate = new Date(expiresAt)
    const now = new Date()
    const diffTime = expiryDate.getTime() - now.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return Math.max(0, diffDays)
  }

  function isConsentExpiringSoon(expiresAt: string | null): boolean {
    if (!expiresAt) return false
    const expiryDate = new Date(expiresAt)
    const warningDate = new Date()
    warningDate.setDate(warningDate.getDate() + 7)
    return expiryDate <= warningDate
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Inställningar</h1>
        <p className="text-muted-foreground">
          Hantera dina företags- och kontoinställningar
        </p>
      </div>

      <Tabs defaultValue="company" className="space-y-6">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="company">
            <Building className="mr-2 h-4 w-4" />
            Företag
          </TabsTrigger>
          {hasBankingExtension && (
            <TabsTrigger value="banking">
              <CreditCard className="mr-2 h-4 w-4" />
              Bank (PSD2)
            </TabsTrigger>
          )}
          <TabsTrigger value="notifications">
            <Bell className="mr-2 h-4 w-4" />
            Aviseringar
          </TabsTrigger>
          <TabsTrigger value="calendar">
            <Calendar className="mr-2 h-4 w-4" />
            Kalender
          </TabsTrigger>
          <TabsTrigger value="account">
            <User className="mr-2 h-4 w-4" />
            Konto
          </TabsTrigger>
        </TabsList>

        {/* Company settings */}
        <TabsContent value="company">
          <form onSubmit={handleSaveSettings} className="space-y-6">
            {/* Företagsuppgifter */}
            <Card>
              <CardHeader>
                <CardTitle>Företagsuppgifter</CardTitle>
                <CardDescription>
                  Namn, organisationsnummer och adress
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="company_name">Företagsnamn</Label>
                    <Input
                      id="company_name"
                      name="company_name"
                      defaultValue={settings?.company_name || ''}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="org_number">Organisationsnummer</Label>
                    <Input
                      id="org_number"
                      name="org_number"
                      defaultValue={settings?.org_number || ''}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address_line1">Adress</Label>
                  <Input
                    id="address_line1"
                    name="address_line1"
                    defaultValue={settings?.address_line1 || ''}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="postal_code">Postnummer</Label>
                    <Input
                      id="postal_code"
                      name="postal_code"
                      defaultValue={settings?.postal_code || ''}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="city">Ort</Label>
                    <Input
                      id="city"
                      name="city"
                      defaultValue={settings?.city || ''}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Bankuppgifter */}
            <Card>
              <CardHeader>
                <CardTitle>Bankuppgifter</CardTitle>
                <CardDescription>
                  Betalningsuppgifter som visas på dina fakturor
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="bank_name">Bank</Label>
                    <Input
                      id="bank_name"
                      name="bank_name"
                      defaultValue={settings?.bank_name || ''}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="clearing_number">Clearing</Label>
                    <Input
                      id="clearing_number"
                      name="clearing_number"
                      defaultValue={settings?.clearing_number || ''}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="account_number">Kontonummer</Label>
                    <Input
                      id="account_number"
                      name="account_number"
                      defaultValue={settings?.account_number || ''}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Fakturainställningar */}
            <Card>
              <CardHeader>
                <CardTitle>Fakturainställningar</CardTitle>
                <CardDescription>
                  Numrering, betalningsvillkor och bokföringsmetod
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="invoice_prefix">Fakturaprefix</Label>
                    <Input
                      id="invoice_prefix"
                      name="invoice_prefix"
                      placeholder="t.ex. F-"
                      defaultValue={settings?.invoice_prefix || ''}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="next_invoice_number">Nästa fakturanummer</Label>
                    <Input
                      id="next_invoice_number"
                      name="next_invoice_number"
                      type="number"
                      min="1"
                      defaultValue={settings?.next_invoice_number || 1}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="invoice_default_days">Betalningsvillkor (dagar)</Label>
                    <Input
                      id="invoice_default_days"
                      name="invoice_default_days"
                      type="number"
                      min="0"
                      defaultValue={settings?.invoice_default_days || 30}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="accounting_method">Bokföringsmetod</Label>
                  {settings?.entity_type === 'aktiebolag' ? (
                    <>
                      <input type="hidden" name="accounting_method" value="accrual" />
                      <div className="flex items-center gap-2">
                        <Input
                          value="Faktureringsmetoden"
                          disabled
                          className="max-w-xs"
                        />
                        <span className="text-sm text-muted-foreground">
                          Obligatorisk för aktiebolag
                        </span>
                      </div>
                    </>
                  ) : (
                    <select
                      id="accounting_method"
                      name="accounting_method"
                      defaultValue={settings?.accounting_method || 'accrual'}
                      className="flex h-10 w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <option value="accrual">Faktureringsmetoden</option>
                      <option value="cash">Kontantmetoden</option>
                    </select>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {settings?.entity_type === 'aktiebolag'
                      ? 'Aktiebolag måste använda faktureringsmetoden enligt BFL.'
                      : 'Kontantmetoden är tillgänglig för enskild firma med omsättning under 3 MSEK.'}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Skatteinställningar */}
            <Card>
              <CardHeader>
                <CardTitle>Skatteinställningar</CardTitle>
                <CardDescription>
                  Preliminärskatt och F-skatt
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label htmlFor="preliminary_tax_monthly">
                    Månatlig preliminärskatt (F-skatt)
                  </Label>
                  <Input
                    id="preliminary_tax_monthly"
                    name="preliminary_tax_monthly"
                    type="number"
                    defaultValue={settings?.preliminary_tax_monthly || ''}
                  />
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button type="submit" disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sparar...
                  </>
                ) : (
                  'Spara ändringar'
                )}
              </Button>
            </div>
          </form>
        </TabsContent>

        {/* Banking settings (only shown when extension is active or connections exist) */}
        {hasBankingExtension && (
          <TabsContent value="banking" className="space-y-6">
            {/* Connected banks */}
            {activeConnections.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Anslutna banker</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {activeConnections.map((connection) => {
                    const daysUntilExpiry = getDaysUntilExpiry(connection.consent_expires)
                    const isExpiring = isConsentExpiringSoon(connection.consent_expires)

                    return (
                      <div
                        key={connection.id}
                        className="flex items-center justify-between p-4 border rounded-lg"
                      >
                        <div className="flex items-center gap-4">
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <CreditCard className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{connection.bank_name}</p>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <span>
                                Senast synkad: {formatDate(connection.last_synced_at || connection.created_at)}
                              </span>
                              {isExpiring && (
                                <Badge variant="warning" className="flex items-center gap-1">
                                  <AlertTriangle className="h-3 w-3" />
                                  {daysUntilExpiry} dagar kvar
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSyncTransactions(connection.id)}
                            disabled={isSyncing}
                          >
                            {isSyncing ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RefreshCw className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDisconnectBank(connection.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
            )}

            {/* Info about PSD2 */}
            <Card>
              <CardHeader>
                <CardTitle>Bankintegration (PSD2)</CardTitle>
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
          </TabsContent>
        )}

        {/* Notification settings */}
        <TabsContent value="notifications">
          <NotificationSettings />
        </TabsContent>

        {/* Calendar feed settings */}
        <TabsContent value="calendar">
          <CalendarFeedSettings />
        </TabsContent>

        {/* Account settings */}
        <TabsContent value="account">
          <Card>
            <CardHeader>
              <CardTitle>Kontoinställningar</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="font-medium">Logga ut</p>
                  <p className="text-sm text-muted-foreground">
                    Logga ut från ditt konto
                  </p>
                </div>
                <Button variant="outline" onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Logga ut
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
