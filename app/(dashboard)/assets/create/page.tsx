'use client'

import { PageHeader } from '@/components/ui/page-header'
import { AssetForm } from '@/components/assets/AssetForm'

export default function CreateAssetPage() {
  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        title="Ny tillgång"
        description="Lägg till en ny anläggningstillgång i registret"
      />
      <AssetForm mode="create" />
    </div>
  )
}
