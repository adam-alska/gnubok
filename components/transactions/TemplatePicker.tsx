'use client'

import { useState, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Search, ChevronDown, ChevronUp, AlertTriangle, Info } from 'lucide-react'
import {
  getCommonTemplates,
  getAdvancedTemplates,
  searchTemplates,
  type BookingTemplate,
  type TemplateGroup,
} from '@/lib/bookkeeping/booking-templates'
import type { EntityType } from '@/types'
import type { SuggestedTemplate } from '@/lib/transactions/category-suggestions'

const GROUP_ORDER: TemplateGroup[] = [
  'premises', 'vehicle', 'it_software', 'office_supplies', 'marketing',
  'travel', 'representation', 'insurance', 'professional_services',
  'bank_finance', 'telecom', 'education', 'personnel', 'revenue',
  'financial', 'private_transfers', 'equipment',
]

const GROUP_LABELS: Record<TemplateGroup, string> = {
  premises: 'Lokalkostnader',
  vehicle: 'Fordon',
  it_software: 'IT & Programvara',
  office_supplies: 'Kontorsmaterial',
  marketing: 'Marknadsföring',
  travel: 'Resor & Transport',
  representation: 'Representation',
  insurance: 'Försäkringar',
  professional_services: 'Professionella tjänster',
  bank_finance: 'Bank & Finans',
  telecom: 'Telekom & Internet',
  education: 'Utbildning',
  personnel: 'Personal',
  revenue: 'Intäkter',
  financial: 'Finansiella poster',
  private_transfers: 'Privata transaktioner',
  equipment: 'Inventarier & Utrustning',
}

function getVatLabel(template: BookingTemplate): string | null {
  if (!template.vat_treatment) return null
  switch (template.vat_treatment) {
    case 'standard_25': return '25% moms'
    case 'reduced_12': return '12% moms'
    case 'reduced_6': return '6% moms'
    case 'reverse_charge': return 'Omvänd moms'
    case 'export': return 'Momsfri (export)'
    case 'exempt': return 'Momsfri'
    default: return null
  }
}

function groupTemplates(templates: BookingTemplate[]): Map<TemplateGroup, BookingTemplate[]> {
  const grouped = new Map<TemplateGroup, BookingTemplate[]>()
  for (const t of templates) {
    const list = grouped.get(t.group) || []
    list.push(t)
    grouped.set(t.group, list)
  }
  return grouped
}

interface TemplateCardProps {
  template: BookingTemplate
  selected: boolean
  onClick: () => void
  compact?: boolean
}

function TemplateCard({ template, selected, onClick, compact }: TemplateCardProps) {
  const vatLabel = getVatLabel(template)

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors hover:bg-muted/50 ${
        selected
          ? 'border-primary bg-primary/5 ring-1 ring-primary'
          : 'border-border'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className={`font-medium ${compact ? 'text-sm' : 'text-sm'} leading-tight`}>
            {template.name_sv}
          </p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-xs font-mono text-muted-foreground">
              D: {template.debit_account} &middot; K: {template.credit_account}
            </span>
            {vatLabel && (
              <Badge
                variant="secondary"
                className={`text-[10px] px-1.5 py-0 ${
                  template.vat_treatment === 'reverse_charge'
                    ? 'bg-warning/10 text-warning-foreground'
                    : ''
                }`}
              >
                {vatLabel}
              </Badge>
            )}
            {template.requires_vat_registration_data && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-warning/30 text-warning-foreground gap-0.5">
                <AlertTriangle className="h-2.5 w-2.5" />
                Kräver momsreg.nr
              </Badge>
            )}
          </div>
        </div>
        {template.requires_review && (
          <Info className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
        )}
      </div>
      {template.special_rules_sv && !compact && (
        <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">
          {template.special_rules_sv}
        </p>
      )}
    </button>
  )
}

interface TemplatePickerProps {
  direction: 'expense' | 'income'
  entityType?: EntityType
  suggestedTemplates?: SuggestedTemplate[]
  recentTemplateIds?: string[]
  onSelect: (template: BookingTemplate) => void
  selectedTemplateId?: string
}

