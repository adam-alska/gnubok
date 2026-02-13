'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, ArrowRight, ArrowLeft, Search, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { MunicipalityRate, UmbrellaProviderDefault } from '@/types'

interface Step3LightProps {
  initialData: {
    municipality_code?: string
    municipal_tax_rate?: number
    church_tax?: boolean
    church_tax_rate?: number
    church_parish_code?: string
    umbrella_provider?: string
    umbrella_fee_percent?: number
    umbrella_pension_percent?: number
    umbrella_fee_custom?: boolean
  }
  onNext: (data: Record<string, unknown>) => void
  onBack: () => void
  isSaving: boolean
}

export default function Step3LightTaxProfile({
  initialData,
  onNext,
  onBack,
  isSaving,
}: Step3LightProps) {
  const supabase = createClient()

  // Municipality state
  const [municipalitySearch, setMunicipalitySearch] = useState('')
  const [municipalityResults, setMunicipalityResults] = useState<MunicipalityRate[]>([])
  const [selectedMunicipality, setSelectedMunicipality] = useState<MunicipalityRate | null>(null)
  const [showMunicipalityDropdown, setShowMunicipalityDropdown] = useState(false)
  const [municipalityLoading, setMunicipalityLoading] = useState(false)

  // Church tax state
  const [churchTax, setChurchTax] = useState(initialData.church_tax ?? false)
  const [parishes, setParishes] = useState<MunicipalityRate[]>([])
  const [selectedParish, setSelectedParish] = useState<MunicipalityRate | null>(null)
  const [parishLoading, setParishLoading] = useState(false)

  // Umbrella provider state
  const [umbrellaProviders, setUmbrellaProviders] = useState<UmbrellaProviderDefault[]>([])
  const [selectedProvider, setSelectedProvider] = useState(initialData.umbrella_provider || '')
  const [feePercent, setFeePercent] = useState<number | null>(initialData.umbrella_fee_percent ?? null)
  const [pensionPercent, setPensionPercent] = useState<number | null>(initialData.umbrella_pension_percent ?? null)
  const [feeCustom, setFeeCustom] = useState(initialData.umbrella_fee_custom ?? false)
  const [showCustomFees, setShowCustomFees] = useState(initialData.umbrella_fee_custom ?? false)

  // Form state
  const [municipalityCode, setMunicipalityCode] = useState(initialData.municipality_code || '')
  const [municipalTaxRate, setMunicipalTaxRate] = useState<number | null>(initialData.municipal_tax_rate ?? null)
  const [churchTaxRate, setChurchTaxRate] = useState<number | null>(initialData.church_tax_rate ?? null)
  const [churchParishCode, setChurchParishCode] = useState(initialData.church_parish_code || '')

  // Debounced municipality search
  const searchMunicipalities = useCallback(async (query: string) => {
    if (query.length < 2) {
      setMunicipalityResults([])
      return
    }

    setMunicipalityLoading(true)
    try {
      const { data, error } = await supabase
        .from('municipality_tax_rates')
        .select('*')
        .ilike('municipality_name', `%${query}%`)
        .is('parish_code', null)
        .order('municipality_name')
        .limit(10)

      if (!error && data) {
        setMunicipalityResults(data)
      }
    } catch {
      // silently fail
    } finally {
      setMunicipalityLoading(false)
    }
  }, [supabase])

  // Debounce the municipality search
  useEffect(() => {
    const timer = setTimeout(() => {
      searchMunicipalities(municipalitySearch)
    }, 300)
    return () => clearTimeout(timer)
  }, [municipalitySearch, searchMunicipalities])

  // Load initial municipality if we have a code
  useEffect(() => {
    if (initialData.municipality_code && !selectedMunicipality) {
      const loadMunicipality = async () => {
        const { data } = await supabase
          .from('municipality_tax_rates')
          .select('*')
          .eq('municipality_code', initialData.municipality_code!)
          .is('parish_code', null)
          .limit(1)
          .single()

        if (data) {
          setSelectedMunicipality(data)
          setMunicipalitySearch(data.municipality_name)
        }
      }
      loadMunicipality()
    }
  }, [initialData.municipality_code, selectedMunicipality, supabase])

  // Load initial parish if we have a parish code
  useEffect(() => {
    if (initialData.church_parish_code && !selectedParish && initialData.municipality_code) {
      const loadParish = async () => {
        const { data } = await supabase
          .from('municipality_tax_rates')
          .select('*')
          .eq('parish_code', initialData.church_parish_code!)
          .eq('municipality_code', initialData.municipality_code!)
          .limit(1)
          .single()

        if (data) {
          setSelectedParish(data)
        }
      }
      loadParish()
    }
  }, [initialData.church_parish_code, initialData.municipality_code, selectedParish, supabase])

  // Fetch parishes when municipality is selected and church tax is on
  useEffect(() => {
    if (churchTax && municipalityCode) {
      const fetchParishes = async () => {
        setParishLoading(true)
        try {
          const { data, error } = await supabase
            .from('municipality_tax_rates')
            .select('*')
            .eq('municipality_code', municipalityCode)
            .not('parish_code', 'is', null)
            .order('parish_name')

          if (!error && data) {
            setParishes(data)
          }
        } catch {
          // silently fail
        } finally {
          setParishLoading(false)
        }
      }
      fetchParishes()
    } else {
      setParishes([])
    }
  }, [churchTax, municipalityCode, supabase])

  // Fetch umbrella providers on mount
  useEffect(() => {
    const fetchProviders = async () => {
      const { data, error } = await supabase
        .from('umbrella_provider_defaults')
        .select('*')
        .order('display_name')

      if (!error && data) {
        setUmbrellaProviders(data)
      }
    }
    fetchProviders()
  }, [supabase])

  // Handle municipality selection
  const handleSelectMunicipality = (municipality: MunicipalityRate) => {
    setSelectedMunicipality(municipality)
    setMunicipalitySearch(municipality.municipality_name)
    setMunicipalityCode(municipality.municipality_code)
    setMunicipalTaxRate(municipality.total_rate / 100)
    setShowMunicipalityDropdown(false)

    // Reset parish selection when municipality changes
    setSelectedParish(null)
    setChurchTaxRate(null)
    setChurchParishCode('')
  }

  // Handle parish selection
  const handleSelectParish = (parishCode: string) => {
    const parish = parishes.find((p) => p.parish_code === parishCode)
    if (parish) {
      setSelectedParish(parish)
      setChurchTaxRate(parish.church_rate ? parish.church_rate / 100 : null)
      setChurchParishCode(parish.parish_code || '')
    }
  }

  // Handle provider selection
  const handleSelectProvider = (providerName: string) => {
    setSelectedProvider(providerName)

    if (providerName === 'Annan') {
      setFeePercent(null)
      setPensionPercent(null)
      setShowCustomFees(true)
      setFeeCustom(true)
      return
    }

    const provider = umbrellaProviders.find((p) => p.display_name === providerName)
    if (provider) {
      setFeePercent(provider.default_fee_percent)
      setPensionPercent(provider.pension_percent)
      if (!showCustomFees) {
        setFeeCustom(false)
      }
    }
  }

  // Handle form submit
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onNext({
      municipality_code: municipalityCode,
      municipal_tax_rate: municipalTaxRate,
      church_tax: churchTax,
      church_tax_rate: churchTax ? churchTaxRate : null,
      church_parish_code: churchTax ? churchParishCode : null,
      umbrella_provider: selectedProvider || null,
      umbrella_fee_percent: feePercent,
      umbrella_pension_percent: pensionPercent,
      umbrella_fee_custom: feeCustom,
    })
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Skatteprofil</h1>
        <p className="text-muted-foreground mt-2">
          Ange din kommun och egenanställningsföretag för korrekt skatteberäkning
        </p>
      </div>

      <Card className="max-w-lg mx-auto">
        <CardHeader>
          <CardTitle>Kommun</CardTitle>
          <CardDescription>
            Din kommunalskattesats används för att uppskatta skatt på gåvor och hobbyinkomst.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Municipality search */}
            <div className="space-y-2">
              <Label htmlFor="municipality_search">Sök kommun</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="municipality_search"
                  placeholder="Skriv kommunnamn..."
                  value={municipalitySearch}
                  onChange={(e) => {
                    setMunicipalitySearch(e.target.value)
                    setShowMunicipalityDropdown(true)
                    if (selectedMunicipality) {
                      setSelectedMunicipality(null)
                      setMunicipalityCode('')
                      setMunicipalTaxRate(null)
                    }
                  }}
                  onFocus={() => {
                    if (municipalityResults.length > 0) {
                      setShowMunicipalityDropdown(true)
                    }
                  }}
                  className="pl-9"
                />
                {municipalityLoading && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}

                {/* Municipality dropdown */}
                {showMunicipalityDropdown && municipalityResults.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full rounded-lg border border-border/60 bg-popover shadow-md max-h-60 overflow-auto">
                    {municipalityResults.map((municipality) => (
                      <button
                        key={municipality.id}
                        type="button"
                        className="flex w-full items-center justify-between px-4 py-2.5 text-sm hover:bg-secondary transition-colors"
                        onClick={() => handleSelectMunicipality(municipality)}
                      >
                        <span>{municipality.municipality_name}</span>
                        <span className="text-muted-foreground text-xs">
                          {municipality.total_rate.toFixed(2)}%
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Selected municipality display */}
              {selectedMunicipality && (
                <div className="flex items-center gap-2 mt-2">
                  <Check className="h-4 w-4 text-primary" />
                  <span className="text-sm">
                    {selectedMunicipality.municipality_name}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {selectedMunicipality.total_rate.toFixed(2)}% kommunalskatt
                  </Badge>
                </div>
              )}
            </div>

            {/* Church membership section */}
            <div className="pt-4 border-t space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="church_tax">Medlem i Svenska kyrkan?</Label>
                  <p className="text-xs text-muted-foreground">
                    Kyrkoskatt tillkommer utöver kommunalskatten
                  </p>
                </div>
                <Switch
                  id="church_tax"
                  checked={churchTax}
                  onCheckedChange={(checked) => {
                    setChurchTax(checked)
                    if (!checked) {
                      setSelectedParish(null)
                      setChurchTaxRate(null)
                      setChurchParishCode('')
                    }
                  }}
                />
              </div>

              {churchTax && municipalityCode && (
                <div className="space-y-2">
                  <Label>Församling</Label>
                  {parishLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Laddar församlingar...
                    </div>
                  ) : parishes.length > 0 ? (
                    <Select
                      value={churchParishCode}
                      onValueChange={handleSelectParish}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Välj församling" />
                      </SelectTrigger>
                      <SelectContent>
                        {parishes.map((parish) => (
                          <SelectItem
                            key={parish.parish_code}
                            value={parish.parish_code!}
                          >
                            {parish.parish_name} ({parish.church_rate?.toFixed(2)}%)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Inga församlingar hittades för vald kommun.
                    </p>
                  )}

                  {selectedParish && selectedParish.church_rate && (
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-primary" />
                      <span className="text-sm">
                        Kyrkoskatt: {selectedParish.church_rate.toFixed(2)}%
                      </span>
                    </div>
                  )}
                </div>
              )}

              {churchTax && !municipalityCode && (
                <p className="text-sm text-muted-foreground">
                  Välj kommun ovan för att se församlingar.
                </p>
              )}
            </div>

            {/* Umbrella provider section */}
            <div className="pt-4 border-t space-y-4">
              <div>
                <Label>Egenanställningsföretag</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Välj det företag du arbetar via för att beräkna avgifter korrekt.
                </p>
              </div>

              <Select
                value={selectedProvider}
                onValueChange={handleSelectProvider}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Välj egenanställningsföretag" />
                </SelectTrigger>
                <SelectContent>
                  {umbrellaProviders.map((provider) => (
                    <SelectItem
                      key={provider.id}
                      value={provider.display_name}
                    >
                      {provider.display_name}
                    </SelectItem>
                  ))}
                  <SelectItem value="Annan">Annan</SelectItem>
                </SelectContent>
              </Select>

              {selectedProvider && feePercent !== null && !showCustomFees && (
                <div className="flex items-center gap-3 text-sm">
                  <Badge variant="secondary">
                    Avgift: {feePercent}%
                  </Badge>
                  {pensionPercent !== null && pensionPercent > 0 && (
                    <Badge variant="secondary">
                      Pension: {pensionPercent}%
                    </Badge>
                  )}
                </div>
              )}

              {selectedProvider && !showCustomFees && selectedProvider !== 'Annan' && (
                <button
                  type="button"
                  className="text-sm text-primary hover:underline"
                  onClick={() => {
                    setShowCustomFees(true)
                    setFeeCustom(true)
                  }}
                >
                  Anpassa avgifter
                </button>
              )}

              {showCustomFees && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="fee_percent">Avgift (%)</Label>
                    <Input
                      id="fee_percent"
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      placeholder="t.ex. 6"
                      value={feePercent ?? ''}
                      onChange={(e) => {
                        setFeePercent(e.target.value ? parseFloat(e.target.value) : null)
                        setFeeCustom(true)
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pension_percent">Pension (%)</Label>
                    <Input
                      id="pension_percent"
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      placeholder="t.ex. 4.5"
                      value={pensionPercent ?? ''}
                      onChange={(e) => {
                        setPensionPercent(e.target.value ? parseFloat(e.target.value) : null)
                        setFeeCustom(true)
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Navigation buttons */}
            <div className="flex justify-between pt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={onBack}
                disabled={isSaving}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Tillbaka
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sparar...
                  </>
                ) : (
                  <>
                    Fortsätt
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
