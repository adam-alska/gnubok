'use client'

import { useState } from 'react'
import { Settings2, ChevronDown, ChevronRight, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { KPI_DEFINITIONS, getDefaultPreferences } from '@/lib/reports/kpi-definitions'
import type { KPIPreferences } from '@/types'

interface KPISettingsDialogProps {
  preferences: KPIPreferences
  onSave: (prefs: KPIPreferences) => void
  saving: boolean
}

export function KPISettingsDialog({ preferences, onSave, saving }: KPISettingsDialogProps) {
  const [draft, setDraft] = useState<KPIPreferences>(preferences)
  const [expandedKpi, setExpandedKpi] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  function handleOpen(isOpen: boolean) {
    if (isOpen) setDraft(preferences)
    setOpen(isOpen)
  }

  function toggleKpi(id: string) {
    setDraft((prev) => {
      const visible = prev.visibleKpis.includes(id)
        ? prev.visibleKpis.filter((k) => k !== id)
        : [...prev.visibleKpis, id]
      return { ...prev, visibleKpis: visible }
    })
  }

  function setAccountOverride(kpiId: string, value: string) {
    const accounts = value
      .split(',')
      .map((s) => s.trim())
      .filter((s) => /^\d{4}$/.test(s))

    setDraft((prev) => ({
      ...prev,
      accountOverrides: {
        ...prev.accountOverrides,
        [kpiId]: accounts,
      },
    }))
  }

  function clearAccountOverride(kpiId: string) {
    setDraft((prev) => {
      const overrides = { ...prev.accountOverrides }
      delete overrides[kpiId]
      return { ...prev, accountOverrides: overrides }
    })
  }

  function handleReset() {
    setDraft(getDefaultPreferences())
  }

  function handleSave() {
    onSave(draft)
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Settings2 className="h-3.5 w-3.5" />
          Anpassa
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Anpassa nyckeltal</DialogTitle>
          <DialogDescription>
            Välj vilka nyckeltal som visas och justera beräkningarna.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1 mt-2">
          {KPI_DEFINITIONS.map((def) => {
            const isVisible = draft.visibleKpis.includes(def.id)
            const isExpanded = expandedKpi === def.id
            const hasOverride =
              def.customizableAccounts &&
              draft.accountOverrides[def.id] &&
              draft.accountOverrides[def.id].length > 0
            const overrideValue =
              draft.accountOverrides[def.id]?.join(', ') ?? ''

            return (
              <div
                key={def.id}
                className="rounded-lg border border-border/60 p-3"
              >
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    className="flex items-center gap-2 text-left flex-1 min-w-0"
                    onClick={() =>
                      setExpandedKpi(isExpanded ? null : def.id)
                    }
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {def.label}
                        {hasOverride && (
                          <span className="ml-1.5 text-xs text-muted-foreground font-normal">
                            (anpassad)
                          </span>
                        )}
                      </p>
                    </div>
                  </button>
                  <Switch
                    checked={isVisible}
                    onCheckedChange={() => toggleKpi(def.id)}
                  />
                </div>

                {isExpanded && (
                  <div className="mt-3 ml-5.5 space-y-2.5 text-xs text-muted-foreground">
                    <p>{def.description}</p>
                    <div>
                      <p className="font-medium text-foreground/80 mb-0.5">
                        Formel
                      </p>
                      <p className="font-mono text-[11px] bg-muted/50 rounded px-2 py-1">
                        {def.formula}
                      </p>
                    </div>
                    <div>
                      <p className="font-medium text-foreground/80 mb-0.5">
                        Konton
                      </p>
                      <p>{def.accountDescription}</p>
                    </div>

                    {def.customizableAccounts && (
                      <div className="pt-1">
                        <label className="font-medium text-foreground/80 block mb-1">
                          Anpassa konton
                        </label>
                        <input
                          type="text"
                          value={overrideValue}
                          onChange={(e) =>
                            setAccountOverride(def.id, e.target.value)
                          }
                          placeholder={def.defaultAccounts.join(', ')}
                          className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-mono tabular-nums placeholder:text-muted-foreground/50"
                        />
                        <p className="mt-1 text-[10px] text-muted-foreground/70">
                          Ange kontonummer separerade med komma (t.ex.{' '}
                          {def.defaultAccounts.slice(0, 3).join(', ')})
                        </p>
                        {hasOverride && (
                          <button
                            type="button"
                            onClick={() => clearAccountOverride(def.id)}
                            className="mt-1 text-[10px] text-primary hover:underline"
                          >
                            Återställ till standard
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="flex items-center justify-between pt-2 border-t mt-2">
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
            Återställ allt
          </button>
          <div className="flex gap-2">
            <DialogClose asChild>
              <Button variant="outline" size="sm">
                Avbryt
              </Button>
            </DialogClose>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? 'Sparar...' : 'Spara'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
