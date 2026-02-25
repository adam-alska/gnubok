'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/components/ui/use-toast'
import {
  Loader2,
  Building,
  CreditCard,
  User,
  LogOut,
  Bell,
  Calendar,
  Sun,
  Moon,
  Monitor,
  Palette,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import type { CompanySettings } from '@/types'
import { CalendarFeedSettings } from '@/components/settings/CalendarFeedSettings'
import { getSettingsPanel } from '@/lib/extensions/settings-panel-registry'

const NotificationPanel = getSettingsPanel('push-notifications')
const BankingPanel = getSettingsPanel('enable-banking')

export default function SettingsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const supabase = createClient()

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [settings, setSettings] = useState<CompanySettings | null>(null)
  const [hasBankingExtension, setHasBankingExtension] = useState(false)
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  const initialTab = searchParams.get('tab') || 'company'

  useEffect(() => {
    setMounted(true)
  }, [])

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

    // Check if Enable Banking extension is enabled
    try {
      const toggleRes = await fetch('/api/extensions/toggles/general/enable-banking')
      if (toggleRes.ok) {
        const { data } = await toggleRes.json()
        setHasBankingExtension(data?.enabled || false)
      }
    } catch {
      // If toggle check fails, also check for existing connections
      const { data: connections } = await supabase
        .from('bank_connections')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)

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
      invoice_default_notes: (formData.get('invoice_default_notes') as string) || null,
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Inställningar</h1>
        <p className="text-muted-foreground">
          Hantera dina företags- och kontoinställningar
        </p>
      </div>

      <Tabs defaultValue={initialTab} className="space-y-6">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="company">
            <Building className="mr-2 h-4 w-4" />
            Företag
          </TabsTrigger>
          {hasBankingExtension && BankingPanel && (
            <TabsTrigger value="banking">
              <CreditCard className="mr-2 h-4 w-4" />
              Bank (PSD2)
            </TabsTrigger>
          )}
          {NotificationPanel && (
            <TabsTrigger value="notifications">
              <Bell className="mr-2 h-4 w-4" />
              Aviseringar
            </TabsTrigger>
          )}
          <TabsTrigger value="calendar">
            <Calendar className="mr-2 h-4 w-4" />
            Kalender
          </TabsTrigger>
          <TabsTrigger value="appearance">
            <Palette className="mr-2 h-4 w-4" />
            Utseende
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
                  <select
                    id="accounting_method"
                    name="accounting_method"
                    defaultValue={settings?.accounting_method || 'accrual'}
                    className="flex h-10 w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="accrual">Faktureringsmetoden</option>
                    <option value="cash">Kontantmetoden</option>
                  </select>
                  <p className="text-xs text-muted-foreground">
                    {settings?.entity_type === 'aktiebolag'
                      ? 'Aktiebolag med omsättning över 3 MSEK måste använda faktureringsmetoden enligt BFL. Mindre aktiebolag kan välja kontantmetoden.'
                      : 'Kontantmetoden är tillgänglig för enskild firma med omsättning under 3 MSEK.'}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="invoice_default_notes">Standardtext på fakturor</Label>
                  <Textarea
                    id="invoice_default_notes"
                    name="invoice_default_notes"
                    rows={3}
                    placeholder="T.ex. betalningsvillkor, leveransinfo..."
                    defaultValue={settings?.invoice_default_notes || ''}
                  />
                  <p className="text-xs text-muted-foreground">
                    Texten föreslås automatiskt i anteckningsfältet vid ny faktura.
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

        {/* Banking settings — loaded dynamically from extension */}
        {hasBankingExtension && BankingPanel && (
          <TabsContent value="banking" className="space-y-6">
            <BankingPanel />
          </TabsContent>
        )}

        {/* Notification settings — loaded dynamically from extension */}
        {NotificationPanel && (
          <TabsContent value="notifications">
            <NotificationPanel />
          </TabsContent>
        )}

        {/* Calendar feed settings */}
        <TabsContent value="calendar">
          <CalendarFeedSettings />
        </TabsContent>

        {/* Appearance settings */}
        <TabsContent value="appearance">
          <Card>
            <CardHeader>
              <CardTitle>Utseende</CardTitle>
              <CardDescription>
                Välj hur applikationen ska se ut
              </CardDescription>
            </CardHeader>
            <CardContent>
              {mounted && (
                <div className="grid grid-cols-3 gap-4">
                  {/* Light */}
                  <button
                    type="button"
                    onClick={() => setTheme('light')}
                    className={`group relative rounded-lg border-2 p-4 text-left transition-colors ${
                      theme === 'light'
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/40'
                    }`}
                  >
                    <div className="mb-3 flex h-20 items-end gap-1.5 rounded-md border bg-white p-2">
                      <div className="h-full w-3 rounded-sm bg-[hsl(222,47%,35%)]" />
                      <div className="flex flex-1 flex-col gap-1">
                        <div className="h-2 w-3/4 rounded-sm bg-[hsl(220,14%,96%)]" />
                        <div className="h-2 w-1/2 rounded-sm bg-[hsl(220,14%,96%)]" />
                        <div className="h-2 w-2/3 rounded-sm bg-[hsl(220,14%,96%)]" />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Sun className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Ljust</span>
                    </div>
                  </button>

                  {/* Dark */}
                  <button
                    type="button"
                    onClick={() => setTheme('dark')}
                    className={`group relative rounded-lg border-2 p-4 text-left transition-colors ${
                      theme === 'dark'
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/40'
                    }`}
                  >
                    <div className="mb-3 flex h-20 items-end gap-1.5 rounded-md border bg-[hsl(222,16%,10%)] p-2">
                      <div className="h-full w-3 rounded-sm bg-[hsl(222,50%,55%)]" />
                      <div className="flex flex-1 flex-col gap-1">
                        <div className="h-2 w-3/4 rounded-sm bg-[hsl(220,12%,20%)]" />
                        <div className="h-2 w-1/2 rounded-sm bg-[hsl(220,12%,20%)]" />
                        <div className="h-2 w-2/3 rounded-sm bg-[hsl(220,12%,20%)]" />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Moon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Mörkt</span>
                    </div>
                  </button>

                  {/* System */}
                  <button
                    type="button"
                    onClick={() => setTheme('system')}
                    className={`group relative rounded-lg border-2 p-4 text-left transition-colors ${
                      theme === 'system'
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/40'
                    }`}
                  >
                    <div className="mb-3 flex h-20 overflow-hidden rounded-md border">
                      <div className="flex flex-1 items-end gap-1 bg-white p-2">
                        <div className="h-full w-2 rounded-sm bg-[hsl(222,47%,35%)]" />
                        <div className="flex flex-1 flex-col gap-1">
                          <div className="h-2 w-3/4 rounded-sm bg-[hsl(220,14%,96%)]" />
                          <div className="h-2 w-1/2 rounded-sm bg-[hsl(220,14%,96%)]" />
                        </div>
                      </div>
                      <div className="flex flex-1 items-end gap-1 bg-[hsl(222,16%,10%)] p-2">
                        <div className="h-full w-2 rounded-sm bg-[hsl(222,50%,55%)]" />
                        <div className="flex flex-1 flex-col gap-1">
                          <div className="h-2 w-3/4 rounded-sm bg-[hsl(220,12%,20%)]" />
                          <div className="h-2 w-1/2 rounded-sm bg-[hsl(220,12%,20%)]" />
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Monitor className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">System</span>
                    </div>
                  </button>
                </div>
              )}
            </CardContent>
          </Card>
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
