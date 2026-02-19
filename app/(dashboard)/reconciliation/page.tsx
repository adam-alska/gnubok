'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  Plus,
  ArrowLeftRight,
  CheckCircle2,
  Clock,
  XCircle,
  Loader2,
  TrendingUp,
  AlertCircle,
} from 'lucide-react'
import ReconciliationWorkspace from '@/components/reconciliation/ReconciliationWorkspace'
import type { BankReconciliationSession } from '@/types/bank-reconciliation'
import type { BankConnection } from '@/types'

export default function ReconciliationPage() {
  const [sessions, setSessions] = useState<BankReconciliationSession[]>([])
  const [bankConnections, setBankConnections] = useState<BankConnection[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)

  // Form state
  const [selectedBankConnection, setSelectedBankConnection] = useState<string>('')
  const [accountName, setAccountName] = useState('')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [openingBalance, setOpeningBalance] = useState('')
  const [closingBalance, setClosingBalance] = useState('')

  const { toast } = useToast()
  const supabase = createClient()

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setIsLoading(true)

    // Fetch sessions
    const sessionsRes = await fetch('/api/reconciliation/sessions')
    const sessionsData = await sessionsRes.json()
    if (sessionsData.data) {
      setSessions(sessionsData.data)
    }

    // Fetch bank connections
    const { data: connections } = await supabase
      .from('bank_connections')
      .select('*')
      .eq('status', 'active')

    if (connections) {
      setBankConnections(connections)
    }

    // Set sensible defaults for period
    const now = new Date()
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    setPeriodStart(firstDay.toISOString().split('T')[0])
    setPeriodEnd(lastDay.toISOString().split('T')[0])

    setIsLoading(false)
  }

  async function handleCreateSession() {
    if (!periodStart || !periodEnd) {
      toast({
        title: 'Fel',
        description: 'Välj en period för avstämningen',
        variant: 'destructive',
      })
      return
    }

    setIsCreating(true)

    try {
      const response = await fetch('/api/reconciliation/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bank_connection_id: selectedBankConnection || undefined,
          account_name: accountName || undefined,
          period_start: periodStart,
          period_end: periodEnd,
          opening_balance: openingBalance ? parseFloat(openingBalance) : 0,
          closing_balance: closingBalance ? parseFloat(closingBalance) : 0,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        toast({
          title: 'Fel',
          description: result.error || 'Kunde inte skapa session',
          variant: 'destructive',
        })
        return
      }

      toast({
        title: 'Avstamning skapad',
        description: 'Ny bankavstamning startad',
      })

      setCreateDialogOpen(false)
      setActiveSessionId(result.data.id)
      await fetchData()
    } catch {
      toast({
        title: 'Fel',
        description: 'Något gick fel',
        variant: 'destructive',
      })
    } finally {
      setIsCreating(false)
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case 'in_progress':
        return (
          <Badge variant="warning" className="gap-1">
            <Clock className="h-3 w-3" />
            Pågår
          </Badge>
        )
      case 'completed':
        return (
          <Badge variant="success" className="gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Klar
          </Badge>
        )
      case 'cancelled':
        return (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="h-3 w-3" />
            Avbruten
          </Badge>
        )
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  // If an active session is selected, show the workspace
  if (activeSessionId) {
    return (
      <div className="space-y-4">
        <ReconciliationWorkspace
          sessionId={activeSessionId}
          onBack={() => {
            setActiveSessionId(null)
            fetchData()
          }}
        />
      </div>
    )
  }

  // Calculate quick stats
  const activeSessions = sessions.filter((s) => s.status === 'in_progress')
  const totalUnmatched = activeSessions.reduce((sum, s) => sum + s.unmatched_count, 0)
  const totalMatched = activeSessions.reduce((sum, s) => sum + s.matched_count, 0)
  const completedSessions = sessions.filter((s) => s.status === 'completed')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Bankavstamning</h1>
          <p className="text-muted-foreground">
            Matcha banktransaktioner mot fakturor och bokfor
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Ny avstamning
        </Button>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center">
                <Clock className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Aktiva</p>
                <p className="text-2xl font-semibold">{activeSessions.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center">
                <AlertCircle className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Omatchade</p>
                <p className="text-2xl font-semibold">{totalUnmatched}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-50 dark:bg-green-950/30 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Matchade</p>
                <p className="text-2xl font-semibold">{totalMatched}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-purple-50 dark:bg-purple-950/30 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Slutförda</p>
                <p className="text-2xl font-semibold">{completedSessions.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sessions list */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <div className="h-5 bg-muted rounded w-48" />
                    <div className="h-4 bg-muted rounded w-32" />
                  </div>
                  <div className="h-8 bg-muted rounded w-24" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <ArrowLeftRight className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium">Inga bankavstamningar</h3>
            <p className="text-muted-foreground text-center mt-1 max-w-md">
              Starta en bankavstämning för att matcha dina banktransaktioner mot fakturor
              och skapa bokföringsposter automatiskt.
            </p>
            <Button className="mt-6" onClick={() => setCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Starta första avstämningen
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {sessions.map((session) => {
            const progressPercent =
              session.total_transactions > 0
                ? Math.round((session.matched_count / session.total_transactions) * 100)
                : 0

            return (
              <Card
                key={session.id}
                className="hover:border-primary/50 transition-colors cursor-pointer"
                onClick={() => {
                  if (session.status === 'in_progress') {
                    setActiveSessionId(session.id)
                  }
                }}
              >
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">
                          {session.account_name || 'Bankavstamning'}
                        </p>
                        {getStatusBadge(session.status)}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(session.period_start)} - {formatDate(session.period_end)}
                        {' '}&middot;{' '}
                        {session.total_transactions} transaktioner
                      </p>
                    </div>

                    <div className="flex items-center gap-4">
                      {/* Progress mini-bar */}
                      <div className="text-right">
                        <p className="text-sm font-medium tabular-nums">
                          {session.matched_count}/{session.total_transactions}
                        </p>
                        <div className="w-24 h-1.5 rounded-full bg-secondary mt-1">
                          <div
                            className={`h-full rounded-full transition-all ${
                              progressPercent === 100
                                ? 'bg-green-500'
                                : 'bg-primary'
                            }`}
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                      </div>

                      {session.status === 'in_progress' && (
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            setActiveSessionId(session.id)
                          }}
                        >
                          Fortsätt
                        </Button>
                      )}

                      {session.status === 'completed' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            setActiveSessionId(session.id)
                          }}
                        >
                          Visa
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Create session dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ny bankavstamning</DialogTitle>
            <DialogDescription>
              Välj bankkonto och period för att starta en ny bankavstämning.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Bank connection */}
            {bankConnections.length > 0 && (
              <div>
                <Label>Bankkoppling (valfritt)</Label>
                <Select
                  value={selectedBankConnection}
                  onValueChange={setSelectedBankConnection}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Välj bankkoppling..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Ingen specifik koppling</SelectItem>
                    {bankConnections.map((bc) => (
                      <SelectItem key={bc.id} value={bc.id}>
                        {bc.bank_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Account name */}
            <div>
              <Label htmlFor="account-name">Kontonamn</Label>
              <Input
                id="account-name"
                placeholder="T.ex. Foretagskonto SEB"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
              />
            </div>

            {/* Period */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="period-start">Fran</Label>
                <Input
                  id="period-start"
                  type="date"
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="period-end">Till</Label>
                <Input
                  id="period-end"
                  type="date"
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                />
              </div>
            </div>

            {/* Balances */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="opening-balance">Ingående saldo</Label>
                <Input
                  id="opening-balance"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={openingBalance}
                  onChange={(e) => setOpeningBalance(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="closing-balance">Utgående saldo</Label>
                <Input
                  id="closing-balance"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={closingBalance}
                  onChange={(e) => setClosingBalance(e.target.value)}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
              disabled={isCreating}
            >
              Avbryt
            </Button>
            <Button onClick={handleCreateSession} disabled={isCreating}>
              {isCreating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Skapar...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Starta avstamning
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
