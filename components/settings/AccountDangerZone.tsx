'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
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
import { RetentionNotice } from '@/components/ui/retention-notice'
import { ExternalLink, Loader2 } from 'lucide-react'
import { SupportLink } from '@/components/ui/support-link'

interface Blocker {
  id: string
  name: string
}

export function AccountDangerZone() {
  const router = useRouter()
  const [email, setEmail] = useState<string | null>(null)
  const [blockers, setBlockers] = useState<Blocker[]>([])
  const [blockersLoading, setBlockersLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!cancelled) setEmail(user?.email ?? null)

      try {
        const res = await fetch('/api/company?owned=true&archived=false')
        if (res.ok) {
          const body = await res.json()
          if (!cancelled) setBlockers(body.data ?? [])
        }
      } finally {
        if (!cancelled) setBlockersLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleDelete() {
    if (!email) return
    if (confirmText.trim().toLowerCase() !== email.toLowerCase()) return

    setIsDeleting(true)
    setError(null)

    try {
      const response = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm_email: email }),
      })

      if (response.status === 409) {
        const body = await response.json()
        // Precondition tripped mid-flow — refresh the list and show inline.
        setBlockers(body.blockers ?? [])
        setError(body.error || 'Du måste radera eller överlåta dina företag först.')
        setIsDeleting(false)
        setShowDialog(false)
        return
      }

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || 'Kunde inte radera kontot')
      }

      router.push('/login')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte radera kontot')
      setIsDeleting(false)
    }
  }

  const hasBlockers = blockers.length > 0
  const canDelete = !hasBlockers && !blockersLoading

  return (
    <>
      <section className="space-y-4 border-t border-border/8 pt-8">
        <h2 className="text-sm font-medium uppercase tracking-wider text-destructive/80">
          Radera konto
        </h2>

        {hasBlockers && (
          <div className="rounded-lg border border-border/60 bg-muted/30 p-4 space-y-3">
            <p className="text-sm font-medium">Företag du äger</p>
            <p className="text-sm text-muted-foreground">
              Radera eller överlåt alla företag innan du raderar kontot.
            </p>
            <ul className="space-y-2">
              {blockers.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center justify-between rounded-md border border-border/40 bg-background px-3 py-2"
                >
                  <span className="text-sm font-medium">{b.name}</span>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/settings/company">Hantera</Link>
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <RetentionNotice variant="account" />

        <p className="text-sm text-muted-foreground">
          Har du frågor?{' '}
          <SupportLink variant="inline" subject="Fråga om kontoradering" />
        </p>

        {error && !showDialog && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="outline" className="w-full sm:w-auto" asChild>
            <Link href="/reports?type=sie">
              <ExternalLink className="mr-2 h-4 w-4" />
              Exportera bokföringsdata (SIE)
            </Link>
          </Button>
          <Button
            variant="destructive"
            className="w-full sm:w-auto"
            onClick={() => setShowDialog(true)}
            disabled={!canDelete}
          >
            Radera mitt konto
          </Button>
        </div>
      </section>

      <Dialog
        open={showDialog}
        onOpenChange={(open) => {
          if (isDeleting) return
          setShowDialog(open)
          if (!open) {
            setConfirmText('')
            setError(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Radera konto permanent</DialogTitle>
            <DialogDescription>
              Ditt konto avidentifieras och du loggas ut från alla enheter.
              Du kan inte skapa ett nytt konto med samma e-postadress — kontakta support
              om du vill återaktivera kontot i framtiden.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="delete-confirm">
              Skriv din e-postadress (<strong>{email}</strong>) för att bekräfta
            </Label>
            <Input
              id="delete-confirm"
              type="email"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={email ?? ''}
              autoComplete="off"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowDialog(false)
                setConfirmText('')
                setError(null)
              }}
              disabled={isDeleting}
            >
              Avbryt
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={
                !email ||
                confirmText.trim().toLowerCase() !== email.toLowerCase() ||
                isDeleting
              }
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Raderar...
                </>
              ) : (
                'Radera konto'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
