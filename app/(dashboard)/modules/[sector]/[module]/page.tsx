import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, BookOpen, BarChart3, FileDown, Cog } from 'lucide-react'
import { getModuleBySlug, CATEGORY_LABELS, type ModuleCategory } from '@/lib/modules-data'
import { Badge } from '@/components/ui/badge'
import { ModuleToggle } from '@/components/modules/ModuleToggle'

const CATEGORY_META: Record<ModuleCategory, {
  icon: typeof BookOpen
  color: string
  bgColor: string
  borderColor: string
}> = {
  bokforing: {
    icon: BookOpen,
    color: 'text-primary',
    bgColor: 'bg-primary/8',
    borderColor: 'border-primary/10',
  },
  rapport: {
    icon: BarChart3,
    color: 'text-accent',
    bgColor: 'bg-accent/8',
    borderColor: 'border-accent/10',
  },
  import: {
    icon: FileDown,
    color: 'text-success',
    bgColor: 'bg-success/8',
    borderColor: 'border-success/10',
  },
  operativ: {
    icon: Cog,
    color: 'text-muted-foreground',
    bgColor: 'bg-muted/60',
    borderColor: 'border-border',
  },
}

export default async function ModuleDetailPage({
  params,
}: {
  params: Promise<{ sector: string; module: string }>
}) {
  const { sector: sectorSlug, module: moduleSlug } = await params
  const result = getModuleBySlug(sectorSlug, moduleSlug)

  if (!result) {
    notFound()
  }

  const { sector, module: mod } = result
  const SectorIcon = sector.icon
  const catMeta = CATEGORY_META[mod.cat]
  const CatIcon = catMeta.icon

  return (
    <div className="space-y-8 stagger-enter">
      {/* Navigation */}
      <div>
        <Link
          href={`/modules/${sectorSlug}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {sector.name}
        </Link>
      </div>

      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-start gap-5">
          <div className={`flex items-center justify-center w-12 h-12 rounded-xl ${catMeta.bgColor} ring-1 ${catMeta.borderColor}`}>
            <CatIcon className={`h-6 w-6 ${catMeta.color}`} strokeWidth={1.5} />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              {mod.name}
            </h1>
            <p className="text-muted-foreground mt-1">
              {mod.desc}
            </p>
          </div>
        </div>

        {/* Badges */}
        <div className="flex items-center gap-2">
          <Badge
            className={`${catMeta.bgColor} ${catMeta.color} border-transparent`}
          >
            {CATEGORY_LABELS[mod.cat]}
          </Badge>
          <Badge variant="secondary" className="gap-1.5">
            <SectorIcon className="h-3 w-3" strokeWidth={1.5} />
            {sector.name}
          </Badge>
        </div>
      </div>

      {/* Separator */}
      <div className="h-px bg-border" />

      {/* Long description */}
      <div className="prose prose-sm max-w-none">
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          {mod.longDesc.split('. Nyckelfunktioner: ').map((part, i) => {
            if (i === 0) {
              return (
                <div key={i}>
                  <h2 className="text-base font-semibold text-foreground mt-0 mb-2">
                    Beskrivning
                  </h2>
                  <p className="text-sm text-muted-foreground leading-relaxed m-0">
                    {part}{mod.longDesc.includes('Nyckelfunktioner') ? '' : ''}
                  </p>
                </div>
              )
            }
            return (
              <div key={i}>
                <h2 className="text-base font-semibold text-foreground mt-0 mb-2">
                  Nyckelfunktioner
                </h2>
                <ul className="space-y-1.5 m-0 p-0 list-none">
                  {part.split('; ').map((feature, j) => (
                    <li
                      key={j}
                      className="flex items-start gap-2 text-sm text-muted-foreground"
                    >
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary/40 flex-shrink-0" />
                      {feature.replace(/,\s*$/, '')}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      </div>

      {/* Toggle */}
      <ModuleToggle sectorSlug={sectorSlug} moduleSlug={moduleSlug} />
    </div>
  )
}
