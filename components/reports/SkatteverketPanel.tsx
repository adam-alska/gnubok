'use client'

import { ENABLED_EXTENSION_IDS } from '@/lib/extensions/_generated/enabled-extensions'
import React, { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Link2,
  Link2Off,
  Loader2,
  FileCheck,
  Lock,
  Unlock,
  Send,
  ShieldAlert,
} from 'lucide-react'
import type { VatPeriodType } from '@/types'
import { formatRedovisare, formatRedovisningsperiod } from '@/lib/skatteverket/format'

interface SkatteverketStatus {
  connected: boolean
  expired?: boolean
  canRefresh?: boolean
  scope?: string
  expiresAt?: string
}

interface KontrollResult {
  id: string
  typ: 'ERROR' | 'WARNING'
  text: string
}

interface SkatteverketPanelProps {
  periodType: VatPeriodType
  year: number
  period: number
  hasData: boolean
}

function formatAmount(amount: number): string {
  return amount.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const SKV_ENABLED = ENABLED_EXTENSION_IDS.has('skatteverket')

export function SkatteverketPanel(props: SkatteverketPanelProps) {
  if (!SKV_ENABLED) return null
  return <SkatteverketPanelInner {...props} />
}

function SkatteverketPanelInner({ periodType, year, period, hasData }: SkatteverketPanelProps) {
  const [status, setStatus] = useState<SkatteverketStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [kontroller, setKontroller] = useState<KontrollResult[]>([])
  const [signeringslank, setSigneringslank] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState<{
    kvittensnummer?: string
    tidpunkt?: string
  } | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/extensions/ext/skatteverket/status')
      if (res.ok) {
        const data = await res.json()
        setStatus(data)
      }
    } catch {
      // Extension might not be enabled
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()

    // Check URL params for OAuth callback results
    const params = new URLSearchParams(window.location.search)
    if (params.get('skv_connected') === 'true') {
      setSuccess('Ansluten till Skatteverket')
      fetchStatus()
      // Clean URL
      const url = new URL(window.location.href)
      url.searchParams.delete('skv_connected')
      window.history.replaceState({}, '', url.toString())
    }
    const skvError = params.get('skv_error')
    if (skvError) {
      setError(decodeURIComponent(skvError))
      const url = new URL(window.location.href)
      url.searchParams.delete('skv_error')
      window.history.replaceState({}, '', url.toString())
    }
  }, [fetchStatus])

  const handleConnect = () => {
    window.location.href = '/api/extensions/ext/skatteverket/authorize'
  }

  const handleDisconnect = async () => {
    setActionLoading('disconnect')
    setError(null)
    try {
      const res = await fetch('/api/extensions/ext/skatteverket/disconnect', {
        method: 'POST',
      })
      if (res.ok) {
        setStatus({ connected: false })
        setSuccess(null)
        setKontroller([])
        setSigneringslank(null)
        setSubmitted(null)
      }
    } catch {
      setError('Kunde inte koppla bort')
    } finally {
      setActionLoading(null)
    }
  }

  const handleValidate = async () => {
    setActionLoading('validate')
    setError(null)
    setKontroller([])
    try {
      const res = await fetch('/api/extensions/ext/skatteverket/declaration/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodType, year, period }),
      })
      const result = await res.json()
      if (result.error) {
        setError(result.error)
      } else {
        const controls = result.data?.kontrollresultat?.kontroller || []
        setKontroller(controls)
        if (controls.length === 0) {
          setSuccess('Valideringen godkänd — inga fel eller varningar')
        } else {
          const errors = controls.filter((k: KontrollResult) => k.typ === 'ERROR')
          if (errors.length > 0) {
            setError(`${errors.length} valideringsfel hittades`)
          } else {
            setSuccess('Valideringen godkänd med varningar')
          }
        }
      }
    } catch {
      setError('Kunde inte validera deklarationen')
    } finally {
      setActionLoading(null)
    }
  }

  const handleSaveDraft = async () => {
    setActionLoading('draft')
    setError(null)
    try {
      const res = await fetch('/api/extensions/ext/skatteverket/declaration/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodType, year, period }),
      })
      const result = await res.json()
      if (result.error) {
        setError(result.error)
      } else {
        const controls = result.data?.kontrollresultat?.kontroller || []
        setKontroller(controls)
        const errors = controls.filter((k: KontrollResult) => k.typ === 'ERROR')
        if (errors.length === 0) {
          setSuccess('Utkast sparat i Eget utrymme hos Skatteverket')
        } else {
          setError(`Utkastet sparades men har ${errors.length} valideringsfel`)
        }
      }
    } catch {
      setError('Kunde inte spara utkast')
    } finally {
      setActionLoading(null)
    }
  }

  const handleLock = async () => {
    setActionLoading('lock')
    setError(null)
    try {
      const res = await fetch(
        `/api/extensions/ext/skatteverket/declaration/lock?redovisare=${encodeURIComponent(
          await getRedovisare()
        )}&redovisningsperiod=${getRedovisningsperiod()}`,
        { method: 'PUT' }
      )
      const result = await res.json()
      if (result.error) {
        setError(result.error)
      } else if (result.data?.signeringslank) {
        setSigneringslank(result.data.signeringslank)
        setSuccess('Utkastet är låst. Öppna signeringslänken för att signera med BankID.')
      }
    } catch {
      setError('Kunde inte låsa utkastet')
    } finally {
      setActionLoading(null)
    }
  }

  const handleUnlock = async () => {
    setActionLoading('unlock')
    setError(null)
    try {
      const res = await fetch(
        `/api/extensions/ext/skatteverket/declaration/lock?redovisare=${encodeURIComponent(
          await getRedovisare()
        )}&redovisningsperiod=${getRedovisningsperiod()}`,
        { method: 'DELETE' }
      )
      const result = await res.json()
      if (result.error) {
        setError(result.error)
      } else {
        setSigneringslank(null)
        setSuccess('Utkastet har låsts upp')
      }
    } catch {
      setError('Kunde inte låsa upp utkastet')
    } finally {
      setActionLoading(null)
    }
  }

  const handleCheckSubmitted = async () => {
    setActionLoading('check')
    setError(null)
    try {
      const res = await fetch(
        `/api/extensions/ext/skatteverket/declaration/submitted?redovisare=${encodeURIComponent(
          await getRedovisare()
        )}&redovisningsperiod=${getRedovisningsperiod()}`
      )
      const result = await res.json()
      if (result.error) {
        setError(result.error)
      } else if (result.data) {
        setSubmitted(result.data)
        setSuccess('Deklarationen har lämnats in')
      } else {
        setSuccess('Ingen inlämnad deklaration hittades för denna period')
      }
    } catch {
      setError('Kunde inte kontrollera inlämningsstatus')
    } finally {
      setActionLoading(null)
    }
  }

  // Helper to get redovisare from settings
  const getRedovisare = async (): Promise<string> => {
    const res = await fetch('/api/settings')
    const { data } = await res.json()
    if (!data?.org_number) throw new Error('Organisationsnummer saknas')
    return formatRedovisare(data.org_number, data.entity_type)
  }

  const getRedovisningsperiod = (): string => {
    return formatRedovisningsperiod(periodType, year, period)
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Kontrollerar Skatteverket-anslutning...
        </CardContent>
      </Card>
    )
  }

  // Not connected
  if (!status?.connected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileCheck className="h-5 w-5" />
            Skicka till Skatteverket
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/5 rounded-lg p-3">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            Anslut till Skatteverket med BankID för att skicka momsdeklarationen direkt.
          </p>
          <Button onClick={handleConnect} className="gap-2">
            <Link2 className="h-4 w-4" />
            Anslut med BankID
          </Button>
        </CardContent>
      </Card>
    )
  }

  // Connected — show actions
  const hasErrors = kontroller.some(k => k.typ === 'ERROR')
  const hasWarnings = kontroller.some(k => k.typ === 'WARNING')

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileCheck className="h-5 w-5" />
            Skicka till Skatteverket
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-success border-success/30 gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Ansluten
            </Badge>
            {status.expired && (
              <Badge variant="destructive" className="gap-1">
                <AlertCircle className="h-3 w-3" />
                Session utgången
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Messages */}
        {error && (
          <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/5 rounded-lg p-3">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {success && !error && (
          <div className="flex items-start gap-2 text-sm text-success bg-success/5 rounded-lg p-3">
            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Validation results */}
        {kontroller.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Valideringsresultat
            </p>
            {kontroller.map((k, i) => (
              <div
                key={`${k.id}-${i}`}
                className={`flex items-start gap-2 text-sm rounded-lg p-2.5 ${
                  k.typ === 'ERROR'
                    ? 'bg-destructive/5 text-destructive'
                    : 'bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200'
                }`}
              >
                {k.typ === 'ERROR' ? (
                  <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                )}
                <div>
                  <span className="font-mono text-xs mr-1.5">{k.id}</span>
                  {k.text}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Submitted confirmation */}
        {submitted && (
          <div className="rounded-lg border p-3 space-y-1">
            <p className="text-sm font-medium flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-success" />
              Inlämnad
            </p>
            {submitted.kvittensnummer && (
              <p className="text-xs text-muted-foreground">
                Kvittensnummer: <span className="font-mono">{submitted.kvittensnummer}</span>
              </p>
            )}
            {submitted.tidpunkt && (
              <p className="text-xs text-muted-foreground">
                Tidpunkt: {new Date(submitted.tidpunkt).toLocaleString('sv-SE')}
              </p>
            )}
          </div>
        )}

        {/* Signing link */}
        {signeringslank && (
          <div className="rounded-lg border border-success/30 bg-success/5 p-3 space-y-2">
            <p className="text-sm font-medium">Utkastet är låst och redo att signeras</p>
            <p className="text-xs text-muted-foreground">
              Öppna länken nedan och signera med BankID på Skatteverkets sida.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => window.open(signeringslank, '_blank')}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Öppna signeringssidan
            </Button>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={handleValidate}
            disabled={!hasData || actionLoading !== null}
            className="gap-1.5"
          >
            {actionLoading === 'validate' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileCheck className="h-3.5 w-3.5" />
            )}
            Validera
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleSaveDraft}
            disabled={!hasData || actionLoading !== null}
            className="gap-1.5"
          >
            {actionLoading === 'draft' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Spara utkast
          </Button>

          {!signeringslank ? (
            <Button
              size="sm"
              onClick={handleLock}
              disabled={!hasData || hasErrors || actionLoading !== null}
              className="gap-1.5"
              title={hasErrors ? 'Valideringsfel måste åtgärdas först' : ''}
            >
              {actionLoading === 'lock' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Lock className="h-3.5 w-3.5" />
              )}
              Lås och signera
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={handleUnlock}
              disabled={actionLoading !== null}
              className="gap-1.5"
            >
              {actionLoading === 'unlock' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Unlock className="h-3.5 w-3.5" />
              )}
              Lås upp
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={handleCheckSubmitted}
            disabled={actionLoading !== null}
            className="gap-1.5"
          >
            {actionLoading === 'check' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            Kontrollera inlämning
          </Button>
        </div>

        {/* Disconnect */}
        <div className="pt-2 border-t">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDisconnect}
            disabled={actionLoading !== null}
            className="gap-1.5 text-muted-foreground hover:text-destructive"
          >
            {actionLoading === 'disconnect' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Link2Off className="h-3.5 w-3.5" />
            )}
            Koppla bort Skatteverket
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
