'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FlaskConical, X, Replace } from 'lucide-react'

interface MockDataBannerProps {
  importedAt: string | null
  onClear: () => void
  onReplace: () => void
}

export default function MockDataBanner({ importedAt, onClear, onReplace }: MockDataBannerProps) {
  const formatted = importedAt
    ? new Date(importedAt).toLocaleString('sv-SE', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : null

  return (
    <Card className="border-l-4 border-l-amber-500 bg-amber-50/50 dark:bg-amber-950/20 dark:border-l-amber-400">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center gap-3">
          <FlaskConical className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
              Testdata aktivt
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
              Rapporten visar importerad testdata istället för bokföringsdata.
              {formatted && <> Importerat {formatted}.</>}
            </p>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <Button variant="outline" size="sm" onClick={onReplace} className="h-7 text-xs">
              <Replace className="h-3.5 w-3.5 mr-1" />
              Ersätt
            </Button>
            <Button variant="outline" size="sm" onClick={onClear} className="h-7 text-xs">
              <X className="h-3.5 w-3.5 mr-1" />
              Rensa
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
