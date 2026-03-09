'use client'

import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, Unplug, RefreshCw, Download } from 'lucide-react'
import type { ProviderConnection, ProviderInfo } from '@/types'

interface ProviderCardProps {
  provider: ProviderInfo
  connection: ProviderConnection | null
  isConnecting: boolean
  isSyncing: boolean
  disabled?: boolean
  onConnect: () => void
  onDisconnect: () => void
  onSync: () => void
  onSyncData: () => void
}

const STATUS_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  active: { label: 'Ansluten', variant: 'default' },
  pending: { label: 'Väntar', variant: 'secondary' },
  expired: { label: 'Utgången', variant: 'destructive' },
  error: { label: 'Fel', variant: 'destructive' },
}

function formatRelativeTime(dateStr: string | null): string | null {
  if (!dateStr) return null
  const date = new Date(dateStr)
  const diff = Date.now() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just nu'
  if (minutes < 60) return `${minutes} min sedan`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} tim sedan`
  const days = Math.floor(hours / 24)
  return `${days} dagar sedan`
}

export function ProviderCard({
  provider,
  connection,
  isConnecting,
  isSyncing,
  disabled,
  onConnect,
  onDisconnect,
  onSync,
  onSyncData,
}: ProviderCardProps) {
  const status = connection ? STATUS_LABELS[connection.status] : null
  const isActive = connection?.status === 'active'

  return (
    <Card className={disabled ? 'opacity-60' : undefined}>
      <CardContent className="flex items-center gap-4 p-4">
        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border bg-card">
          <Image
            src={provider.logo}
            alt={provider.name}
            fill
            className="object-contain p-1.5 rounded-sm"
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium text-sm">{provider.name}</p>
            {!disabled && status && (
              <Badge variant={status.variant} className="text-xs">
                {status.label}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {connection?.provider_company_name || provider.description}
          </p>
          {connection?.last_synced_at && (
            <p className="text-xs text-muted-foreground">
              Synkad {formatRelativeTime(connection.last_synced_at)}
            </p>
          )}
          {connection?.error_message && (
            <p className="text-xs text-destructive truncate mt-0.5">
              {connection.error_message}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {disabled && (
            <Badge variant="secondary" className="text-xs">
              Kommer snart
            </Badge>
          )}

          {!disabled && !connection && (
            <Button
              size="sm"
              variant="outline"
              onClick={onConnect}
              disabled={isConnecting}
            >
              {isConnecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Anslut'
              )}
            </Button>
          )}

          {!disabled && isActive && (
            <>
              {provider.id === 'fortnox' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onSyncData}
                  disabled={isSyncing}
                >
                  {isSyncing ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <Download className="mr-1 h-3 w-3" />
                  )}
                  Hämta data
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={onSync}
                disabled={isSyncing}
              >
                <RefreshCw className="h-3 w-3" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={onDisconnect}
              >
                <Unplug className="h-3 w-3" />
              </Button>
            </>
          )}

          {!disabled && connection && !isActive && (
            <Button
              size="sm"
              variant="outline"
              onClick={onConnect}
              disabled={isConnecting}
            >
              Återanslut
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