export default function TemplatePicker({
  direction,
  entityType,
  suggestedTemplates,
  onSelect,
  selectedTemplateId,
}: TemplatePickerProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Map direction to template direction filter (transfers show in both)
  const templateDirection = direction === 'income' ? 'income' : 'expense'

  const commonTemplates = useMemo(
    () => getCommonTemplates(entityType, templateDirection),
    [entityType, templateDirection]
  )

  const advancedTemplates = useMemo(
    () => getAdvancedTemplates(entityType, templateDirection),
    [entityType, templateDirection]
  )

  // Also include transfer templates in both directions
  const commonTransfers = useMemo(
    () => getCommonTemplates(entityType, 'transfer'),
    [entityType]
  )
  const advancedTransfers = useMemo(
    () => getAdvancedTemplates(entityType, 'transfer'),
    [entityType]
  )

  const allCommon = useMemo(
    () => [...commonTemplates, ...commonTransfers],
    [commonTemplates, commonTransfers]
  )
  const allAdvanced = useMemo(
    () => [...advancedTemplates, ...advancedTransfers],
    [advancedTemplates, advancedTransfers]
  )

  // Search results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null
    return searchTemplates(searchQuery, entityType).filter((t) => {
      if (t.direction === templateDirection || t.direction === 'transfer') return true
      return false
    })
  }, [searchQuery, entityType, templateDirection])

  // Group templates by group for display
  const commonGrouped = useMemo(() => groupTemplates(allCommon), [allCommon])
  const advancedGrouped = useMemo(() => groupTemplates(allAdvanced), [allAdvanced])

  const handleSelect = (template: BookingTemplate) => {
    onSelect(template)
  }

  // Suggested templates section
  const hasSuggestions = suggestedTemplates && suggestedTemplates.length > 0

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="relative px-4 pt-3 pb-2">
        <Search className="absolute left-7 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground mt-0.5" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Sök mall..."
          className="pl-9 h-9"
        />
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-auto px-4 pb-4 space-y-4">
        {/* Search results */}
        {searchResults !== null ? (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">
              {searchResults.length === 0 ? 'Inga resultat' : `${searchResults.length} resultat`}
            </p>
            <div className="space-y-1.5">
              {searchResults.map((t) => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  selected={selectedTemplateId === t.id}
                  onClick={() => handleSelect(t)}
                />
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Suggested templates */}
            {hasSuggestions && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Föreslagna</p>
                <div className="space-y-1.5">
                  {suggestedTemplates!.slice(0, 5).map((s) => {
                    // Find the full template object
                    const fullTemplate = allCommon.find((t) => t.id === s.template_id) ||
                      allAdvanced.find((t) => t.id === s.template_id)
                    if (!fullTemplate) return null
                    return (
                      <TemplateCard
                        key={s.template_id}
                        template={fullTemplate}
                        selected={selectedTemplateId === s.template_id}
                        onClick={() => handleSelect(fullTemplate)}
                        compact
                      />
                    )
                  })}
                </div>
              </div>
            )}

            {/* Common templates grouped */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Vanliga mallar</p>
              <div className="space-y-3">
                {GROUP_ORDER.filter((g) => commonGrouped.has(g)).map((group) => (
                  <div key={group}>
                    <p className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-1">
                      {GROUP_LABELS[group]}
                    </p>
                    <div className="space-y-1.5">
                      {commonGrouped.get(group)!.map((t) => (
                        <TemplateCard
                          key={t.id}
                          template={t}
                          selected={selectedTemplateId === t.id}
                          onClick={() => handleSelect(t)}
                          compact
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Advanced templates (collapsible) */}
            {allAdvanced.length > 0 && (
              <div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-between text-xs text-muted-foreground h-8"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                >
                  Fler mallar ({allAdvanced.length})
                  {showAdvanced ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </Button>
                {showAdvanced && (
                  <div className="space-y-3 mt-2">
                    {GROUP_ORDER.filter((g) => advancedGrouped.has(g)).map((group) => (
                      <div key={group}>
                        <p className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-1">
                          {GROUP_LABELS[group]}
                        </p>
                        <div className="space-y-1.5">
                          {advancedGrouped.get(group)!.map((t) => (
                            <TemplateCard
                              key={t.id}
                              template={t}
                              selected={selectedTemplateId === t.id}
                              onClick={() => handleSelect(t)}
                              compact
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
