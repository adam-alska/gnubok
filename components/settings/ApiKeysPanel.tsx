'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, Plus, Copy, Check, Trash2, Key } from 'lucide-react'

interface ApiKey {
  id: string
  key_prefix: string
  name: string
  scopes: string[] | null
  rate_limit_rpm: number
  last_used_at: string | null
  revoked_at: string | null
  created_at: string
}

export function ApiKeysPanel() {
  const { toast } = useToast()

  const [keys, setKeys] = useState<ApiKey[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showKeyDialog, setShowKeyDialog] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyValue, setNewKeyValue] = useState('')
  const [copied, setCopied] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const fetchKeys = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/api-keys')
      const json = await res.json()
      if (json.data) {
        setKeys(json.data.filter((k: ApiKey) => !k.revoked_at))
      }
    } catch {
      toast({ title: 'Fel', description: 'Kunde inte hämta API-nycklar', variant: 'destructive' })
    } finally {
      setIsLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchKeys()
  }, [fetchKeys])

  async function handleCreate() {
    setIsCreating(true)
    try {
      const res = await fetch('/api/settings/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName || 'MCP-nyckel' }),
      })
      const json = await res.json()

      if (!res.ok) {
        toast({ title: 'Fel', description: json.error, variant: 'destructive' })
        return
      }

      setNewKeyValue(json.data.key)
      setShowCreateDialog(false)
      setShowKeyDialog(true)
      setNewKeyName('')
      fetchKeys()
    } catch {
      toast({ title: 'Fel', description: 'Kunde inte skapa nyckel', variant: 'destructive' })
    } finally {
      setIsCreating(false)
    }
  }

  async function handleRevoke(id: string) {
    setRevokingId(id)
    try {
      await fetch(`/api/settings/api-keys/${id}`, { method: 'DELETE' })
      setKeys((prev) => prev.filter((k) => k.id !== id))
      toast({ title: 'Nyckel återkallad' })
    } catch {
      toast({ title: 'Fel', description: 'Kunde inte återkalla nyckel', variant: 'destructive' })
    } finally {
      setRevokingId(null)
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(newKeyValue)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function formatDate(iso: string | null) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('sv-SE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const mcpUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/extensions/ext/mcp-server/mcp`
    : '/api/extensions/ext/mcp-server/mcp'

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>API-nycklar</CardTitle>
              <CardDescription>
                Hantera nycklar för MCP-klienter (Claude, Cursor) och andra integrationer.
              </CardDescription>
            </div>
            <Button
              size="sm"
              onClick={() => setShowCreateDialog(true)}
              disabled={keys.length >= 10}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Skapa nyckel
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : keys.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Key className="h-8 w-8 text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">Inga API-nycklar ännu.</p>
              <p className="text-xs text-muted-foreground mt-1">
                Skapa en nyckel för att koppla din MCP-klient.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {keys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between rounded-md border px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{key.name}</p>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <code className="text-xs text-muted-foreground font-mono">
                        {key.key_prefix}...
                      </code>
                      <span className="text-xs text-muted-foreground">
                        Skapad {formatDate(key.created_at)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {key.last_used_at
                          ? `Använd ${formatDate(key.last_used_at)}`
                          : 'Aldrig använd'}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRevoke(key.id)}
                    disabled={revokingId === key.id}
                    className="text-destructive hover:text-destructive"
                  >
                    {revokingId === key.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Anslut till Claude Desktop</CardTitle>
          <CardDescription>
            Gör din bokföring genom konversation. Kräver{' '}
            <a href="https://claude.ai/download" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              Claude Desktop
            </a>{' '}
            och{' '}
            <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              Node.js
            </a>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-4 text-sm">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">1</span>
              <div>
                <p className="font-medium">Skapa en API-nyckel</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Klicka &quot;Skapa nyckel&quot; ovan och kopiera nyckeln.
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">2</span>
              <div>
                <p className="font-medium">Öppna Claude Desktop-inställningar</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Claude Desktop &rarr; Inställningar &rarr; Developer &rarr; Edit Config
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">3</span>
              <div>
                <p className="font-medium">Klistra in konfigurationen</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Ersätt <code className="text-xs">gnubok_sk_...</code> med din nyckel:
                </p>
                <pre className="mt-2 rounded-md bg-muted p-4 text-xs font-mono overflow-x-auto select-all">
{`{
  "mcpServers": {
    "gnubok": {
      "command": "npx",
      "args": ["gnubok-mcp"],
      "env": {
        "GNUBOK_API_KEY": "gnubok_sk_..."
      }
    }
  }
}`}
                </pre>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">4</span>
              <div>
                <p className="font-medium">Starta om Claude Desktop</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Stäng och öppna Claude Desktop. Du kan nu fråga: &quot;Visa mina okategoriserade transaktioner.&quot;
                </p>
              </div>
            </li>
          </ol>
        </CardContent>
      </Card>

      {/* Create key dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Skapa API-nyckel</DialogTitle>
            <DialogDescription>
              Ge nyckeln ett namn så du vet vad den används till.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="key-name">Namn</Label>
            <Input
              id="key-name"
              placeholder="t.ex. Claude Desktop"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Avbryt
            </Button>
            <Button onClick={handleCreate} disabled={isCreating}>
              {isCreating && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Skapa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Show key once dialog */}
      <Dialog open={showKeyDialog} onOpenChange={(open) => {
        if (!open) {
          setNewKeyValue('')
          setCopied(false)
        }
        setShowKeyDialog(open)
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Din nya API-nyckel</DialogTitle>
            <DialogDescription>
              Kopiera nyckeln nu. Den visas bara en gång.
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <code className="block rounded-md bg-muted p-4 pr-12 text-sm font-mono break-all">
              {newKeyValue}
            </code>
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-2 top-2"
              onClick={handleCopy}
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => {
              setShowKeyDialog(false)
              setNewKeyValue('')
              setCopied(false)
            }}>
              Klar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
