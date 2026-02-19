'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/components/ui/use-toast'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  ArrowLeft,
  Trash2,
  Building2,
  Calendar,
  Tag,
  MapPin,
  Hash,
  Truck,
  Shield,
  FileText,
  Loader2,
  Coins,
} from 'lucide-react'
import { DepreciationScheduleTable } from '@/components/assets/DepreciationScheduleTable'
import { DepreciationChart } from '@/components/assets/DepreciationChart'
import { DisposalDialog } from '@/components/assets/DisposalDialog'
import type { Asset, DepreciationScheduleEntry, AssetStatus } from '@/types/fixed-assets'
import {
  ASSET_STATUS_LABELS,
  DEPRECIATION_METHOD_LABELS,
} from '@/types/fixed-assets'

const statusVariant: Record<AssetStatus, 'default' | 'secondary' | 'success' | 'warning' | 'destructive'> = {
  active: 'success',
  fully_depreciated: 'warning',
  disposed: 'secondary',
  sold: 'secondary',
  written_off: 'destructive',
}

export default function AssetDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const assetId = params.id as string

  const [asset, setAsset] = useState<Asset | null>(null)
  const [schedule, setSchedule] = useState<DepreciationScheduleEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDeleting, setIsDeleting] = useState(false)

  const fetchAsset = useCallback(async () => {
    setIsLoading(true)
    const res = await fetch(`/api/assets/${assetId}`)
    const json = await res.json()

    if (json.error) {
      toast({
        title: 'Fel',
        description: 'Kunde inte hämta tillgång',
        variant: 'destructive',
      })
      router.push('/assets')
    } else {
      setAsset(json.data)
      setSchedule(json.data.depreciation_schedule || [])
    }
    setIsLoading(false)
  }, [assetId, toast, router])

  useEffect(() => {
    fetchAsset()
  }, [fetchAsset])

  async function handleDelete() {
    if (!confirm('Är du säker på att du vill ta bort denna tillgång?')) return

    setIsDeleting(true)
    try {
      const res = await fetch(`/api/assets/${assetId}`, { method: 'DELETE' })
      const json = await res.json()

      if (!res.ok) {
        throw new Error(json.error || 'Kunde inte ta bort tillgång')
      }

      toast({ title: 'Tillgång borttagen' })
      router.push('/assets')
    } catch (err) {
      toast({
        title: 'Fel',
        description: err instanceof Error ? err.message : 'Ett fel uppstod',
        variant: 'destructive',
      })
    } finally {
      setIsDeleting(false)
    }
  }

  if (isLoading || !asset) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="h-8 w-8 rounded bg-muted animate-pulse" />
          <div className="space-y-2">
            <div className="h-6 bg-muted rounded w-48 animate-pulse" />
            <div className="h-4 bg-muted rounded w-32 animate-pulse" />
          </div>
        </div>
        <Card className="animate-pulse">
          <CardContent className="py-16">
            <div className="h-4 bg-muted rounded w-full max-w-md mx-auto" />
          </CardContent>
        </Card>
      </div>
    )
  }

  // Calculate current book value from schedule
  const today = new Date().toISOString().split('T')[0]
  const currentScheduleEntry = [...schedule]
    .filter((e) => e.period_date <= today)
    .pop()

  const currentBookValue = currentScheduleEntry
    ? Number(currentScheduleEntry.book_value)
    : Number(asset.acquisition_cost)

  const accumulatedDepreciation = currentScheduleEntry
    ? Number(currentScheduleEntry.accumulated_depreciation)
    : 0

  const depreciationPercent = Number(asset.acquisition_cost) > 0
    ? Math.round((accumulatedDepreciation / Number(asset.acquisition_cost)) * 100)
    : 0

  const category = asset.category as {
    name?: string
    code?: string
    asset_account?: string
    depreciation_account?: string
    expense_account?: string
  } | undefined

  const canDispose = asset.status === 'active' || asset.status === 'fully_depreciated'
  const canDelete = !schedule.some((e) => e.is_posted)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/assets">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Tillbaka
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{asset.name}</h1>
              <Badge variant={statusVariant[asset.status]}>
                {ASSET_STATUS_LABELS[asset.status]}
              </Badge>
            </div>
            <p className="text-muted-foreground font-mono">{asset.asset_number}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canDispose && (
            <DisposalDialog
              asset={asset}
              currentBookValue={currentBookValue}
              accumulatedDepreciation={accumulatedDepreciation}
              onDisposed={fetchAsset}
            />
          )}
          {canDelete && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              disabled={isDeleting}
              className="text-destructive hover:text-destructive"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Financial Summary Row */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Anskaffningsvärde</p>
            <p className="text-2xl font-bold tabular-nums">
              {formatCurrency(Number(asset.acquisition_cost))}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Ackumulerad avskrivning</p>
            <p className="text-2xl font-bold tabular-nums">
              {formatCurrency(accumulatedDepreciation)}
            </p>
            <p className="text-xs text-muted-foreground">{depreciationPercent}% avskrivet</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-success/5 to-transparent border-success/20">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Bokfört värde</p>
            <p className="text-2xl font-bold tabular-nums">
              {formatCurrency(currentBookValue)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Restvärde</p>
            <p className="text-2xl font-bold tabular-nums">
              {formatCurrency(Number(asset.residual_value))}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="schedule">
        <TabsList>
          <TabsTrigger value="schedule">Avskrivningsplan</TabsTrigger>
          <TabsTrigger value="details">Detaljer</TabsTrigger>
          <TabsTrigger value="chart">Diagram</TabsTrigger>
        </TabsList>

        <TabsContent value="schedule" className="space-y-4 mt-4">
          <DepreciationScheduleTable entries={schedule} />
        </TabsContent>

        <TabsContent value="details" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Tillgångsdetaljer</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 sm:grid-cols-2">
                <DetailRow
                  icon={<Tag className="h-4 w-4" />}
                  label="Kategori"
                  value={category?.name || 'Ingen kategori'}
                />
                <DetailRow
                  icon={<Calendar className="h-4 w-4" />}
                  label="Anskaffningsdatum"
                  value={formatDate(asset.acquisition_date)}
                />
                <DetailRow
                  icon={<Building2 className="h-4 w-4" />}
                  label="Avskrivningsmetod"
                  value={DEPRECIATION_METHOD_LABELS[asset.depreciation_method]}
                />
                <DetailRow
                  icon={<Calendar className="h-4 w-4" />}
                  label="Nyttjandeperiod"
                  value={`${asset.useful_life_months} månader (${Math.round(asset.useful_life_months / 12 * 10) / 10} år)`}
                />
                {asset.location && (
                  <DetailRow
                    icon={<MapPin className="h-4 w-4" />}
                    label="Placering"
                    value={asset.location}
                  />
                )}
                {asset.serial_number && (
                  <DetailRow
                    icon={<Hash className="h-4 w-4" />}
                    label="Serienummer"
                    value={asset.serial_number}
                  />
                )}
                {asset.supplier_name && (
                  <DetailRow
                    icon={<Truck className="h-4 w-4" />}
                    label="Leverantör"
                    value={asset.supplier_name}
                  />
                )}
                {asset.warranty_expires && (
                  <DetailRow
                    icon={<Shield className="h-4 w-4" />}
                    label="Garanti utgår"
                    value={formatDate(asset.warranty_expires)}
                  />
                )}
                {category && (
                  <>
                    <DetailRow
                      icon={<FileText className="h-4 w-4" />}
                      label="Tillgångskonto"
                      value={category.asset_account || '-'}
                      mono
                    />
                    <DetailRow
                      icon={<FileText className="h-4 w-4" />}
                      label="Ack. avskrivningskonto"
                      value={category.depreciation_account || '-'}
                      mono
                    />
                    <DetailRow
                      icon={<FileText className="h-4 w-4" />}
                      label="Kostnadskonto"
                      value={category.expense_account || '-'}
                      mono
                    />
                  </>
                )}
              </div>
              {asset.notes && (
                <div className="mt-6 pt-6 border-t">
                  <p className="text-sm text-muted-foreground mb-1">Anteckningar</p>
                  <p className="text-sm whitespace-pre-wrap">{asset.notes}</p>
                </div>
              )}
              {asset.disposed_at && (
                <div className="mt-6 pt-6 border-t">
                  <p className="text-sm text-muted-foreground mb-1">Avyttringsinformation</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <DetailRow
                      icon={<Calendar className="h-4 w-4" />}
                      label="Avyttrad"
                      value={formatDate(asset.disposed_at)}
                    />
                    {asset.disposal_amount !== null && (
                      <DetailRow
                        icon={<Coins className="h-4 w-4" />}
                        label="Försäljningsbelopp"
                        value={formatCurrency(Number(asset.disposal_amount))}
                      />
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="chart" className="mt-4">
          <DepreciationChart
            entries={schedule}
            acquisitionCost={Number(asset.acquisition_cost)}
            residualValue={Number(asset.residual_value)}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function DetailRow({
  icon,
  label,
  value,
  mono,
}: {
  icon: React.ReactNode
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 text-muted-foreground">{icon}</div>
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={`font-medium ${mono ? 'font-mono' : ''}`}>{value}</p>
      </div>
    </div>
  )
}

