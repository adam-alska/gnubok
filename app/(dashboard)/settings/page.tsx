'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Loader2,
  CreditCard,
  LogOut,
  Sun,
  Moon,
  Monitor,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import type { CompanySettings } from '@/types'
import { CalendarFeedSettings } from '@/components/settings/CalendarFeedSettings'
import { getSettingsPanel } from '@/lib/extensions/settings-panel-registry'
import { SecuritySettings } from '@/components/settings/SecuritySettings'
import { ENABLED_EXTENSION_IDS } from '@/lib/extensions/_generated/enabled-extensions'

const BankingPanel = getSettingsPanel('enable-banking')
const bankingCompiledIn = ENABLED_EXTENSION_IDS.has('enable-banking')

export default function SettingsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const supabase = createClient()

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [settings, setSettings] = useState<CompanySettings | null>(null)
  const [hasBankingExtension, setHasBankingExtension] = useState<boolean | null>(
    bankingCompiledIn ? null : false
  )
  const [hasCalendarExtension, setHasCalendarExtension] = useState(false)
  const [bankConnectionError, setBankConnectionError] = useState<string | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  const initialTab = searchParams.get('tab') || 'company'
  const [activeTab, setActiveTab] = useState(initialTab)

  const settingsTabs = [
    { value: 'company', label: 'Företag', show: true },
    { value: 'banking', label: 'Bank (PSD2)', show: !settings?.is_sandbox },
    { value: 'calendar', label: 'Kalender', show: hasCalendarExtension },
    { value: 'security', label: 'Säkerhet', show: true },
    { value: 'appearance', label: 'Utseende', show: true },
    { value: 'account', label: 'Konto', show: true },
  ].filter(t => t.show)

  useEffect(() => {
    setMounted(true)
  }, [])

  async function fetchData() {
    setIsLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    // Fetch settings and extension toggles in parallel
    const [settingsRes, bankingToggleRes, calendarToggleRes] = await Promise.all([
      supabase.from('company_settings').select('*').eq('user_id', user.id).single(),
      fetch('/api/extensions/toggles/general/enable-banking').catch(() => null),
      fetch('/api/extensions/toggles/general/calendar').catch(() => null),
    ])

    setSettings(settingsRes.data)

    if (bankingToggleRes?.ok) {
      const { data } = await bankingToggleRes.json()
      setHasBankingExtension(data?.enabled || false)
    } else {
      // Fallback: check for existing bank connections
      const { data: connections } = await supabase
        .from('bank_connections')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
      setHasBankingExtension((connections && connections.length > 0) || false)
    }

    if (calendarToggleRes?.ok) {
      const { data } = await calendarToggleRes.json()
      setHasCalendarExtension(data?.enabled || false)
    }

    setIsLoading(false)
  }

  useEffect(() => {
    fetchData()

    // Handle callback messages
    const bankConnected = searchParams.get('bank_connected')
    const bankError = searchParams.get('bank_error')

    if (bankConnected === 'true') {
      toast({
        title: 'Bank ansluten!',
        description: 'Din bank är nu kopplad. Transaktioner hämtas...',
      })

      // Auto-sync transactions after connection
      const connectionId = searchParams.get('connection_id')
      if (connectionId) {
        fetch('/api/extensions/ext/enable-banking/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ connection_id: connectionId, days_back: 90 }),
        })
          .then(res => res.json())
          .then(data => {
            if (data.imported > 0) {
              toast({
                title: 'Transaktioner hämtade',
                description: `${data.imported} transaktioner importerade`,
              })
            }
          })
          .catch(() => {})
      }

      router.replace('/settings?tab=banking')
    }

    if (bankError) {
      const errorMsg = decodeURIComponent(bankError)
      toast({
        title: 'Anslutning misslyckades',
        description: errorMsg,
        variant: 'destructive',
      })
      setBankConnectionError(errorMsg)
      router.replace('/settings?tab=banking')
    }
  }, [searchParams])

  async function handleSaveSettings(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!settings) return

    setIsSaving(true)

    const formData = new FormData(e.currentTarget)

    // Disabled inputs are excluded from FormData by the browser,
    // so only include company_name/org_number when not locked
    const updates: Record<string, unknown> = {
      ...(formData.has('company_name') && { company_name: formData.get('company_name') as string }),
      ...(formData.has('org_number') && { org_number: formData.get('org_number') as string }),
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
        title: 'Kunde inte spara inställningar',
        description: error instanceof Error ? error.message : 'Försök igen.',
        variant: 'destructive',
      })
    }

    setIsSaving(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  async function handleDeleteAccount() {
    if (deleteConfirmText !== 'RADERA') return
    setIsDeleting(true)

    try {
      const response = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'RADERA' }),
      })

      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.error || 'Kunde inte radera kontot')
      }

      router.push('/login')
    } catch (error) {
      toast({
        title: 'Kunde inte radera kontot',
        description: error instanceof Error ? error.message : 'Försök igen.',
        variant: 'destructive',
      })
      setIsDeleting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="h-8 bg-muted rounded w-48 animate-pulse" />
          <div className="h-4 bg-muted rounded w-72 mt-2 animate-pulse" />
        </div>
        <div className="h-10 bg-muted rounded w-96 animate-pulse" />
        <Card>
          <CardHeader>
            <div className="h-5 bg-muted rounded w-32 animate-pulse" />
            <div className="h-4 bg-muted rounded w-56 mt-1 animate-pulse" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="h-4 bg-muted rounded w-24 animate-pulse" />
                <div className="h-10 bg-muted rounded animate-pulse" />
              </div>
              <div className="space-y-2">
                <div className="h-4 bg-muted rounded w-32 animate-pulse" />
                <div className="h-10 bg-muted rounded animate-pulse" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="h-4 bg-muted rounded w-16 animate-pulse" />
              <div className="h-10 bg-muted rounded animate-pulse" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="h-4 bg-muted rounded w-20 animate-pulse" />
                <div className="h-10 bg-muted rounded animate-pulse" />
              </div>
              <div className="space-y-2">
                <div className="h-4 bg-muted rounded w-12 animate-pulse" />
                <div className="h-10 bg-muted rounded animate-pulse" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl md:text-3xl font-medium tracking-tight">Inställningar</h1>
        <p className="text-muted-foreground">
          Hantera dina företags- och kontoinställningar
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        {/* Mobile: dropdown selector */}
        <div className="sm:hidden">
          <Select value={activeTab} onValueChange={setActiveTab}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {settingsTabs.map(t => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Desktop: tab pills */}
        <TabsList className="hidden sm:inline-flex flex-wrap h-auto gap-1">
          {settingsTabs.map(t => (
            <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
          ))}
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
                      disabled={settings?.onboarding_complete === true}
                    />
                    {settings?.onboarding_complete && (
                      <p className="text-xs text-muted-foreground">Kan inte ändras efter att kontot skapats</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="org_number">Organisationsnummer</Label>
                    <Input
                      id="org_number"
                      name="org_number"
                      defaultValue={settings?.org_number || ''}
                      disabled={settings?.onboarding_complete === true}
                    />
                    {settings?.onboarding_complete && (
                      <p className="text-xs text-muted-foreground">Kan inte ändras efter att kontot skapats</p>
                    )}
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
                <div className="grid grid-cols-3 gap-4 items-end">
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

        {/* Banking settings — loaded dynamically from extension, hidden for sandbox */}
        {!settings?.is_sandbox && (
          <TabsContent value="banking" className="space-y-6">
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
            {hasBankingExtension === null ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : hasBankingExtension && BankingPanel ? (
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
          </TabsContent>
        )}

        {/* Calendar feed settings */}
        {hasCalendarExtension && (
          <TabsContent value="calendar">
            <CalendarFeedSettings />
          </TabsContent>
        )}

        {/* Security settings */}
        <TabsContent value="security">
          <SecuritySettings />
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
        <TabsContent value="account" className="space-y-6">
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

          {!settings?.is_sandbox && <Card className="border-destructive/50">
            <CardHeader>
              <CardTitle className="text-destructive">Radera konto</CardTitle>
              <CardDescription>
                Permanent borttagning av ditt konto och all data
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                <div className="flex gap-3">
                  <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  <div className="space-y-2 text-sm">
                    <p className="font-medium text-destructive">Varning: Denna åtgärd kan inte ångras</p>
                    <p className="text-muted-foreground">
                      All din data raderas permanent — bokföring, fakturor, verifikationer, dokument och inställningar.
                    </p>
                    <p className="text-muted-foreground">
                      Enligt bokföringslagen (BFL 7 kap. 2§) ska räkenskapsinformation bevaras i 7 år. Du ansvarar själv för att exportera och arkivera din bokföringsdata innan du raderar kontot.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Button variant="outline" className="w-full sm:w-auto min-h-11" asChild>
                  <Link href="/reports?type=sie">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Exportera bokföringsdata (SIE)
                  </Link>
                </Button>
                <Button
                  variant="destructive"
                  className="w-full sm:w-auto min-h-11"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  Radera mitt konto
                </Button>
              </div>
            </CardContent>
          </Card>}
        </TabsContent>
      </Tabs>

      {/* Delete account confirmation dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={(open) => {
        setShowDeleteDialog(open)
        if (!open) setDeleteConfirmText('')
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Radera konto permanent</DialogTitle>
            <DialogDescription>
              All din data raderas permanent. Skriv <strong>RADERA</strong> nedan för att bekräfta.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="delete-confirm">Bekräfta genom att skriva RADERA</Label>
            <Input
              id="delete-confirm"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="RADERA"
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteDialog(false)
                setDeleteConfirmText('')
              }}
              disabled={isDeleting}
            >
              Avbryt
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={deleteConfirmText !== 'RADERA' || isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Raderar...
                </>
              ) : (
                'Radera permanent'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
