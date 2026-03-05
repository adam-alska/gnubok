import { notFound } from 'next/navigation'
import { getExtensionDefinition, getSector } from '@/lib/extensions/sectors'
import { resolveIcon } from '@/lib/extensions/icon-resolver'
import type { SectorSlug } from '@/lib/extensions/types'
import CategoryBadge from '@/components/extensions/CategoryBadge'
import ExtensionToggleButton from '@/components/extensions/ExtensionToggleButton'
import Link from 'next/link'

export default async function ExtensionDetailPage({
  params,
}: {
  params: Promise<{ sector: string; extension: string }>
}) {
  const { sector: sectorSlug, extension: extensionSlug } = await params

  const definition = getExtensionDefinition(sectorSlug, extensionSlug)
  if (!definition) notFound()

  const sector = getSector(sectorSlug as SectorSlug)
   
  const Icon = resolveIcon(definition.icon)

  const dataPatternLabels: Record<string, string> = {
    core: 'Använder bokföringsdata',
    manual: 'Manuell inmatning',
    both: 'Bokföringsdata + manuell inmatning',
  }

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-6">
        <Link href="/extensions" className="hover:text-foreground transition-colors">
          Tillägg
        </Link>
        <span>/</span>
        <Link
          href={`/extensions/${sectorSlug}`}
          className="hover:text-foreground transition-colors"
        >
          {sector?.name ?? sectorSlug}
        </Link>
        <span>/</span>
        <span className="text-foreground">{definition.name}</span>
      </nav>

      {/* Header with toggle */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 flex-shrink-0">
            <Icon className="h-7 w-7 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{definition.name}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{definition.description}</p>
            <div className="mt-2">
              <CategoryBadge category={definition.category} />
            </div>
          </div>
        </div>
        <ExtensionToggleButton
          sectorSlug={sectorSlug}
          extensionSlug={extensionSlug}
          subscriptionNotice={definition.subscriptionNotice}
        />
      </div>

      {/* Details */}
      <div className="space-y-6">
        <div>
          <h2 className="text-sm font-semibold mb-2">Beskrivning</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {definition.longDescription}
          </p>
        </div>

        <div>
          <h2 className="text-sm font-semibold mb-2">Datakälla</h2>
          <p className="text-sm text-muted-foreground">
            {dataPatternLabels[definition.dataPattern]}
          </p>
          {definition.readsCoreTables && definition.readsCoreTables.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              Läser från: {definition.readsCoreTables.join(', ')}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
