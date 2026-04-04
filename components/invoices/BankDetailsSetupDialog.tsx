'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, ChevronDown, ChevronRight } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/components/ui/use-toast'
import { BankNameCombobox } from '@/components/settings/BankNameCombobox'
import { validateBankgiroNumber, formatBankgiroNumber } from '@/lib/bankgiro/luhn'

const bankSetupSchema = z.object({
  bank_name: z.string().max(100).optional().or(z.literal('')),
  clearing_number: z.string().regex(/^\d{4,5}$/, 'Clearingnummer måste vara 4–5 siffror').optional().or(z.literal('')),
  account_number: z.string().regex(/^\d{6,12}$/, 'Kontonummer måste vara 6–12 siffror').optional().or(z.literal('')),
  bankgiro: z.string().optional().or(z.literal('')),
  iban: z.string().optional().or(z.literal('')),
  bic: z.string().optional().or(z.literal('')),
  invoice_prefix: z.string().optional().or(z.literal('')),
  next_invoice_number: z.string().optional().or(z.literal('')),
}).refine(
  (data) => {
    const hasAccount = !!data.clearing_number && !!data.account_number
    const hasBankgiro = !!data.bankgiro
    return hasAccount || hasBankgiro
  },
  { message: 'Ange antingen kontonummer (clearing + konto) eller bankgiro', path: ['clearing_number'] }
).refine(
  (data) => {
    // If one of clearing/account is filled, both must be
    if (data.clearing_number && !data.account_number) return false
    if (!data.clearing_number && data.account_number) return false
    return true
  },
  { message: 'Ange både clearingnummer och kontonummer', path: ['account_number'] }
).refine(
  (data) => {
    if (!data.bankgiro) return true
    return validateBankgiroNumber(data.bankgiro)
  },
  { message: 'Ogiltigt bankgironummer (7–8 siffror med kontrollsiffra)', path: ['bankgiro'] }
).refine(
  (data) => {
    if (!data.next_invoice_number) return true
    const num = parseInt(data.next_invoice_number, 10)
    return !isNaN(num) && num >= 1
  },
  { message: 'Startnummer måste vara ett positivt heltal', path: ['next_invoice_number'] }
)

type BankSetupData = z.infer<typeof bankSetupSchema>

interface BankDetailsSetupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete: () => void
}

export function BankDetailsSetupDialog({ open, onOpenChange, onComplete }: BankDetailsSetupDialogProps) {
  const { toast } = useToast()
  const [isSaving, setIsSaving] = useState(false)
  const [showInternational, setShowInternational] = useState(false)
  const [bankName, setBankName] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    trigger,
  } = useForm<BankSetupData>({
    resolver: zodResolver(bankSetupSchema),
    defaultValues: {
      bank_name: '',
      clearing_number: '',
      account_number: '',
      bankgiro: '',
      iban: '',
      bic: '',
      invoice_prefix: '',
      next_invoice_number: '',
    },
  })

  async function onSubmit(data: BankSetupData) {
    setIsSaving(true)

    // Format bankgiro if valid
    if (data.bankgiro) {
      data.bankgiro = formatBankgiroNumber(data.bankgiro)
    }

    // Include bank name from combobox
    data.bank_name = bankName

    // Clean empty strings to null for API
    const payload: Record<string, string | number | null> = {}
    for (const [key, val] of Object.entries(data)) {
      if (key === 'next_invoice_number') {
        const num = val ? parseInt(val as string, 10) : null
        if (num !== null) payload[key] = num
      } else {
        const str = val as string
        if (str) payload[key] = str
      }
    }

    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.error || 'Kunde inte spara')
      }

      toast({
        title: 'Betalningsuppgifter sparade',
        description: 'Du kan ändra dem senare i Inställningar.',
      })
      onComplete()
    } catch (error) {
      toast({
        title: 'Kunde inte spara',
        description: error instanceof Error ? error.message : 'Försök igen.',
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }

  // Flatten refine errors so they appear on the right fields
  const clearingError = errors.clearing_number?.message
  const accountError = errors.account_number?.message
  const bankgiroError = errors.bankgiro?.message

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="font-display text-xl tracking-tight">Betalningsuppgifter</DialogTitle>
          <DialogDescription>
            Dessa uppgifter visas på dina fakturor. Du kan ändra dem senare i{' '}
            <a href="/settings" className="underline underline-offset-2 hover:text-foreground">Inställningar</a>.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
          {/* Bank name */}
          <div className="space-y-2">
            <Label htmlFor="bank_name">Bank</Label>
            <BankNameCombobox
              value={bankName}
              onChange={setBankName}
            />
          </div>

          {/* Clearing + Account number */}
          <div className="grid grid-cols-5 gap-3">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="clearing_number">Clearing</Label>
              <Input
                id="clearing_number"
                placeholder="8000"
                maxLength={5}
                inputMode="numeric"
                {...register('clearing_number')}
                onBlur={() => trigger(['clearing_number', 'account_number'])}
              />
            </div>
            <div className="col-span-3 space-y-2">
              <Label htmlFor="account_number">Kontonummer</Label>
              <Input
                id="account_number"
                placeholder="12345678"
                maxLength={12}
                inputMode="numeric"
                {...register('account_number')}
                onBlur={() => trigger(['clearing_number', 'account_number'])}
              />
            </div>
          </div>
          {clearingError && (
            <p className="text-sm text-destructive -mt-2">{clearingError}</p>
          )}
          {accountError && !clearingError && (
            <p className="text-sm text-destructive -mt-2">{accountError}</p>
          )}

          {/* Bankgiro */}
          <div className="space-y-2">
            <Label htmlFor="bankgiro">Bankgiro</Label>
            <Input
              id="bankgiro"
              placeholder="123-4567"
              maxLength={9}
              {...register('bankgiro')}
              onBlur={(e) => {
                const val = e.target.value.trim()
                if (val && validateBankgiroNumber(val)) {
                  setValue('bankgiro', formatBankgiroNumber(val))
                }
                trigger('bankgiro')
              }}
            />
            {bankgiroError && (
              <p className="text-sm text-destructive">{bankgiroError}</p>
            )}
          </div>

          {/* International payments — collapsible */}
          <div>
            <button
              type="button"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowInternational(!showInternational)}
            >
              {showInternational ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              Internationella betalningar
            </button>
            {showInternational && (
              <div className="space-y-3 pt-3 animate-in slide-in-from-top-1 duration-150">
                <div className="space-y-2">
                  <Label htmlFor="iban">IBAN</Label>
                  <Input
                    id="iban"
                    placeholder="SE12 3456 7890 1234 5678 9012"
                    {...register('iban')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bic">BIC/SWIFT</Label>
                  <Input
                    id="bic"
                    placeholder="NDEASESS"
                    maxLength={11}
                    {...register('bic')}
                  />
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Invoice prefix + starting number */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="invoice_prefix">Fakturaprefix</Label>
              <Input
                id="invoice_prefix"
                placeholder="t.ex. F-"
                maxLength={10}
                {...register('invoice_prefix')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="next_invoice_number">Startnummer</Label>
              <Input
                id="next_invoice_number"
                placeholder="1"
                inputMode="numeric"
                maxLength={6}
                {...register('next_invoice_number')}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">
            Prefix &quot;F-&quot; med startnummer 1 ger F-2026001. Lämna tomt för standard.
          </p>
          {errors.next_invoice_number && (
            <p className="text-sm text-destructive -mt-2">{errors.next_invoice_number.message}</p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="submit" disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Spara & fortsätt
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
