'use client'

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Loader2, ArrowRight, ArrowLeft, Search, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { sectors } from '@/lib/modules-data'
import { motion, AnimatePresence } from 'framer-motion'

interface Step4Props {
  initialData: { selected_sector?: string }
  onNext: (data: { selected_sector: string }) => void
  onBack: () => void
  isSaving: boolean
}

export default function Step4SelectSector({ initialData, onNext, onBack, isSaving }: Step4Props) {
  const [selected, setSelected] = useState<string | undefined>(initialData.selected_sector)
  const [searchQuery, setSearchQuery] = useState('')

  const filteredSectors = useMemo(() => {
    if (!searchQuery.trim()) return sectors
    const q = searchQuery.toLowerCase()
    return sectors.filter(
      s =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.slug.toLowerCase().includes(q)
    )
  }, [searchQuery])

  const handleNext = () => {
    if (selected) {
      onNext({ selected_sector: selected })
    }
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Välj din bransch</h1>
        <p className="text-muted-foreground mt-2">
          Vi anpassar bokföringen, rapporter och moduler efter din verksamhet.
        </p>
      </div>

      {/* Search */}
      <div className="relative max-w-md mx-auto">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Sok bransch..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Sector grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        <AnimatePresence mode="popLayout">
          {filteredSectors.map((sector) => {
            const Icon = sector.icon
            const isSelected = selected === sector.slug
            return (
              <motion.div
                key={sector.slug}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
              >
                <button
                  type="button"
                  onClick={() => setSelected(sector.slug)}
                  className="w-full text-left"
                >
                  <Card
                    className={cn(
                      'relative p-4 transition-all h-full hover:shadow-md',
                      'cursor-pointer hover:border-primary/50',
                      isSelected && 'border-primary ring-2 ring-primary/20 bg-primary/5'
                    )}
                  >
                    {isSelected && (
                      <div className="absolute top-2 right-2 p-0.5 rounded-full bg-primary text-primary-foreground">
                        <Check className="h-3 w-3" />
                      </div>
                    )}
                    <div className="flex flex-col items-center text-center gap-2">
                      <div
                        className={cn(
                          'p-3 rounded-xl transition-colors',
                          isSelected ? 'bg-primary/10' : 'bg-muted/50'
                        )}
                      >
                        <Icon
                          className={cn(
                            'h-6 w-6',
                            isSelected ? 'text-primary' : 'text-muted-foreground'
                          )}
                        />
                      </div>
                      <div>
                        <p className={cn(
                          'font-medium text-sm leading-tight',
                          isSelected && 'text-primary'
                        )}>
                          {sector.name}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-tight">
                          {sector.description}
                        </p>
                      </div>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {sector.modules.length} moduler
                      </Badge>
                    </div>
                  </Card>
                </button>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>

      {filteredSectors.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <p>Inga branscher matchar din sokning.</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSearchQuery('')}
            className="mt-2"
          >
            Rensa sokning
          </Button>
        </div>
      )}

      <div className="flex justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Tillbaka
        </Button>
        <Button onClick={handleNext} disabled={!selected || isSaving} size="lg">
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
