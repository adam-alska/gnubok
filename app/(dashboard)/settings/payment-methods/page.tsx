'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import {
  Plus,
  Trash2,
  Star,
  CreditCard,
  Building,
  Smartphone,
  Banknote,
  ArrowLeft,
  Loader2,
  Pencil,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatBankgiroNumber, formatPlusgiroNumber } from '@/lib/payments/payment-infrastructure'
import type { PaymentMethod, PaymentMethodType, PAYMENT_METHOD_LABELS } from '@/types/bank-reconciliation'

const METHOD_TYPE_OPTIONS: { value: PaymentMethodType; label: string }[] = [
  { value: 'bankgiro', label: 'Bankgiro' },
  { value: 'plusgiro', label: 'Plusgiro' },
  { value: 'swish', label: 'Swish' },
  { value: 'bank_transfer', label: 'Banköverföring' },
  { value: 'cash', label: 'Kontant' },
  { value: 'card', label: 'Kort' },
]

function getMethodIcon(type: PaymentMethodType) {
  switch (type) {
    case 'bankgiro':
    case 'plusgiro':
      return Building
    case 'swish':
      return Smartphone
    case 'card':
      return CreditCard
    case 'cash':
      return Banknote
    default:
      return Building
  }
}

export default function PaymentMethodsPage() {
  const [methods, setMethods] = useState<PaymentMethod[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingMethod, setEditingMethod] = useState<PaymentMethod | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState<string | null>(null)

  // Company settings for BG/PG/Swish
  const [companyBankgiro, setCompanyBankgiro] = useState('')
  const [companyPlusgiro, setCompanyPlusgiro] = useState('')
  const [companySwish, setCompanySwish] = useState('')
  const [isSavingCompany, setIsSavingCompany] = useState(false)

  // Form state
  const [formType, setFormType] = useState<PaymentMethodType>('bankgiro')
  const [formAccountNumber, setFormAccountNumber] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formLinkedAccount, setFormLinkedAccount] = useState('')
  const [formIsDefault, setFormIsDefault] = useState(false)

  const { toast } = useToast()
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setIsLoading(true)

    // Fetch payment methods
    const response = await fetch('/api/payment-methods')
    const result = await response.json()
    if (result.data) {
      setMethods(result.data)
    }

    // Fetch company settings
    const { data: settings } = await supabase
      .from('company_settings')
      .select('bankgiro, plusgiro, swish_number')
      .single()

    if (settings) {
      setCompanyBankgiro(settings.bankgiro || '')
      setCompanyPlusgiro(settings.plusgiro || '')
      setCompanySwish(settings.swish_number || '')
    }

    setIsLoading(false)
  }

  function openCreateDialog() {
    setEditingMethod(null)
    setFormType('bankgiro')
    setFormAccountNumber('')
    setFormDescription('')
    setFormLinkedAccount('')
    setFormIsDefault(false)
    setDialogOpen(true)
  }

  function openEditDialog(method: PaymentMethod) {
    setEditingMethod(method)
    setFormType(method.method_type)
    setFormAccountNumber(method.account_number || '')
    setFormDescription(method.description || '')
    setFormLinkedAccount(method.linked_bank_account || '')
    setFormIsDefault(method.is_default)
    setDialogOpen(true)
  }

  async function handleSave() {
    setIsSaving(true)

    try {
      if (editingMethod) {
        // Update
        const response = await fetch(`/api/payment-methods/${editingMethod.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            method_type: formType,
            account_number: formAccountNumber || undefined,
            description: formDescription || undefined,
            linked_bank_account: formLinkedAccount || undefined,
            is_default: formIsDefault,
          }),
        })

        if (!response.ok) {
          const result = await response.json()
          throw new Error(result.error)
        }

        toast({ title: 'Uppdaterad', description: 'Betalningsmetod uppdaterad' })
      } else {
        // Create
        const response = await fetch('/api/payment-methods', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            method_type: formType,
            account_number: formAccountNumber || undefined,
            description: formDescription || undefined,
            linked_bank_account: formLinkedAccount || undefined,
            is_default: formIsDefault,
          }),
        })

        if (!response.ok) {
          const result = await response.json()
          throw new Error(result.error)
        }

        toast({ title: 'Skapad', description: 'Betalningsmetod tillagd' })
      }

      setDialogOpen(false)
      await fetchData()
    } catch (err) {
      toast({
        title: 'Fel',
        description: err instanceof Error ? err.message : 'Något gick fel',
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setIsDeleting(id)

    try {
      const response = await fetch(`/api/payment-methods/${id}`, { method: 'DELETE' })

      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.error)
      }

      toast({ title: 'Borttagen', description: 'Betalningsmetod borttagen' })
      await fetchData()
    } catch (err) {
      toast({
        title: 'Fel',
        description: err instanceof Error ? err.message : 'Kunde inte ta bort',
        variant: 'destructive',
      })
    } finally {
      setIsDeleting(null)
    }
  }

  async function handleSaveCompanyNumbers() {
    setIsSavingCompany(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Ej inloggad')

      const { error } = await supabase
        .from('company_settings')
        .update({
          bankgiro: companyBankgiro || null,
          plusgiro: companyPlusgiro || null,
          swish_number: companySwish || null,
        })
        .eq('user_id', user.id)

      if (error) throw error

      toast({ title: 'Sparat', description: 'Företagets betalningsnummer uppdaterade' })
    } catch (err) {
      toast({
        title: 'Fel',
        description: err instanceof Error ? err.message : 'Kunde inte spara',
        variant: 'destructive',
      })
    } finally {
      setIsSavingCompany(false)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push('/settings')}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Tillbaka
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">Betalningsmetoder</h1>
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="py-4">
                <div className="h-12 bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push('/settings')}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Tillbaka
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Betalningsmetoder</h1>
            <p className="text-muted-foreground">
              Konfigurera Bankgiro, Plusgiro, Swish och andra betalningsmetoder
            </p>
          </div>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Lägg till
        </Button>
      </div>

      {/* Company payment numbers */}
      <Card>
        <CardHeader>
          <CardTitle>Företagets betalningsnummer</CardTitle>
          <CardDescription>
            Dessa nummer visas på dina fakturor och i betalningsinstruktioner
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="company-bg">Bankgiro</Label>
              <Input
                id="company-bg"
                placeholder="XXX-XXXX"
                value={companyBankgiro}
                onChange={(e) => setCompanyBankgiro(e.target.value)}
              />
              {companyBankgiro && (
                <p className="text-xs text-muted-foreground mt-1">
                  Formaterat: {formatBankgiroNumber(companyBankgiro) || 'Ogiltigt format'}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="company-pg">Plusgiro</Label>
              <Input
                id="company-pg"
                placeholder="XXXXXX-X"
                value={companyPlusgiro}
                onChange={(e) => setCompanyPlusgiro(e.target.value)}
              />
              {companyPlusgiro && (
                <p className="text-xs text-muted-foreground mt-1">
                  Formaterat: {formatPlusgiroNumber(companyPlusgiro) || 'Ogiltigt format'}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="company-swish">Swish-nummer</Label>
              <Input
                id="company-swish"
                placeholder="123 456 78 90"
                value={companySwish}
                onChange={(e) => setCompanySwish(e.target.value)}
              />
            </div>
          </div>

          <Button
            onClick={handleSaveCompanyNumbers}
            disabled={isSavingCompany}
            size="sm"
          >
            {isSavingCompany ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : null}
            Spara betalningsnummer
          </Button>
        </CardContent>
      </Card>

      {/* Payment methods list */}
      <Card>
        <CardHeader>
          <CardTitle>Betalningsmetoder</CardTitle>
          <CardDescription>
            Koppla betalningsmetoder till BAS-konton för automatisk bokföring
          </CardDescription>
        </CardHeader>
        <CardContent>
          {methods.length === 0 ? (
            <div className="text-center py-8">
              <CreditCard className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                Inga betalningsmetoder konfigurerade än
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={openCreateDialog}
              >
                <Plus className="h-4 w-4 mr-1" />
                Lägg till första
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {methods.map((method) => {
                const Icon = getMethodIcon(method.method_type)
                return (
                  <div
                    key={method.id}
                    className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">
                            {METHOD_TYPE_OPTIONS.find((o) => o.value === method.method_type)?.label}
                          </p>
                          {method.is_default && (
                            <Badge variant="default" className="text-[10px] px-1.5 py-0">
                              <Star className="h-2.5 w-2.5 mr-0.5" />
                              Standard
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {method.account_number && `Nr: ${method.account_number}`}
                          {method.linked_bank_account && ` | BAS-konto: ${method.linked_bank_account}`}
                          {method.description && ` | ${method.description}`}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => openEditDialog(method)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(method.id)}
                        disabled={isDeleting === method.id}
                      >
                        {isDeleting === method.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingMethod ? 'Redigera betalningsmetod' : 'Ny betalningsmetod'}
            </DialogTitle>
            <DialogDescription>
              Konfigurera en betalningsmetod och koppla den till ett BAS-konto.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Typ</Label>
              <Select value={formType} onValueChange={(v) => setFormType(v as PaymentMethodType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METHOD_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="form-account">Kontonummer / Nummer</Label>
              <Input
                id="form-account"
                placeholder={
                  formType === 'bankgiro'
                    ? 'XXX-XXXX'
                    : formType === 'plusgiro'
                    ? 'XXXXXX-X'
                    : formType === 'swish'
                    ? '123 456 78 90'
                    : 'Kontonummer'
                }
                value={formAccountNumber}
                onChange={(e) => setFormAccountNumber(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="form-desc">Beskrivning</Label>
              <Input
                id="form-desc"
                placeholder="T.ex. Huvudkonto SEB"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="form-bas">Kopplat BAS-konto (4 siffror)</Label>
              <Input
                id="form-bas"
                placeholder="T.ex. 1930"
                value={formLinkedAccount}
                onChange={(e) =>
                  setFormLinkedAccount(e.target.value.replace(/\D/g, '').slice(0, 4))
                }
                maxLength={4}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground mt-1">
                1910 = Kassa, 1920 = Plusgiro, 1930 = Företagskonto, 1940 = Övriga bankkonton
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="form-default"
                checked={formIsDefault}
                onChange={(e) => setFormIsDefault(e.target.checked)}
                className="rounded border-border"
              />
              <Label htmlFor="form-default" className="text-sm font-normal cursor-pointer">
                Anges som standardmetod
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isSaving}>
              Avbryt
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : null}
              {editingMethod ? 'Uppdatera' : 'Skapa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
