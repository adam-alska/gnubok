'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Loader2, ArrowRight, ArrowLeft, Sparkles, BookOpen, BarChart3, FileDown, Cog } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import type { BusinessProfile, ModuleRecommendation, GroupedRecommendations } from '@/types/onboarding'
import type { ModuleCategory } from '@/lib/modules-data'

interface Step6Props {
  sectorSlug: string
  businessProfile: BusinessProfile
  initialModules: string[]
  onNext: (data: { selected_modules: string[] }) => void
  onBack: () => void
  isSaving: boolean
}

const CATEGORY_ICONS: Record<ModuleCategory, typeof BookOpen> = {
  bokforing: BookOpen,
  rapport: BarChart3,
  import: FileDown,
  operativ: Cog,
}

const CATEGORY_LABELS: Record<ModuleCategory, string> = {
  bokforing: 'Bokforing & Skatt',
  rapport: 'Branschrapporter',
  import: 'Smart import',
  operativ: 'Operativa moduler',
}

const TIER_COLORS: Record<string, string> = {
  recommended: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  optional: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  advanced: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
}

const TIER_LABELS: Record<string, string> = {
  recommended: 'Rekommenderad',
  optional: 'Valfri',
  advanced: 'Avancerad',
}

export default function Step6RecommendedModules({
  sectorSlug,
  businessProfile,
  initialModules,
  onNext,
  onBack,
  isSaving,
}: Step6Props) {
  const [isLoading, setIsLoading] = useState(true)
  const [grouped, setGrouped] = useState<GroupedRecommendations | null>(null)
  const [allRecommendations, setAllRecommendations] = useState<ModuleRecommendation[]>([])
  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(new Set(initialModules))

  // Fetch recommendations
  useEffect(() => {
    async function loadRecommendations() {
      setIsLoading(true)
      try {
        const res = await fetch('/api/onboarding/recommend-modules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sectorSlug, businessProfile }),
        })
        const json = await res.json()
        if (json.data) {
          setGrouped(json.data.grouped)
          setAllRecommendations(json.data.recommendations)

          // Auto-select 'recommended' tier modules if no initial selection
          if (initialModules.length === 0) {
            const recommended = (json.data.recommendations as ModuleRecommendation[])
              .filter(r => r.tier === 'recommended')
              .map(r => r.moduleSlug)
            setSelectedSlugs(new Set(recommended))
          }
        }
      } catch (err) {
        console.error('Failed to load recommendations:', err)
      }
      setIsLoading(false)
    }
    loadRecommendations()
  }, [sectorSlug, businessProfile, initialModules.length])

  const toggleModule = useCallback((slug: string) => {
    setSelectedSlugs(prev => {
      const next = new Set(prev)
      if (next.has(slug)) {
        next.delete(slug)
      } else {
        next.add(slug)
      }
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    setSelectedSlugs(new Set(allRecommendations.map(r => r.moduleSlug)))
  }, [allRecommendations])

  const selectRecommended = useCallback(() => {
    setSelectedSlugs(
      new Set(
        allRecommendations.filter(r => r.tier === 'recommended').map(r => r.moduleSlug)
      )
    )
  }, [allRecommendations])

  const handleNext = () => {
    onNext({ selected_modules: Array.from(selectedSlugs) })
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Analyserar din verksamhet...</p>
      </div>
    )
  }

  if (!grouped) {
    return (
      <div className="text-center py-10">
        <p className="text-muted-foreground">Inga moduler hittades.</p>
      </div>
    )
  }

  const categories = (['bokforing', 'rapport', 'import', 'operativ'] as ModuleCategory[]).filter(
    cat => grouped[cat].length > 0
  )

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Dina rekommenderade moduler</h1>
        <p className="text-muted-foreground mt-2">
          Vi har valt ut moduler baserat pa dina svar. Du kan lagga till eller ta bort moduler.
        </p>
      </div>

      {/* Quick actions */}
      <div className="flex items-center justify-center gap-3">
        <Button variant="outline" size="sm" onClick={selectRecommended}>
          <Sparkles className="mr-1.5 h-3.5 w-3.5" />
          Rekommenderade
        </Button>
        <Button variant="outline" size="sm" onClick={selectAll}>
          Välj alla
        </Button>
        <Badge variant="secondary" className="font-normal">
          {selectedSlugs.size} valda
        </Badge>
      </div>

      {/* Module groups by category */}
      {categories.map((cat, catIdx) => {
        const Icon = CATEGORY_ICONS[cat]
        const modules = grouped[cat]
        return (
          <motion.div
            key={cat}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: catIdx * 0.1, duration: 0.3 }}
          >
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Icon className="h-4 w-4 text-primary" />
                  {CATEGORY_LABELS[cat]}
                </CardTitle>
                <CardDescription className="text-xs">
                  {modules.length} moduler tillgangliga
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-1">
                {modules.map((rec, idx) => {
                  const isChecked = selectedSlugs.has(rec.moduleSlug)
                  return (
                    <motion.div
                      key={rec.moduleSlug}
                      initial={{ opacity: 0, x: -5 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: catIdx * 0.1 + idx * 0.03, duration: 0.2 }}
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => toggleModule(rec.moduleSlug)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleModule(rec.moduleSlug) } }}
                        className={cn(
                          'w-full flex items-start gap-3 p-3 rounded-lg text-left transition-all cursor-pointer',
                          isChecked
                            ? 'bg-primary/5 hover:bg-primary/10'
                            : 'hover:bg-muted/50'
                        )}
                      >
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={() => toggleModule(rec.moduleSlug)}
                          className="mt-0.5"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={cn(
                              'font-medium text-sm',
                              isChecked && 'text-primary'
                            )}>
                              {rec.moduleName}
                            </span>
                            <Badge
                              variant="secondary"
                              className={cn(
                                'text-[10px] px-1.5 py-0 font-normal',
                                TIER_COLORS[rec.tier]
                              )}
                            >
                              {TIER_LABELS[rec.tier]}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                            {rec.reason}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  )
                })}
              </CardContent>
            </Card>
          </motion.div>
        )
      })}

      <div className="flex justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Tillbaka
        </Button>
        <Button
          onClick={handleNext}
          disabled={selectedSlugs.size === 0 || isSaving}
          size="lg"
        >
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
