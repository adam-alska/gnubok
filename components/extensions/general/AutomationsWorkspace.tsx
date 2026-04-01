'use client'

import { useState, useEffect, useCallback } from 'react'
import type { WorkspaceComponentProps } from '@/lib/extensions/workspace-registry'
import { Loader2, AlertCircle, RefreshCw, ExternalLink } from 'lucide-react'

interface APTokenResponse {
  token: string
  url: string
  projectId: string
}

export default function AutomationsWorkspace({ userId }: WorkspaceComponentProps) {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [iframeUrl, setIframeUrl] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string>('')

  const fetchToken = useCallback(async () => {
    setState('loading')
    setErrorMessage('')
    try {
      const res = await fetch('/api/extensions/ext/automations/token', {
        method: 'POST',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      const data: APTokenResponse = await res.json()
      // Embed the AP instance with the user's token
      const url = new URL(data.url)
      url.searchParams.set('token', data.token)
      setIframeUrl(url.toString())
      setState('ready')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to connect')
      setState('error')
    }
  }, [])

  useEffect(() => {
    fetchToken()
  }, [fetchToken])

  if (state === 'loading') {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-10rem)]">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <p className="text-sm">Ansluter till automatiseringsmotor...</p>
        </div>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-10rem)]">
        <div className="flex flex-col items-center gap-4 text-center max-w-md">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <div>
            <h3 className="font-medium text-foreground">Kunde inte ansluta</h3>
            <p className="text-sm text-muted-foreground mt-1">{errorMessage}</p>
          </div>
          <button
            onClick={fetchToken}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Försök igen
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-[calc(100vh-10rem)] flex flex-col">
      <div className="flex items-center justify-between pb-2">
        <h2 className="text-sm font-medium text-muted-foreground">Automatiseringar</h2>
        {iframeUrl && (
          <a
            href={iframeUrl.split('?')[0]}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Öppna i nytt fönster
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
      <div className="flex-1 rounded-lg border border-border overflow-hidden bg-background shadow-sm">
        {iframeUrl && (
          <iframe
            src={iframeUrl}
            className="w-full h-full border-0"
            title="Automatiseringar"
            allow="clipboard-read; clipboard-write"
          />
        )}
      </div>
    </div>
  )
}
