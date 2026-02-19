'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ArrowUpDown } from 'lucide-react'
import {
  ASSET_STATUS_LABELS,
  type Asset,
  type AssetStatus,
} from '@/types/fixed-assets'

interface AssetTableProps {
  assets: Asset[]
  isLoading: boolean
}

const statusVariant: Record<AssetStatus, 'default' | 'secondary' | 'success' | 'warning' | 'destructive'> = {
  active: 'success',
  fully_depreciated: 'warning',
  disposed: 'secondary',
  sold: 'secondary',
  written_off: 'destructive',
}

type SortKey = 'asset_number' | 'name' | 'acquisition_date' | 'acquisition_cost' | 'book_value'
type SortDir = 'asc' | 'desc'

export function AssetTable({ assets, isLoading }: AssetTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('asset_number')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sortedAssets = [...assets].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1

    switch (sortKey) {
      case 'asset_number':
        return a.asset_number.localeCompare(b.asset_number) * dir
      case 'name':
        return a.name.localeCompare(b.name, 'sv') * dir
      case 'acquisition_date':
        return a.acquisition_date.localeCompare(b.acquisition_date) * dir
      case 'acquisition_cost':
        return (Number(a.acquisition_cost) - Number(b.acquisition_cost)) * dir
      default:
        return 0
    }
  })

  function SortableHeader({ label, sortKeyName }: { label: string; sortKeyName: SortKey }) {
    return (
      <button
        onClick={() => toggleSort(sortKeyName)}
        className="flex items-center gap-1 hover:text-foreground transition-colors"
      >
        {label}
        <ArrowUpDown className="h-3.5 w-3.5" />
      </button>
    )
  }

  if (isLoading) {
    return (
      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tillg.nr</TableHead>
              <TableHead>Namn</TableHead>
              <TableHead>Kategori</TableHead>
              <TableHead>Anskaffad</TableHead>
              <TableHead className="text-right">Anskaffningsvarde</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[1, 2, 3, 4, 5].map((i) => (
              <TableRow key={i} className="animate-pulse">
                <TableCell><div className="h-4 bg-muted rounded w-24" /></TableCell>
                <TableCell><div className="h-4 bg-muted rounded w-32" /></TableCell>
                <TableCell><div className="h-4 bg-muted rounded w-20" /></TableCell>
                <TableCell><div className="h-4 bg-muted rounded w-24" /></TableCell>
                <TableCell><div className="h-4 bg-muted rounded w-20 ml-auto" /></TableCell>
                <TableCell><div className="h-4 bg-muted rounded w-16" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )
  }

  if (assets.length === 0) {
    return null
  }

  return (
    <div className="rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <SortableHeader label="Tillg.nr" sortKeyName="asset_number" />
            </TableHead>
            <TableHead>
              <SortableHeader label="Namn" sortKeyName="name" />
            </TableHead>
            <TableHead>Kategori</TableHead>
            <TableHead>
              <SortableHeader label="Anskaffad" sortKeyName="acquisition_date" />
            </TableHead>
            <TableHead className="text-right">
              <SortableHeader label="Anskaffningsvarde" sortKeyName="acquisition_cost" />
            </TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedAssets.map((asset) => (
            <TableRow key={asset.id} className="cursor-pointer">
              <TableCell>
                <Link href={`/assets/${asset.id}`} className="font-mono text-sm hover:underline">
                  {asset.asset_number}
                </Link>
              </TableCell>
              <TableCell>
                <Link href={`/assets/${asset.id}`} className="font-medium hover:underline">
                  {asset.name}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {(asset.category as { name: string } | undefined)?.name || '-'}
              </TableCell>
              <TableCell className="tabular-nums">
                {formatDate(asset.acquisition_date)}
              </TableCell>
              <TableCell className="text-right tabular-nums font-medium">
                {formatCurrency(Number(asset.acquisition_cost))}
              </TableCell>
              <TableCell>
                <Badge variant={statusVariant[asset.status]}>
                  {ASSET_STATUS_LABELS[asset.status]}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
