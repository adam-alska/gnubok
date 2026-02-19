'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/ui/page-header'
import { useToast } from '@/components/ui/use-toast'
import { AGIPreview } from '@/components/payroll/AGIPreview'
import { formatCurrency } from '@/lib/utils'
import { Plus, FileText, Send, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import type { AGIDeclaration } from '@/types/payroll'
import { AGI_STATUS_LABELS, SWEDISH_MONTHS } from '@/types/payroll'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive'> = {
  draft: 'secondary',
  submitted: 'default',
  confirmed: 'default',
}

export default function AGIPage() {
  const [declarations, setDeclarations] = useState<AGIDeclaration[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showGenerate, setShowGenerate] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const { toast } = useToast()

  const now = new Date()
  const [generateForm, setGenerateForm] = useState({
    year: now.getFullYear(),
    month: now.getMonth(), // Previous month by default
  })

  useEffect(() => {
    fetchDeclarations()
  }, [])

  async function fetchDeclarations() {
    setIsLoading(true)
    const res = await fetch('/api/agi')
    const data = await res.json()

    if (res.ok) {
      setDeclarations(data.data || [])
    } else {
      toast({
        title: 'Fel',
        description: 'Kunde inte hämta deklarationer',
        variant: 'destructive',
      })
    }
    setIsLoading(false)
  }

  async function handleGenerate() {
    setIsGenerating(true)
    try {
      const res = await fetch('/api/agi/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: generateForm.year,
          month: generateForm.month,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Generering misslyckades')
      }

      toast({
        title: 'Deklaration genererad',
        description: `AGI för ${SWEDISH_MONTHS[generateForm.month]} ${generateForm.year}`,
      })

      setShowGenerate(false)
      fetchDeclarations()
    } catch (err) {
      toast({
        title: 'Fel',
        description: err instanceof Error ? err.message : 'Något gick fel',
        variant: 'destructive',
      })
    } finally {
      setIsGenerating(false)
    }
  }

  async function markAsSubmitted(declarationId: string) {
    try {
      const res = await fetch(`/api/agi/${declarationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'submitted' }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Kunde inte uppdatera')
      }

      toast({ title: 'Markerad som inskickad' })
      fetchDeclarations()
    } catch (err) {
      toast({
        title: 'Fel',
        description: err instanceof Error ? err.message : 'Något gick fel',
        variant: 'destructive',
      })
    }
  }

  async function markAsConfirmed(declarationId: string) {
    try {
      const res = await fetch(`/api/agi/${declarationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'confirmed' }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Kunde inte uppdatera')
      }

      toast({ title: 'Markerad som bekräftad' })
      fetchDeclarations()
    } catch (err) {
      toast({
        title: 'Fel',
        description: err instanceof Error ? err.message : 'Något gick fel',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Arbetsgivardeklaration (AGI)"
        description="Månatlig redovisning av löner och skatter till Skatteverket"
        action={
          <Button onClick={() => setShowGenerate(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Generera deklaration
          </Button>
        }
      />

      {/* Info card */}
      <Card className="border-primary/20">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <FileText className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <p className="font-medium">Om arbetsgivardeklarationen</p>
              <p className="text-sm text-muted-foreground mt-1">
                Arbetsgivardeklarationen (AGI) ska lämnas till Skatteverket senast den 12:e i
                månaden efter löneutbetalningen. För företag med fler än 15 anställda är
                sista dag den 26:e. Deklarationen innehåller individuppgifter per anställd
                med bruttolöner, preliminär skatt och arbetsgivaravgifter.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Declarations list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <Card key={i} className="animate-pulse">
              <CardContent className="py-4">
                <div className="flex justify-between">
                  <div className="space-y-2">
                    <div className="h-4 bg-muted rounded w-48" />
                    <div className="h-3 bg-muted rounded w-32" />
                  </div>
                  <div className="h-6 bg-muted rounded w-20" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : declarations.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">Inga deklarationer ännu</h3>
              <p className="text-muted-foreground text-center mt-1 mb-4">
                Generera din första arbetsgivardeklaration efter att ha godkänt en lönekörning.
              </p>
              <Button onClick={() => setShowGenerate(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Generera deklaration
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {declarations.map(decl => (
            <div key={decl.id}>
              <Card>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div
                      className="flex-1 cursor-pointer"
                      onClick={() => setExpandedId(expandedId === decl.id ? null : decl.id)}
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium">
                            {SWEDISH_MONTHS[decl.period_month]} {decl.period_year}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Att betala: {formatCurrency(decl.total_payable)}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={statusVariant[decl.status] || 'secondary'}>
                        {AGI_STATUS_LABELS[decl.status]}
                      </Badge>
                      {decl.status === 'draft' && (
                        <Button size="sm" onClick={() => markAsSubmitted(decl.id)}>
                          <Send className="mr-2 h-3 w-3" />
                          Markera inskickad
                        </Button>
                      )}
                      {decl.status === 'submitted' && (
                        <Button size="sm" variant="outline" onClick={() => markAsConfirmed(decl.id)}>
                          Bekräfta
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setExpandedId(expandedId === decl.id ? null : decl.id)}
                      >
                        {expandedId === decl.id ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
              {expandedId === decl.id && (
                <div className="mt-4">
                  <AGIPreview declaration={decl} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Generate dialog */}
      <Dialog open={showGenerate} onOpenChange={setShowGenerate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generera arbetsgivardeklaration</DialogTitle>
            <DialogDescription>
              Välj period att generera AGI för. Det måste finnas godkända lönekörningar för perioden.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>År</Label>
              <Input
                type="number"
                min={2020}
                max={2100}
                value={generateForm.year}
                onChange={(e) => setGenerateForm(prev => ({ ...prev, year: parseInt(e.target.value) }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Månad</Label>
              <Input
                type="number"
                min={1}
                max={12}
                value={generateForm.month}
                onChange={(e) => setGenerateForm(prev => ({ ...prev, month: parseInt(e.target.value) }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerate(false)}>
              Avbryt
            </Button>
            <Button onClick={handleGenerate} disabled={isGenerating}>
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Genererar...
                </>
              ) : (
                'Generera'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
