'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, ArrowRight, Building2, User, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { EntityType } from '@/types'

interface Step1Props {
  initialData: { entity_type?: EntityType }
  onNext: (data: { entity_type: EntityType }) => void
  isSaving: boolean
}

const entityOptions: {
  value: EntityType | string
  label: string
  description: string
  icon: typeof Building2
  disabled?: boolean
}[] = [
  {
    value: 'enskild_firma',
    label: 'Enskild firma',
    description: 'Du driver verksamhet i eget namn med F-skattsedel',
    icon: User,
  },
  {
    value: 'aktiebolag',
    label: 'Aktiebolag',
    description: 'Du har ett registrerat AB med organisationsnummer',
    icon: Building2,
  },
]

export default function Step1EntityType({ initialData, onNext, isSaving }: Step1Props) {
  const [selected, setSelected] = useState<EntityType | undefined>(initialData.entity_type)

  const handleNext = () => {
    if (!selected) {
      console.error('[onboarding] step 1: fortsätt clicked without entity type selected')
      return
    }
    onNext({ entity_type: selected })
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-3">
        {entityOptions.map((option) => {
          const Icon = option.icon
          const isSelected = selected === option.value
          return (
            <button
              key={option.value}
              type="button"
              disabled={option.disabled}
              onClick={() => !option.disabled && setSelected(option.value as EntityType)}
              className="text-left w-full"
            >
              <Card
                className={cn(
                  'relative p-4 transition-all',
                  option.disabled
                    ? 'opacity-50 cursor-not-allowed'
                    : 'cursor-pointer hover:border-primary/50',
                  isSelected && 'border-primary ring-2 ring-primary/20'
                )}
              >
                <div className="flex items-start gap-4">
                  <div className={cn(
                    'p-2.5 rounded-lg',
                    isSelected ? 'bg-primary/10' : 'bg-muted/50'
                  )}>
                    <Icon className={cn(
                      'h-5 w-5',
                      isSelected ? 'text-primary' : 'text-muted-foreground'
                    )} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{option.label}</span>
                      {option.disabled && (
                        <Badge variant="secondary" className="text-xs">Kommer snart</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {option.description}
                    </p>
                  </div>
                  {isSelected && (
                    <div className="flex-shrink-0 p-1 rounded-full bg-primary text-primary-foreground">
                      <Check className="h-3.5 w-3.5" />
                    </div>
                  )}
                </div>
              </Card>
            </button>
          )
        })}
      </div>

      <div className="flex justify-end">
        <Button
          onClick={handleNext}
          disabled={!selected || isSaving}
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
