'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Loader2, Building2, AlertCircle } from 'lucide-react'

interface InviteInfo {
  type: 'company'
  companyName?: string
  email: string
  expired: boolean
  alreadyHasAccount: boolean
}

export default function InvitePage() {
  const params = useParams()
  const router = useRouter()
  const token = params.token as string

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [invite, setInvite] = useState<InviteInfo | null>(null)

  useEffect(() => {
    async function loadInvite() {
      try {
        const res = await fetch(`/api/team/accept?token=${encodeURIComponent(token)}`)
        const data = await res.json()

        if (!res.ok) {
          setError(data.error || 'Inbjudan är ogiltig.')
          return
        }

        setInvite(data.data)
      } catch {
        setError('Kunde inte ladda inbjudan.')
      } finally {
        setIsLoading(false)
      }
    }
    loadInvite()
  }, [token])

  const handleAccept = () => {
    // Store invite token in cookie before redirecting to register
    document.cookie = `gnubok-invite-token=${token}; path=/; max-age=3600; samesite=lax`
    router.push(`/register?invite=${encodeURIComponent(token)}`)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="relative bg-[#141414] text-white overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <div
            className="absolute inset-0"
            style={{
              background: 'radial-gradient(ellipse at 30% -20%, rgba(255,255,255,0.04) 0%, transparent 50%)',
            }}
          />
        </div>
        <div className="relative z-10 max-w-2xl mx-auto w-full px-6 md:px-10 pt-5 pb-6 md:pt-6 md:pb-8">
          <div className="flex items-center gap-2.5 mb-5 md:mb-6">
            <Image
              src="/gnubokiceon-removebg-preview.png"
              alt="Gnubok"
              width={30}
              height={30}
              className="invert opacity-90"
            />
            <span className="font-display text-base tracking-tight">gnubok</span>
          </div>
          <div className="animate-fade-in">
            <h1 className="font-display text-2xl md:text-3xl font-medium tracking-tight leading-[1.1]">
              {error ? 'Ogiltig inbjudan' : 'Du har blivit inbjuden'}
            </h1>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-lg mx-auto px-6 md:px-10 py-6 md:py-8">
          <div className="animate-slide-up">
            {error ? (
              <Card className="p-6">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">{error}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Kontakta personen som bjöd in dig för en ny inbjudan.
                    </p>
                    <Link
                      href="/login"
                      className="text-sm text-primary hover:underline mt-3 inline-block"
                    >
                      Gå till inloggning
                    </Link>
                  </div>
                </div>
              </Card>
            ) : invite?.expired ? (
              <Card className="p-6">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Inbjudan har gått ut</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Be personen som bjöd in dig att skicka en ny inbjudan.
                    </p>
                  </div>
                </div>
              </Card>
            ) : invite?.alreadyHasAccount ? (
              <Card className="p-6">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">E-postadressen har redan ett konto</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      <strong>{invite.email}</strong> är redan registrerad på gnubok.
                      Kontot måste tas bort innan du kan acceptera inbjudan.
                    </p>
                    <Link
                      href="/login"
                      className="text-sm text-primary hover:underline mt-3 inline-block"
                    >
                      Gå till inloggning
                    </Link>
                  </div>
                </div>
              </Card>
            ) : invite ? (
              <div className="space-y-6">
                <Card className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="p-2.5 rounded-lg bg-muted/50">
                      <Building2 className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium">{invite.companyName}</p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        Du har bjudits in som medlem till detta företag.
                      </p>
                    </div>
                  </div>
                </Card>

                <Button size="lg" className="w-full" onClick={handleAccept}>
                  Skapa konto och gå med
                </Button>

                <p className="text-center text-xs text-muted-foreground">
                  Genom att skapa ett konto godkänner du våra villkor.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  )
}
