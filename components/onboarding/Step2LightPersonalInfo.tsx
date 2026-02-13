'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, ArrowRight, ArrowLeft } from 'lucide-react'

interface Step2LightProps {
  initialData: { company_name?: string }
  onNext: (data: { company_name: string }) => void
  onBack: () => void
  isSaving: boolean
}

export default function Step2LightPersonalInfo({
  initialData,
  onNext,
  onBack,
  isSaving,
}: Step2LightProps) {
  const [name, setName] = useState(initialData.company_name || '')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Namn krävs')
      return
    }
    setError(null)
    onNext({ company_name: trimmed })
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Dina uppgifter</h1>
        <p className="text-muted-foreground mt-2">
          Ange ditt namn som det visas i appen
        </p>
      </div>

      <Card className="max-w-lg mx-auto">
        <CardHeader>
          <CardTitle>Personuppgifter</CardTitle>
          <CardDescription>
            Ditt namn används i navigeringen och för att identifiera dig.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="company_name">Fullständigt namn *</Label>
              <Input
                id="company_name"
                placeholder="Anna Andersson"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  if (error) setError(null)
                }}
              />
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </div>

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
