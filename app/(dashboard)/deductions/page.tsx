'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/components/ui/use-toast'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  getSchablonavdragSummary,
  groupMileageEntriesByMonth,
  formatMonthKey,
  SCHABLONAVDRAG_RATES,
} from '@/lib/tax/schablonavdrag'
import SchablonavdragSettings from '@/components/settings/SchablonavdragSettings'
import MileageEntry from '@/components/transactions/MileageEntry'
import {
  Loader2,
  Home,
  Car,
  Plus,
  Trash2,
  Calendar,
  MapPin,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import type {
  CompanySettings,
  SchablonavdragSettings as SchablonavdragSettingsType,
  MileageEntry as MileageEntryType,
  CreateMileageEntryInput,
} from '@/types'

export default function DeductionsPage() {
  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClient()

  const [isLoading, setIsLoading] = useState(true)
  const [settings, setSettings] = useState<CompanySettings | null>(null)
  const [mileageEntries, setMileageEntries] = useState<MileageEntryType[]>([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setIsLoading(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()
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

    // Fetch mileage entries for current year
    const startOfYear = new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]
    const { data: entries } = await supabase
      .from('mileage_entries')
      .select('*')
      .eq('user_id', user.id)
      .gte('date', startOfYear)
      .order('date', { ascending: false })

    setMileageEntries(entries || [])
    setIsLoading(false)
  }

  async function handleSaveSettings(newSettings: SchablonavdragSettingsType) {
    if (!settings) return

    const { error } = await supabase
      .from('company_settings')
      .update({ schablonavdrag_settings: newSettings })
      .eq('id', settings.id)

    if (error) {
      throw error
    }

    setSettings({
      ...settings,
      schablonavdrag_settings: newSettings,
    } as CompanySettings & { schablonavdrag_settings: SchablonavdragSettingsType })
  }

  async function handleAddMileageEntry(entry: CreateMileageEntryInput) {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase
      .from('mileage_entries')
      .insert({
        user_id: user.id,
        date: entry.date,
        distance_km: entry.distance_km,
        purpose: entry.purpose,
        from_location: entry.from_location || null,
        to_location: entry.to_location || null,
      })
      .select()
      .single()

    if (error) {
      throw error
    }

    setMileageEntries([data, ...mileageEntries])
    setShowAddForm(false)
  }

  async function handleDeleteMileageEntry(id: string) {
    const { error } = await supabase.from('mileage_entries').delete().eq('id', id)

    if (error) {
      toast({
        title: 'Fel',
        description: 'Kunde inte ta bort körningen',
        variant: 'destructive',
      })
      return
    }

    setMileageEntries(mileageEntries.filter((e) => e.id !== id))
    toast({
      title: 'Borttaget',
      description: 'Körningen har tagits bort',
    })
  }

  function toggleMonth(monthKey: string) {
    const newExpanded = new Set(expandedMonths)
    if (newExpanded.has(monthKey)) {
      newExpanded.delete(monthKey)
    } else {
      newExpanded.add(monthKey)
    }
    setExpandedMonths(newExpanded)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  // Get schablonavdrag settings
  const schablonavdragSettings = ((settings as CompanySettings & { schablonavdrag_settings?: SchablonavdragSettingsType })?.schablonavdrag_settings) || {
    hemmakontor_enabled: false,
    bil_enabled: false,
  }

  // Calculate summary
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() + 1
  const summary = getSchablonavdragSummary(
    schablonavdragSettings,
    mileageEntries,
    currentYear,
    currentMonth
  )

  // Group mileage entries by month
  const entriesByMonth = groupMileageEntriesByMonth(mileageEntries)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Schablonavdrag</h1>
        <p className="text-muted-foreground">
          Hantera dina schablonmässiga avdrag för hemmakontor och bilkostnader
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Total deduction */}
        <Card className="bg-gradient-to-br from-success/10 via-success/5 to-background border-success/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Totalt avdrag {currentYear}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-success">
              {formatCurrency(summary.total_deduction)}
            </div>
          </CardContent>
        </Card>

        {/* Hemmakontor */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Home className="h-4 w-4" />
              Hemmakontor
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary.hemmakontor.enabled ? formatCurrency(summary.hemmakontor.deduction) : '-'}
            </div>
            {summary.hemmakontor.enabled && (
              <p className="text-xs text-muted-foreground">
                {summary.hemmakontor.months_active} månader
              </p>
            )}
          </CardContent>
        </Card>

        {/* Bilkostnader */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Car className="h-4 w-4" />
              Bilkostnader
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary.mileage.enabled ? formatCurrency(summary.mileage.total_deduction) : '-'}
            </div>
            {summary.mileage.enabled && summary.mileage.total_km > 0 && (
              <p className="text-xs text-muted-foreground">
                {summary.mileage.total_km.toFixed(0)} km loggade
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="settings" className="space-y-6">
        <TabsList>
          <TabsTrigger value="settings">Inställningar</TabsTrigger>
          <TabsTrigger value="mileage" disabled={!schablonavdragSettings.bil_enabled}>
            Körjournal
            {schablonavdragSettings.bil_enabled && mileageEntries.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {mileageEntries.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Settings tab */}
        <TabsContent value="settings">
          <SchablonavdragSettings
            settings={schablonavdragSettings}
            onSave={handleSaveSettings}
          />
        </TabsContent>

        {/* Mileage log tab */}
        <TabsContent value="mileage" className="space-y-6">
          {/* Add new entry button/form */}
          {showAddForm ? (
            <MileageEntry onSave={handleAddMileageEntry} onCancel={() => setShowAddForm(false)} />
          ) : (
            <Button onClick={() => setShowAddForm(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Ny körning
            </Button>
          )}

          {/* Entries list grouped by month */}
          {mileageEntries.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center">
                <Car className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <h3 className="mt-4 text-lg font-medium">Ingen körning loggad</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Börja logga dina tjänsteresor för att få milersättning
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {Array.from(entriesByMonth.entries()).map(([monthKey, monthData]) => (
                <Card key={monthKey}>
                  <CardHeader
                    className="cursor-pointer"
                    onClick={() => toggleMonth(monthKey)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base">
                          {formatMonthKey(monthKey)}
                        </CardTitle>
                        <CardDescription>
                          {monthData.entries.length} körningar · {monthData.totalKm.toFixed(0)} km
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-lg font-medium text-success">
                          {formatCurrency(monthData.totalDeduction)}
                        </span>
                        {expandedMonths.has(monthKey) ? (
                          <ChevronUp className="h-5 w-5" />
                        ) : (
                          <ChevronDown className="h-5 w-5" />
                        )}
                      </div>
                    </div>
                  </CardHeader>

                  {expandedMonths.has(monthKey) && (
                    <CardContent className="pt-0">
                      <div className="space-y-3">
                        {monthData.entries.map((entry) => (
                          <div
                            key={entry.id}
                            className="flex items-start justify-between p-3 rounded-lg border bg-muted/30"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 text-sm">
                                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                                <span>{formatDate(entry.date)}</span>
                                <Badge variant="secondary">
                                  {Number(entry.distance_km).toFixed(1)} km
                                </Badge>
                              </div>
                              <p className="text-sm">{entry.purpose}</p>
                              {(entry.from_location || entry.to_location) && (
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <MapPin className="h-3 w-3" />
                                  {entry.from_location && entry.to_location
                                    ? `${entry.from_location} → ${entry.to_location}`
                                    : entry.from_location || entry.to_location}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-medium text-success">
                                {formatCurrency(Number(entry.total_deduction))}
                              </span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => handleDeleteMileageEntry(entry.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
