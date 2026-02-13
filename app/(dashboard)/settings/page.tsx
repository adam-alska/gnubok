'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/components/ui/use-toast'
import { formatDate } from '@/lib/utils'
import { getDaysUntilExpiry, isConsentExpiringSoon } from '@/lib/banking/enable-banking'
import {
  Loader2,
  Building,
  CreditCard,
  User,
  AlertTriangle,
  RefreshCw,
  Trash2,
  LogOut,
  Share2,
  Bell,
  Calendar,
} from 'lucide-react'
import type { CompanySettings, BankConnection, TikTokAccount } from '@/types'
import { BankSelector, type Bank } from '@/components/banking/BankSelector'
import { TikTokConnectButton, TikTokAccountCard } from '@/components/tiktok'
import { NotificationSettings } from '@/components/settings/NotificationSettings'
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
  const [tiktokAccounts, setTiktokAccounts] = useState<TikTokAccount[]>([])
  const [isSyncing, setIsSyncing] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)

  // Light mode specific state
  const [municipalityCode, setMunicipalityCode] = useState('')
  const [municipalTaxRate, setMunicipalTaxRate] = useState('')
  const [churchTax, setChurchTax] = useState(false)
  const [churchTaxRate, setChurchTaxRate] = useState('')
  const [umbrellaProvider, setUmbrellaProvider] = useState('')
  const [umbrellaFeePercent, setUmbrellaFeePercent] = useState('')
  const [umbrellaPensionPercent, setUmbrellaPensionPercent] = useState('')
  const [umbrellaFeeCustom, setUmbrellaFeeCustom] = useState(false)

  useEffect(() => {
    fetchData()

    // Handle callback messages
    const bankConnected = searchParams.get('bank_connected')
    const bankError = searchParams.get('bank_error')
    const tiktokConnected = searchParams.get('tiktok_connected')
    const tiktokError = searchParams.get('tiktok_error')

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

    if (tiktokConnected === 'true') {
      toast({
        title: 'TikTok anslutet!',
        description: 'Ditt TikTok-konto är nu kopplat.',
      })
      router.replace('/settings')
    }

    if (tiktokError) {
      toast({
        title: 'TikTok-anslutning misslyckades',
        description: decodeURIComponent(tiktokError),
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

    // Initialize light mode fields from fetched settings
    if (settingsData) {
      setMunicipalityCode(settingsData.municipality_code || '')
      setMunicipalTaxRate(settingsData.municipal_tax_rate?.toString() || '')
      setChurchTax(settingsData.church_tax || false)
      setChurchTaxRate(settingsData.church_tax_rate?.toString() || '')
      setUmbrellaProvider(settingsData.umbrella_provider || '')
      setUmbrellaFeePercent(settingsData.umbrella_fee_percent?.toString() || '')
      setUmbrellaPensionPercent(settingsData.umbrella_pension_percent?.toString() || '')
      setUmbrellaFeeCustom(settingsData.umbrella_fee_custom || false)
    }

    // Fetch bank connections
    const { data: connections } = await supabase
      .from('bank_connections')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    setBankConnections(connections || [])

    // Fetch TikTok accounts
    try {
      const tiktokResponse = await fetch('/api/tiktok/accounts')
      const tiktokData = await tiktokResponse.json()
      setTiktokAccounts(tiktokData.accounts || [])
    } catch (error) {
      console.error('Failed to fetch TikTok accounts:', error)
    }

    setIsLoading(false)
  }

  async function handleSaveSettings(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!settings) return

    setIsSaving(true)

    const formData = new FormData(e.currentTarget)
    const isLight = settings.entity_type === 'light'

    let updates: Record<string, unknown>

    if (isLight) {
      updates = {
        company_name: formData.get('company_name') as string,
        municipality_code: municipalityCode || null,
        municipal_tax_rate: parseFloat(municipalTaxRate) || null,
        church_tax: churchTax,
        church_tax_rate: churchTax ? (parseFloat(churchTaxRate) || null) : null,
        umbrella_provider: umbrellaProvider || null,
        umbrella_fee_percent: parseFloat(umbrellaFeePercent) || null,
        umbrella_pension_percent: parseFloat(umbrellaPensionPercent) || null,
        umbrella_fee_custom: umbrellaFeeCustom,
      }
    } else {
      updates = {
        company_name: formData.get('company_name') as string,
        org_number: formData.get('org_number') as string,
        address_line1: formData.get('address_line1') as string,
        postal_code: formData.get('postal_code') as string,
        city: formData.get('city') as string,
        bank_name: formData.get('bank_name') as string,
        clearing_number: formData.get('clearing_number') as string,
        account_number: formData.get('account_number') as string,
        preliminary_tax_monthly: parseFloat(formData.get('preliminary_tax_monthly') as string) || null,
      }
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

  async function handleConnectBank(bank: Bank) {
    setIsConnecting(true)

    try {
      const response = await fetch('/api/banking/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aspsp_name: bank.name, aspsp_country: bank.country }),
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
      const response = await fetch('/api/banking/sync', {
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
          <TabsTrigger value="banking">
            <CreditCard className="mr-2 h-4 w-4" />
            Bank
          </TabsTrigger>
          <TabsTrigger value="social">
            <Share2 className="mr-2 h-4 w-4" />
            Sociala medier
          </TabsTrigger>
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
          {settings?.entity_type === 'light' ? (
            /* ---- Light mode: Personuppgifter ---- */
            <form onSubmit={handleSaveSettings}>
              <div className="space-y-6">
                {/* Personal details */}
                <Card>
                  <CardHeader>
                    <CardTitle>Personuppgifter</CardTitle>
                    <CardDescription>
                      Ditt namn som visas i appen
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="company_name">Namn</Label>
                      <Input
                        id="company_name"
                        name="company_name"
                        defaultValue={settings?.company_name || ''}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Tax settings for light mode */}
                <Card>
                  <CardHeader>
                    <CardTitle>Skatteinställningar</CardTitle>
                    <CardDescription>
                      Kommunalskatt och kyrkoskatt som används för att beräkna din skatteskuld
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Municipality section */}
                    <div className="space-y-4">
                      <h3 className="font-medium">Kommun</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="municipality_code">Kommun</Label>
                          <Input
                            id="municipality_code"
                            placeholder="T.ex. Stockholm"
                            value={municipalityCode}
                            onChange={(e) => setMunicipalityCode(e.target.value)}
                          />
                          <p className="text-xs text-muted-foreground">
                            Ange din kommun för att beräkna kommunalskatt
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="municipal_tax_rate">Total kommunalskatt (%)</Label>
                          <Input
                            id="municipal_tax_rate"
                            type="number"
                            step="0.01"
                            placeholder="T.ex. 32.38"
                            value={municipalTaxRate}
                            onChange={(e) => setMunicipalTaxRate(e.target.value)}
                          />
                          <p className="text-xs text-muted-foreground">
                            Kommunalskatt + landstingsskatt + begravningsavgift
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Church tax section */}
                    <div className="pt-4 border-t space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-medium">Kyrkoavgift</h3>
                          <p className="text-sm text-muted-foreground">
                            Aktivera om du betalar kyrkoavgift
                          </p>
                        </div>
                        <Switch
                          checked={churchTax}
                          onCheckedChange={setChurchTax}
                        />
                      </div>
                      {churchTax && (
                        <div className="space-y-2">
                          <Label htmlFor="church_tax_rate">Kyrkoavgift (%)</Label>
                          <Input
                            id="church_tax_rate"
                            type="number"
                            step="0.01"
                            placeholder="T.ex. 1.00"
                            value={churchTaxRate}
                            onChange={(e) => setChurchTaxRate(e.target.value)}
                          />
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Umbrella provider section */}
                <Card>
                  <CardHeader>
                    <CardTitle>Egenanställningsföretag</CardTitle>
                    <CardDescription>
                      Välj ditt egenanställningsföretag för att beräkna avgifter automatiskt
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Leverantör</Label>
                      <Select
                        value={umbrellaProvider}
                        onValueChange={setUmbrellaProvider}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Välj leverantör" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="frilans_finans">Frilans Finans</SelectItem>
                          <SelectItem value="cool_company">Cool Company</SelectItem>
                          <SelectItem value="gigapay">Gigapay</SelectItem>
                          <SelectItem value="other">Annan</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {umbrellaProvider && (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="umbrella_fee_percent">Serviceavgift (%)</Label>
                            <Input
                              id="umbrella_fee_percent"
                              type="number"
                              step="0.01"
                              placeholder="T.ex. 6.00"
                              value={umbrellaFeePercent}
                              onChange={(e) => setUmbrellaFeePercent(e.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="umbrella_pension_percent">Pensionsavsättning (%)</Label>
                            <Input
                              id="umbrella_pension_percent"
                              type="number"
                              step="0.01"
                              placeholder="T.ex. 4.50"
                              value={umbrellaPensionPercent}
                              onChange={(e) => setUmbrellaPensionPercent(e.target.value)}
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2">
                          <div>
                            <Label>Anpassa avgifter</Label>
                            <p className="text-sm text-muted-foreground">
                              Åsidosätt standardavgifter med egna värden
                            </p>
                          </div>
                          <Switch
                            checked={umbrellaFeeCustom}
                            onCheckedChange={setUmbrellaFeeCustom}
                          />
                        </div>
                      </>
                    )}
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
              </div>
            </form>
          ) : (
            /* ---- EF/AB mode: Företagsuppgifter (existing) ---- */
            <form onSubmit={handleSaveSettings}>
              <Card>
                <CardHeader>
                  <CardTitle>Företagsuppgifter</CardTitle>
                  <CardDescription>
                    Dessa uppgifter visas på dina fakturor
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

                  <div className="pt-4 border-t">
                    <h3 className="font-medium mb-4">Bankuppgifter för fakturor</h3>
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
                  </div>

                  <div className="pt-4 border-t">
                    <h3 className="font-medium mb-4">Skatteinställningar</h3>
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
                  </div>

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
                </CardContent>
              </Card>
            </form>
          )}
        </TabsContent>

        {/* Banking settings */}
        <TabsContent value="banking" className="space-y-6">
          {/* Connected banks */}
          {activeConnections.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Anslutna banker</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {activeConnections.map((connection) => {
                  const daysUntilExpiry = getDaysUntilExpiry(connection.consent_expires_at)
                  const isExpiring = isConsentExpiringSoon(connection.consent_expires_at)

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

          {/* Connect new bank */}
          <Card>
            <CardHeader>
              <CardTitle>Anslut bank</CardTitle>
              <CardDescription>
                Koppla din bank för att automatiskt importera transaktioner via PSD2
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BankSelector
                onSelect={handleConnectBank}
                isLoading={isConnecting}
                country="SE"
                sandbox={true}
              />
              <p className="text-sm text-muted-foreground mt-4">
                Vi använder säker bankintegration (PSD2). Vi kan endast läsa transaktioner,
                aldrig flytta pengar.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Social media settings */}
        <TabsContent value="social" className="space-y-6">
          {/* Connected TikTok accounts */}
          {tiktokAccounts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Kopplade konton</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {tiktokAccounts.map((account) => (
                  <TikTokAccountCard
                    key={account.id}
                    account={account}
                    onDisconnect={fetchData}
                    onSync={fetchData}
                  />
                ))}
              </CardContent>
            </Card>
          )}

          {/* Connect TikTok */}
          {!tiktokAccounts.some(a => a.status === 'active') && (
            <Card>
              <CardHeader>
                <CardTitle>Anslut TikTok</CardTitle>
                <CardDescription>
                  Koppla ditt TikTok-konto för att se statistik och analysera kampanjprestanda
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TikTokConnectButton />
                <p className="text-sm text-muted-foreground mt-4">
                  Vi använder TikToks officiella API och begär endast läsrättigheter för statistik.
                  Vi kan aldrig posta eller ändra något på ditt konto.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

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
