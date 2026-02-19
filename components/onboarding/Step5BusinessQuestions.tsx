'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Loader2, ArrowRight, ArrowLeft, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import type { BusinessProfile, OnboardingSectorQuestion } from '@/types/onboarding'

interface Step5Props {
  sectorSlug: string
  initialProfile: BusinessProfile
  onNext: (data: { business_profile: BusinessProfile }) => void
  onBack: () => void
  isSaving: boolean
}

export default function Step5BusinessQuestions({
  sectorSlug,
  initialProfile,
  onNext,
  onBack,
  isSaving,
}: Step5Props) {
  const [questions, setQuestions] = useState<OnboardingSectorQuestion[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [profile, setProfile] = useState<BusinessProfile>(initialProfile)

  // Fetch questions for the sector
  useEffect(() => {
    async function loadQuestions() {
      setIsLoading(true)
      try {
        const res = await fetch(`/api/onboarding/sector-questions?sector=${sectorSlug}`)
        const json = await res.json()
        if (json.data?.questions) {
          setQuestions(json.data.questions)
        }
      } catch (err) {
        console.error('Failed to load sector questions:', err)
      }
      setIsLoading(false)
    }
    loadQuestions()
  }, [sectorSlug])

  const handleBooleanChange = (key: string, value: boolean) => {
    setProfile(prev => ({ ...prev, [key]: value }))
  }

  const handleSelectChange = (key: string, value: string) => {
    setProfile(prev => ({ ...prev, [key]: value }))
  }

  const handleMultiSelectChange = (key: string, value: string) => {
    setProfile(prev => {
      const current = (prev[key] as string[]) || []
      const updated = current.includes(value)
        ? current.filter(v => v !== value)
        : [...current, value]
      return { ...prev, [key]: updated }
    })
  }

  const handleNext = () => {
    onNext({ business_profile: profile })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  // If no questions for this sector, auto-advance
  if (questions.length === 0) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Berätta om din verksamhet</h1>
          <p className="text-muted-foreground mt-2">
            Vi har inga specifika frågor för er bransch. Tryck &quot;Fortsätt&quot; för att gå vidare till
            modulvalet.
          </p>
        </div>
        <div className="flex justify-between">
          <Button type="button" variant="ghost" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Tillbaka
          </Button>
          <Button onClick={handleNext} disabled={isSaving} size="lg">
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
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Berätta om din verksamhet</h1>
        <p className="text-muted-foreground mt-2">
          Vi anvander dina svar for att rekommendera ratt moduler.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <MessageSquare className="h-5 w-5 text-primary" />
            Nagra snabba fragor
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {questions.map((q, idx) => (
            <motion.div
              key={q.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05, duration: 0.2 }}
            >
              {q.type === 'boolean' && (
                <div className="flex items-center justify-between gap-4 py-2">
                  <Label htmlFor={q.id} className="text-sm font-normal cursor-pointer flex-1">
                    {q.question}
                  </Label>
                  <Switch
                    id={q.id}
                    checked={(profile[q.profileKey] as boolean) || false}
                    onCheckedChange={(checked) => handleBooleanChange(q.profileKey, checked)}
                  />
                </div>
              )}

              {q.type === 'select' && q.options && (
                <div className="space-y-2">
                  <Label className="text-sm font-normal">{q.question}</Label>
                  <div className="flex flex-wrap gap-2">
                    {q.options.map(opt => {
                      const isSelected = profile[q.profileKey] === opt.value
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => handleSelectChange(q.profileKey, opt.value)}
                          className={cn(
                            'px-3 py-1.5 rounded-full text-sm border transition-all',
                            isSelected
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-background border-input hover:border-primary/50 text-foreground'
                          )}
                        >
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {q.type === 'multi_select' && q.options && (
                <div className="space-y-2">
                  <Label className="text-sm font-normal">{q.question}</Label>
                  <div className="flex flex-wrap gap-2">
                    {q.options.map(opt => {
                      const currentSelection = (profile[q.profileKey] as string[]) || []
                      const isSelected = currentSelection.includes(opt.value)
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => handleMultiSelectChange(q.profileKey, opt.value)}
                          className={cn(
                            'px-3 py-1.5 rounded-full text-sm border transition-all',
                            isSelected
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-background border-input hover:border-primary/50 text-foreground'
                          )}
                        >
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>
                  {((profile[q.profileKey] as string[]) || []).length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {((profile[q.profileKey] as string[]) || []).length} valda
                    </p>
                  )}
                </div>
              )}

              {idx < questions.length - 1 && (
                <div className="border-t border-border/40 mt-4" />
              )}
            </motion.div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Tillbaka
        </Button>
        <Button onClick={handleNext} disabled={isSaving} size="lg">
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
    </div>
  )
}
