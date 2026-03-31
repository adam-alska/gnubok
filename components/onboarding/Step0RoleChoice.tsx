'use client'

import { Card } from '@/components/ui/card'
import { User, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Step0Props {
  onChooseSelf: () => void
  onChooseConsultant: () => void
}

const options = [
  {
    key: 'self',
    label: 'Jag bokför själv',
    description: 'Du driver ditt eget företag och vill hantera bokföringen.',
    icon: User,
  },
  {
    key: 'consultant',
    label: 'Jag bokför åt någon annan',
    description: 'Du är konsult eller byrå och bokför åt dina kunder.',
    icon: Users,
  },
] as const

export default function Step0RoleChoice({ onChooseSelf, onChooseConsultant }: Step0Props) {
  return (
    <div className="space-y-8">
      <div className="grid gap-3">
        {options.map((option) => {
          const Icon = option.icon
          const handler = option.key === 'self' ? onChooseSelf : onChooseConsultant
          return (
            <button
              key={option.key}
              type="button"
              onClick={handler}
              className="text-left w-full"
            >
              <Card
                className={cn(
                  'relative p-5 transition-all cursor-pointer',
                  'hover:border-primary/50 hover:shadow-sm',
                )}
              >
                <div className="flex items-start gap-4">
                  <div className="p-2.5 rounded-lg bg-muted/50">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <span className="font-medium">{option.label}</span>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {option.description}
                    </p>
                  </div>
                </div>
              </Card>
            </button>
          )
        })}
      </div>
    </div>
  )
}
