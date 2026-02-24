import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { resolveIcon } from '@/lib/extensions/icon-resolver'
import type { Sector } from '@/lib/extensions/types'

export default function SectorCard({ sector }: { sector: Sector }) {
  const Icon = resolveIcon(sector.icon)

  return (
    <Link href={`/extensions/${sector.slug}`} className="h-full">
      <Card className="group hover:border-primary/30 transition-colors cursor-pointer h-full">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 flex-shrink-0">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-medium group-hover:text-primary transition-colors">
                {sector.name}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{sector.description}</p>
              <p className="text-xs text-muted-foreground mt-1.5">
                {sector.extensions.length} tillägg
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
