'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/utils'
import { getDaysUntilExpiry, isConsentExpiringSoon } from '../lib/api-client'
import {
  CreditCard,
  AlertTriangle,
  RefreshCw,
  Trash2,
  Loader2,
  CheckCircle,
  XCircle,
} from 'lucide-react'
import type { BankConnection } from '@/types'

interface BankConnectionStatusProps {
  connection: BankConnection
  onSync: (connectionId: string) => void
  onDisconnect: (connectionId: string) => void
  isSyncing?: boolean
}

export function BankConnectionStatus({
  connection,
  onSync,
  onDisconnect,
  isSyncing = false,
}: BankConnectionStatusProps) {
  const daysUntilExpiry = getDaysUntilExpiry(connection.consent_expires)
  const isExpiring = isConsentExpiringSoon(connection.consent_expires)

  const statusConfig = {
    active: {
      icon: CheckCircle,
      color: 'text-success',
      label: 'Aktiv',
      variant: 'success' as const,
    },
    pending: {
      icon: Loader2,
      color: 'text-warning',
      label: 'Väntar',
      variant: 'warning' as const,
    },
    error: {
      icon: XCircle,
      color: 'text-destructive',
      label: 'Fel',
      variant: 'destructive' as const,
    },
    revoked: {
      icon: XCircle,
      color: 'text-gray-600',
      label: 'Bortkopplad',
      variant: 'secondary' as const,
    },
  }

  const status = statusConfig[connection.status as keyof typeof statusConfig] || statusConfig.error
  const StatusIcon = status.icon

  // Parse accounts from connection
  const accounts = (connection.accounts_data as Array<{
    uid: string
    iban?: string
    name?: string
    currency: string
    balance?: number
    balance_updated_at?: string
  }>) || []

  const [now] = useState(() => Date.now())

  function formatBalanceAge(updatedAt: string): string {
    const hoursAgo = Math.floor((now - new Date(updatedAt).getTime()) / (1000 * 60 * 60))
    if (hoursAgo < 1) return 'Nyss uppdaterat'
    if (hoursAgo < 24) return `${hoursAgo}h sedan`
    const daysAgo = Math.floor(hoursAgo / 24)
    return `${daysAgo}d sedan`
  }

  return (
    <div className="border rounded-lg p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <CreditCard className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-medium">{connection.bank_name}</p>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <StatusIcon className={`h-3 w-3 ${status.color}`} />
              <span>{status.label}</span>
              {connection.last_synced_at && (
                <>
                  <span>-</span>
                  <span>Synkad {formatDate(connection.last_synced_at)}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {connection.status === 'active' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onSync(connection.id)}
              disabled={isSyncing}
            >
              {isSyncing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDisconnect(connection.id)}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>

      {/* Consent expiry warning */}
      {isExpiring && daysUntilExpiry !== null && (
        <div className="flex items-center gap-2 p-3 bg-warning/10 rounded-lg">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <span className="text-sm">
            Samtycket går ut om {daysUntilExpiry} {daysUntilExpiry === 1 ? 'dag' : 'dagar'}.
            Förnya genom att ansluta igen.
          </span>
        </div>
      )}

      {/* Accounts list */}
      {accounts.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Konton</p>
          <div className="space-y-2">
            {accounts.map((account) => (
              <div
                key={account.uid}
                className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
              >
                <div>
                  <p className="text-sm font-medium">
                    {account.name || account.iban || 'Okänt konto'}
                  </p>
                  {account.iban && (
                    <p className="text-xs text-muted-foreground">
                      {account.iban.replace(/(.{4})/g, '$1 ').trim()}
                    </p>
                  )}
                </div>
                {account.balance !== undefined && (
                  <div className="text-right">
                    <p className="text-sm font-medium">
                      {new Intl.NumberFormat('sv-SE', {
                        style: 'currency',
                        currency: account.currency,
                      }).format(account.balance)}
                    </p>
                    {account.balance_updated_at && (
                      <p className="text-[10px] text-muted-foreground">
                        {formatBalanceAge(account.balance_updated_at)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
