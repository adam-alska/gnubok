'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Sun, Moon, Monitor } from 'lucide-react'
import { cn } from '@/lib/utils'

const themes = [
  {
    value: 'light',
    label: 'Ljust',
    icon: Sun,
    description: 'Ljust tema med varma toner',
  },
  {
    value: 'dark',
    label: 'Mörkt',
    icon: Moon,
    description: 'Mörkt tema med varma toner',
  },
  {
    value: 'system',
    label: 'System',
    icon: Monitor,
    description: 'Följer enhetens inställning',
  },
] as const

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Utseende</CardTitle>
          <CardDescription>Välj hur appen ska se ut</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            {themes.map((t) => (
              <div key={t.value} className="h-24 rounded-lg border bg-muted animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Utseende</CardTitle>
        <CardDescription>Välj hur appen ska se ut</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4">
          {themes.map((t) => {
            const Icon = t.icon
            const isActive = theme === t.value
            return (
              <button
                key={t.value}
                onClick={() => setTheme(t.value)}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors cursor-pointer',
                  isActive
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/40 hover:bg-muted/50'
                )}
              >
                <Icon className={cn('h-6 w-6', isActive ? 'text-primary' : 'text-muted-foreground')} />
                <span className={cn('text-sm font-medium', isActive ? 'text-primary' : 'text-foreground')}>
                  {t.label}
                </span>
                <span className="text-xs text-muted-foreground text-center">
                  {t.description}
                </span>
              </button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
