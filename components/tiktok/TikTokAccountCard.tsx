'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import { TIKTOK_STATUS_LABELS } from '@/types'
import type { TikTokAccount } from '@/types'
import { formatDate } from '@/lib/utils'
import {
  Loader2,
  RefreshCw,
  Trash2,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react'

interface TikTokAccountCardProps {
  account: TikTokAccount
  onDisconnect?: () => void
  onSync?: () => void
}

export function TikTokAccountCard({
  account,
  onDisconnect,
  onSync,
}: TikTokAccountCardProps) {
  const [isSyncing, setIsSyncing] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  const { toast } = useToast()

  const handleSync = async () => {
    setIsSyncing(true)

    try {
      const response = await fetch('/api/tiktok/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: account.id, sync_type: 'full' }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Synkronisering misslyckades')
      }

      toast({
        title: 'Synkronisering klar',
        description: `${data.videos_synced} videor synkade, ${data.new_videos} nya`,
      })

      onSync?.()
    } catch (error) {
      toast({
        title: 'Synkronisering misslyckades',
        description: error instanceof Error ? error.message : 'Ett fel uppstod',
        variant: 'destructive',
      })
    }

    setIsSyncing(false)
  }

  const handleDisconnect = async () => {
    if (!confirm('Vill du koppla bort detta TikTok-konto?')) {
      return
    }

    setIsDisconnecting(true)

    try {
      const response = await fetch('/api/tiktok/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: account.id }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Kunde inte koppla bort')
      }

      toast({
        title: 'Konto bortkopplat',
        description: 'TikTok-kontot har kopplats bort',
      })

      onDisconnect?.()
    } catch (error) {
      toast({
        title: 'Kunde inte koppla bort',
        description: error instanceof Error ? error.message : 'Ett fel uppstod',
        variant: 'destructive',
      })
      setIsDisconnecting(false)
    }
  }

  const getStatusVariant = (status: TikTokAccount['status']) => {
    switch (status) {
      case 'active':
        return 'default'
      case 'expired':
      case 'error':
        return 'destructive'
      case 'revoked':
        return 'secondary'
      default:
        return 'outline'
    }
  }

  const tokenExpiresAt = new Date(account.token_expires_at)
  const isExpiringSoon = tokenExpiresAt.getTime() - Date.now() < 24 * 60 * 60 * 1000

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          {/* Avatar */}
          {account.avatar_url ? (
            <img
              src={account.avatar_url}
              alt={account.display_name || account.username}
              className="h-12 w-12 rounded-full"
            />
          ) : (
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <TikTokIcon className="h-6 w-6 text-primary" />
            </div>
          )}

          {/* Account info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-medium truncate">
                {account.display_name || account.username}
              </p>
              <Badge variant={getStatusVariant(account.status)}>
                {TIKTOK_STATUS_LABELS[account.status]}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">@{account.username}</p>
            <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
              {account.last_synced_at && (
                <span>Synkad: {formatDate(account.last_synced_at)}</span>
              )}
              {isExpiringSoon && account.status === 'active' && (
                <span className="flex items-center gap-1 text-warning-foreground">
                  <AlertTriangle className="h-3 w-3" />
                  Token går ut snart
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              asChild
            >
              <a
                href={`https://www.tiktok.com/@${account.username}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={isSyncing || account.status !== 'active'}
            >
              {isSyncing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDisconnect}
              disabled={isDisconnecting}
            >
              {isDisconnecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 text-destructive" />
              )}
            </Button>
          </div>
        </div>

        {/* Error message */}
        {account.last_error && (
          <div className="mt-3 p-2 bg-destructive/10 rounded text-sm text-destructive">
            {account.last_error}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
    </svg>
  )
}
