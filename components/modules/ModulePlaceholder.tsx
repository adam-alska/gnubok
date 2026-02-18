import { Construction } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { ModuleItem } from '@/lib/modules-data'
import { ModuleWorkspaceShell } from './ModuleWorkspaceShell'

interface ModulePlaceholderProps {
  module: ModuleItem
  sectorSlug: string
}

export function ModulePlaceholder({ module: mod, sectorSlug }: ModulePlaceholderProps) {
  // Parse longDesc into key features if it contains "Nyckelfunktioner:"
  const parts = mod.longDesc.split('Nyckelfunktioner:')
  const description = parts[0]?.trim()
  const features = parts[1]?.trim().split(/[,;]/).map(f => f.trim()).filter(Boolean)

  return (
    <ModuleWorkspaceShell
      title={mod.name}
      description={mod.desc}
      category={mod.cat}
      backHref={`/modules/${sectorSlug}`}
      settingsHref={`/modules/${sectorSlug}/${mod.slug}`}
    >
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="relative mb-6">
          <div className="absolute inset-0 -m-4 rounded-full bg-gradient-to-br from-secondary/60 to-muted/30 blur-xl" />
          <div className="relative p-5 rounded-full bg-gradient-to-br from-muted/80 to-secondary/50 ring-1 ring-border/20">
            <Construction className="h-8 w-8 text-muted-foreground" />
          </div>
        </div>

        <Badge variant="outline" className="mb-4 text-xs text-amber-600 border-amber-300 bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:bg-amber-950">
          Under utveckling
        </Badge>

        <h3 className="text-lg font-medium mb-2">Kommer snart</h3>

        {description && (
          <p className="text-sm text-muted-foreground max-w-md mb-4 text-balance">
            {description}
          </p>
        )}

        {features && features.length > 0 && (
          <div className="text-left max-w-md w-full mt-2 rounded-lg border border-border/60 bg-muted/30 p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Planerade funktioner
            </p>
            <ul className="space-y-1.5">
              {features.map((feature, i) => (
                <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                  <span className="text-primary mt-1 text-xs">&#x25CF;</span>
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </ModuleWorkspaceShell>
  )
}
