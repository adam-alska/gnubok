import Link from 'next/link'
import { ArrowLeft, BookOpen, BarChart3, FileDown, Cog, ChevronRight } from 'lucide-react'
import { sectors, CATEGORY_LABELS, type ModuleCategory } from '@/lib/modules-data'
import { Badge } from '@/components/ui/badge'

const CATEGORY_ORDER: ModuleCategory[] = ['bokforing', 'rapport', 'import', 'operativ']

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

export default function AllaModulerPage() {
  const totalModules = sectors.reduce((sum, s) => sum + s.modules.length, 0)

  return (
    <div className="space-y-10 stagger-enter">
      {/* Navigation */}
      <div>
        <Link
          href="/modules"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Alla branscher
        </Link>
      </div>

      {/* Hero header */}
      <div className="relative">
        <div className="flex items-start gap-5">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-accent/8 text-accent ring-1 ring-accent/10">
            <BookOpen className="h-7 w-7" strokeWidth={1.5} />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              Alla moduler
            </h1>
            <p className="text-muted-foreground mt-1">
              Samtliga funktioner och moduler across alla branscher.
            </p>
            <div className="flex items-center gap-3 mt-3">
              <Badge variant="secondary" className="tabular-nums">
                {totalModules} moduler
              </Badge>
              <Badge variant="secondary" className="tabular-nums">
                {sectors.length} branscher
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Separator */}
      <div className="h-px bg-border" />

      {/* All sectors with their modules */}
      <div className="space-y-12">
        {sectors.map((sector) => {
          const Icon = sector.icon
          const grouped = CATEGORY_ORDER.map((cat) => ({
            cat,
            label: CATEGORY_LABELS[cat],
            meta: CATEGORY_META[cat],
            modules: sector.modules.filter((m) => m.cat === cat),
          })).filter((g) => g.modules.length > 0)

          return (
            <section key={sector.slug}>
              {/* Sector header */}
              <div className="flex items-center gap-3 mb-6">
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/8 text-primary ring-1 ring-primary/10">
                  <Icon className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">
                    {sector.name}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {sector.description} &middot; {sector.modules.length} moduler
                  </p>
                </div>
              </div>

              {/* Categories within sector */}
              <div className="space-y-6 pl-[52px]">
                {grouped.map((group) => {
                  const CatIcon = group.meta.icon
                  return (
                    <div key={group.cat}>
                      <div className="flex items-center gap-2 mb-3">
                        <CatIcon className={`h-3.5 w-3.5 ${group.meta.color}`} strokeWidth={1.5} />
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          {group.label}
                        </span>
                        <span className="text-xs text-muted-foreground/50 tabular-nums">
                          {group.modules.length}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {group.modules.map((mod) => (
                          <Link
                            key={mod.slug}
                            href={`/modules/${sector.slug}/${mod.slug}`}
                            className={`group relative flex items-center gap-3 rounded-xl border ${group.meta.borderColor} bg-card px-4 py-3.5 transition-all duration-200 hover:shadow-[var(--shadow-md)] hover:border-primary/20 hover:-translate-y-px`}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors duration-200">
                                {mod.name}
                              </p>
                              <p className="text-xs text-muted-foreground/70 mt-0.5 line-clamp-1">
                                {mod.desc}
                              </p>
                            </div>
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/30 flex-shrink-0 transition-all duration-200 group-hover:text-primary/60 group-hover:translate-x-0.5" />
                          </Link>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
