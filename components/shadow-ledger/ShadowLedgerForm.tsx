'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import PayoutWaterfall from '@/components/shadow-ledger/PayoutWaterfall'
import type { CreateShadowLedgerEntryInput, ShadowLedgerEntryType } from '@/types'

const TYPE_OPTIONS: { value: ShadowLedgerEntryType; label: string }[] = [
  { value: 'payout', label: 'Utbetalning' },
  { value: 'gift', label: 'G\u00e5va' },
  { value: 'expense', label: 'Utgift' },
  { value: 'hobby_income', label: 'Hobbyinkomst' },
  { value: 'hobby_expense', label: 'Hobbyutgift' },
]

interface ShadowLedgerFormProps {
  onSubmit: (data: CreateShadowLedgerEntryInput) => Promise<void>
  initialData?: Partial<CreateShadowLedgerEntryInput>
  isLoading?: boolean
  settings?: {
    umbrella_provider?: string | null
    umbrella_fee_percent?: number | null
    umbrella_pension_percent?: number | null
    municipal_tax_rate?: number | null
  }
}

export default function ShadowLedgerForm({
  onSubmit,
  initialData,
  isLoading,
  settings,
}: ShadowLedgerFormProps) {
  const [date, setDate] = useState(
    initialData?.date || new Date().toISOString().split('T')[0]
  )
  const [type, setType] = useState<ShadowLedgerEntryType>(
    initialData?.type || 'payout'
  )
  const [provider, setProvider] = useState(
    initialData?.provider || settings?.umbrella_provider || ''
  )
  const [grossAmount, setGrossAmount] = useState(
    initialData?.gross_amount?.toString() || ''
  )
  const [platformFee, setPlatformFee] = useState(
    initialData?.platform_fee?.toString() || ''
  )
  const [serviceFee, setServiceFee] = useState(
    initialData?.service_fee?.toString() || ''
  )
  const [pensionDeduction, setPensionDeduction] = useState(
    initialData?.pension_deduction?.toString() || ''
  )
  const [socialFees, setSocialFees] = useState(
    initialData?.social_fees?.toString() || ''
  )
  const [incomeTaxWithheld, setIncomeTaxWithheld] = useState(
    initialData?.income_tax_withheld?.toString() || ''
  )
  const [netAmount, setNetAmount] = useState(
    initialData?.net_amount?.toString() || ''
  )
  const [description, setDescription] = useState(
    initialData?.description || ''
  )
  const [campaignId, setCampaignId] = useState(
    initialData?.campaign_id || ''
  )
  const [netOverridden, setNetOverridden] = useState(false)

  const parseNum = (val: string): number => {
    const n = parseFloat(val)
    return isNaN(n) ? 0 : n
  }

  // Auto-compute service_fee and pension_deduction when gross changes and type is payout
  const autoCompute = useCallback(() => {
    if (type !== 'payout') return

    const gross = parseNum(grossAmount)
    const platform = parseNum(platformFee)

    if (gross <= 0) return

    const afterPlatform = gross - platform

    // Service fee from umbrella percentage
    if (settings?.umbrella_fee_percent != null) {
      const computedServiceFee = afterPlatform * (settings.umbrella_fee_percent / 100)
      setServiceFee(Math.round(computedServiceFee).toString())
    }

    // Pension deduction
    if (settings?.umbrella_pension_percent != null) {
      const computedPension = afterPlatform * (settings.umbrella_pension_percent / 100)
      setPensionDeduction(Math.round(computedPension).toString())
    }
  }, [type, grossAmount, platformFee, settings])

  useEffect(() => {
    autoCompute()
  }, [autoCompute])

  // Auto-compute net amount unless overridden
  useEffect(() => {
    if (netOverridden) return

    const gross = parseNum(grossAmount)
    const platform = parseNum(platformFee)
    const service = parseNum(serviceFee)
    const pension = parseNum(pensionDeduction)
    const social = parseNum(socialFees)
    const tax = parseNum(incomeTaxWithheld)

    const computed = gross - platform - service - pension - social - tax
    setNetAmount(Math.max(0, Math.round(computed)).toString())
  }, [grossAmount, platformFee, serviceFee, pensionDeduction, socialFees, incomeTaxWithheld, netOverridden])

  // Update provider from settings when settings change
  useEffect(() => {
    if (settings?.umbrella_provider && !provider) {
      setProvider(settings.umbrella_provider)
    }
  }, [settings, provider])

  const handleNetChange = (val: string) => {
    setNetOverridden(true)
    setNetAmount(val)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const data: CreateShadowLedgerEntryInput = {
      date,
      type,
      source: 'manual',
      provider: provider || undefined,
      gross_amount: parseNum(grossAmount),
      platform_fee: parseNum(platformFee) || undefined,
      service_fee: parseNum(serviceFee) || undefined,
      pension_deduction: parseNum(pensionDeduction) || undefined,
      social_fees: parseNum(socialFees) || undefined,
      income_tax_withheld: parseNum(incomeTaxWithheld) || undefined,
      net_amount: parseNum(netAmount),
      description: description || undefined,
      campaign_id: campaignId || undefined,
    }

    await onSubmit(data)
  }

  const isPayout = type === 'payout'
  const gross = parseNum(grossAmount)

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Row 1: Date + Type */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="date">Datum</Label>
          <Input
            id="date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="type">Typ</Label>
          <Select value={type} onValueChange={(v) => setType(v as ShadowLedgerEntryType)}>
            <SelectTrigger id="type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Row 2: Provider */}
      <div className="space-y-2">
        <Label htmlFor="provider">Leverant\u00f6r</Label>
        <Input
          id="provider"
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          placeholder="t.ex. Gigapay, Frilans Finans"
        />
      </div>

      {/* Row 3: Gross + Platform fee */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="gross">Bruttobelopp (SEK)</Label>
          <Input
            id="gross"
            type="number"
            min="0"
            step="1"
            value={grossAmount}
            onChange={(e) => setGrossAmount(e.target.value)}
            placeholder="0"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="platformFee">Plattformsavgift</Label>
          <Input
            id="platformFee"
            type="number"
            min="0"
            step="1"
            value={platformFee}
            onChange={(e) => setPlatformFee(e.target.value)}
            placeholder="0"
          />
        </div>
      </div>

      {/* Row 4: Service fee + Pension */}
      {isPayout && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="serviceFee">
              Serviceavgift
              {settings?.umbrella_fee_percent != null && (
                <span className="ml-1 text-xs text-muted-foreground">
                  ({settings.umbrella_fee_percent}%)
                </span>
              )}
            </Label>
            <Input
              id="serviceFee"
              type="number"
              min="0"
              step="1"
              value={serviceFee}
              onChange={(e) => setServiceFee(e.target.value)}
              placeholder="0"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pension">
              Pensionsavs\u00e4ttning
              {settings?.umbrella_pension_percent != null && (
                <span className="ml-1 text-xs text-muted-foreground">
                  ({settings.umbrella_pension_percent}%)
                </span>
              )}
            </Label>
            <Input
              id="pension"
              type="number"
              min="0"
              step="1"
              value={pensionDeduction}
              onChange={(e) => setPensionDeduction(e.target.value)}
              placeholder="0"
            />
          </div>
        </div>
      )}

      {/* Row 5: Social fees + Tax */}
      {isPayout && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="socialFees">Arbetsgivaravgifter</Label>
            <Input
              id="socialFees"
              type="number"
              min="0"
              step="1"
              value={socialFees}
              onChange={(e) => setSocialFees(e.target.value)}
              placeholder="0"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tax">Prelimin\u00e4rskatt</Label>
            <Input
              id="tax"
              type="number"
              min="0"
              step="1"
              value={incomeTaxWithheld}
              onChange={(e) => setIncomeTaxWithheld(e.target.value)}
              placeholder="0"
            />
          </div>
        </div>
      )}

      {/* Row 6: Net amount */}
      <div className="space-y-2">
        <Label htmlFor="net">Nettobelopp (SEK)</Label>
        <Input
          id="net"
          type="number"
          min="0"
          step="1"
          value={netAmount}
          onChange={(e) => handleNetChange(e.target.value)}
          placeholder="0"
          required
        />
        {netOverridden && isPayout && (
          <button
            type="button"
            className="text-xs text-primary hover:underline"
            onClick={() => setNetOverridden(false)}
          >
            \u00c5terst\u00e4ll automatisk ber\u00e4kning
          </button>
        )}
      </div>

      {/* Row 7: Description */}
      <div className="space-y-2">
        <Label htmlFor="description">Beskrivning</Label>
        <Input
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Frivillig beskrivning"
        />
      </div>

      {/* Row 8: Campaign link */}
      <div className="space-y-2">
        <Label htmlFor="campaignId">Kampanjkoppling</Label>
        <Input
          id="campaignId"
          value={campaignId}
          onChange={(e) => setCampaignId(e.target.value)}
          placeholder="Kampanj-ID (valfritt)"
        />
      </div>

      {/* Waterfall preview */}
      {isPayout && gross > 0 && (
        <Card className="bg-muted/30">
          <CardContent className="pt-4 pb-4">
            <p className="mb-3 text-sm font-medium text-muted-foreground">
              Brutto-till-netto-f\u00f6rdelning
            </p>
            <PayoutWaterfall
              grossAmount={gross}
              platformFee={parseNum(platformFee)}
              serviceFee={parseNum(serviceFee)}
              pensionDeduction={parseNum(pensionDeduction)}
              socialFees={parseNum(socialFees)}
              incomeTaxWithheld={parseNum(incomeTaxWithheld)}
              netAmount={parseNum(netAmount)}
            />
          </CardContent>
        </Card>
      )}

      {/* Submit */}
      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? 'Sparar...' : 'Spara post'}
      </Button>
    </form>
  )
}
