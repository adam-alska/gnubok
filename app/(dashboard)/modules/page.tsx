import Link from 'next/link'
import { Layers } from 'lucide-react'
import { sectors } from '@/lib/modules-data'

export default function ModulesPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Företagsmoduler
        </h1>
        <p className="text-muted-foreground mt-1">
          Välj din bransch för att se anpassade moduler och funktioner.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <Link
          href="/modules/alla"
          className="group flex items-center gap-3.5 rounded-xl border border-accent/20 bg-accent/5 px-4 py-3.5 transition-all duration-200 hover:border-accent/40 hover:bg-accent/10"
        >
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-accent/12 text-accent shrink-0 transition-transform duration-200 group-hover:scale-105">
            <Layers className="h-5 w-5" strokeWidth={1.5} />
          </div>
          <span className="text-sm font-medium text-accent truncate">
            Visa alla
          </span>
        </Link>

        {sectors.map((sector) => {
          const Icon = sector.icon
          return (
            <Link
              key={sector.slug}
              href={`/modules/${sector.slug}`}
              className="group flex items-center gap-3.5 rounded-xl border border-border/50 bg-card px-4 py-3.5 transition-all duration-200 hover:border-border hover:bg-secondary/50 hover:shadow-sm"
            >
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted/60 text-muted-foreground shrink-0 transition-all duration-200 group-hover:bg-primary/10 group-hover:text-primary group-hover:scale-105">
                <Icon className="h-5 w-5" strokeWidth={1.5} />
              </div>
              <span className="text-sm font-medium text-foreground/80 truncate transition-colors duration-200 group-hover:text-foreground">
                {sector.name}
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
