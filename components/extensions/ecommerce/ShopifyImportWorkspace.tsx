'use client'

import { ShoppingBag } from 'lucide-react'
import EmptyExtensionState from '@/components/extensions/shared/EmptyExtensionState'

export default function ShopifyImportWorkspace() {
  return (
    <EmptyExtensionState
      title="Shopify-import"
      description="Import av ordrar och transaktioner från Shopify kommer snart. Du kommer kunna synkronisera din Shopify-butik automatiskt."
      icon={<ShoppingBag className="h-12 w-12 text-muted-foreground/40 mb-4" />}
    />
  )
}
