'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, Mail, ArrowLeft, KeyRound } from 'lucide-react'
import Image from 'next/image'
import { getErrorMessage } from '@/lib/errors/get-error-message'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isEmailSent, setIsEmailSent] = useState(false)
  const [showResetPassword, setShowResetPassword] = useState(false)
  const { toast } = useToast()
  const router = useRouter()
  const supabase = createClient()

  const handlePasswordLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)

    const formData = new FormData(e.currentTarget)
    const emailValue = (formData.get('email') as string) || email
    const passwordValue = (formData.get('password') as string) || password

    try {
      console.log('[login] attempting signInWithPassword', {
        email: emailValue,
        hasPassword: !!passwordValue,
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      })

      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailValue,
        password: passwordValue,
      })

      if (error) {
        console.error('[login] signInWithPassword error', {
          message: error.message,
          code: error.code,
          status: error.status,
          name: error.name,
          stack: error.stack,
          cause: error.cause,
          fullError: JSON.stringify(error, Object.getOwnPropertyNames(error)),
        })
        toast({
          title: 'Inloggning misslyckades',
          description: error.message === 'Invalid login credentials'
            ? 'Fel e-post eller lösenord.'
            : getErrorMessage(error, { context: 'auth' }),
          variant: 'destructive',
        })
        return
      }

      console.log('[login] signInWithPassword success', {
        userId: data.user?.id,
        email: data.user?.email,
        hasSession: !!data.session,
        provider: data.user?.app_metadata?.provider,
      })

      // Check MFA status
      const { data: aal, error: mfaError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (mfaError) {
        console.error('[login] MFA check error', {
          message: mfaError.message,
          code: mfaError.code,
          status: mfaError.status,
          fullError: JSON.stringify(mfaError, Object.getOwnPropertyNames(mfaError)),
        })
      }
      console.log('[login] MFA status', { currentLevel: aal?.currentLevel, nextLevel: aal?.nextLevel })

      if (aal?.nextLevel === 'aal2' && aal?.currentLevel === 'aal1') {
        router.push('/mfa/verify')
        return
      }

      router.push('/')
      router.refresh()
    } catch (error) {
      console.error('[login] unexpected exception', {
        error,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        type: typeof error,
        constructor: error?.constructor?.name,
      })
      toast({
        title: 'Inloggning misslyckades',
        description: getErrorMessage(error, { context: 'auth' }),
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleResetPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)

    const formData = new FormData(e.currentTarget)
    const emailValue = (formData.get('email') as string) || email

    try {
      console.log('[login] attempting resetPasswordForEmail', {
        email: emailValue,
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      })

      const { error } = await supabase.auth.resetPasswordForEmail(emailValue, {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      })

      if (error) {
        console.error('[login] resetPasswordForEmail error', {
          message: error.message,
          code: error.code,
          status: error.status,
          name: error.name,
          stack: error.stack,
          cause: error.cause,
          fullError: JSON.stringify(error, Object.getOwnPropertyNames(error)),
        })
        toast({
          title: 'Kunde inte skicka återställningslänk',
          description: getErrorMessage(error, { context: 'auth' }),
          variant: 'destructive',
        })
        return
      }

      console.log('[login] resetPasswordForEmail success', { email: emailValue })
      setEmail(emailValue)
      setIsEmailSent(true)
      toast({
        title: 'Återställningslänk skickad!',
        description: 'Kolla din inkorg för att återställa lösenordet.',
      })
    } catch (error) {
      console.error('[login] resetPasswordForEmail unexpected exception', {
        error,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        type: typeof error,
        constructor: error?.constructor?.name,
      })
      toast({
        title: 'Kunde inte skicka återställningslänk',
        description: getErrorMessage(error, { context: 'auth' }),
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Email sent confirmation screen
  if (isEmailSent) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-background to-primary/[0.03] p-4">
        <div className="w-full max-w-sm animate-slide-up space-y-8">
          <div className="flex justify-center">
            <div className="h-14 w-14 rounded-2xl bg-primary/8 flex items-center justify-center">
              <Mail className="h-7 w-7 text-primary" />
            </div>
          </div>

          <div className="text-center space-y-2">
            <h1 className="text-2xl font-medium tracking-tight">Kolla din e-post</h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Vi har skickat en {showResetPassword ? 'återställningslänk' : 'inloggningslänk'} till{' '}
              <span className="font-medium text-foreground">{email}</span>
            </p>
          </div>

          <div className="rounded-xl border bg-card p-4">
            <p className="text-sm text-muted-foreground text-center leading-relaxed">
              Klicka på länken i e-posten för att {showResetPassword ? 'återställa ditt lösenord' : 'logga in'}.
              Länken är giltig i 1 timme.
            </p>
          </div>

          <Button
            variant="ghost"
            className="w-full text-muted-foreground"
            onClick={() => {
              setIsEmailSent(false)
              setShowResetPassword(false)
            }}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Tillbaka
          </Button>
        </div>
      </div>
    )
  }

  // Reset password form
  if (showResetPassword) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-background to-primary/[0.03] p-4">
        <div className="w-full max-w-sm animate-slide-up">
          <div className="text-center mb-10">
            <div className="flex justify-center mb-4">
              <div className="h-14 w-14 rounded-2xl bg-primary/8 flex items-center justify-center">
                <KeyRound className="h-7 w-7 text-primary" />
              </div>
            </div>
            <h1 className="text-2xl font-medium tracking-tight">Återställ lösenord</h1>
            <p className="text-muted-foreground text-sm mt-2">
              Ange din e-postadress så skickar vi en återställningslänk
            </p>
          </div>

          <div className="rounded-xl border bg-card p-6" style={{ boxShadow: 'var(--shadow-md)' }}>
            <form onSubmit={handleResetPassword} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">E-postadress</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="namn@exempel.se"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                  className="h-11"
                />
              </div>
              <Button type="submit" className="w-full h-11" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Skickar...
                  </>
                ) : (
                  'Skicka återställningslänk'
                )}
              </Button>
            </form>
          </div>

          <Button
            variant="ghost"
            className="w-full mt-4 text-muted-foreground"
            onClick={() => setShowResetPassword(false)}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Tillbaka till inloggning
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-background to-primary/[0.03] p-4">
      <div className="w-full max-w-sm animate-slide-up">
        <div className="text-center mb-10">
          <Image
            src="/gnubokiceon-removebg-preview.png"
            alt="Gnubok"
            width={240}
            height={240}
            className="mx-auto mb-2"
            priority
          />
          <p className="text-muted-foreground text-sm mt-3">
            Logga in för att hantera din ekonomi
          </p>
        </div>

        <div className="rounded-xl border bg-card p-6" style={{ boxShadow: 'var(--shadow-md)' }}>
          <form onSubmit={handlePasswordLogin} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">E-postadress</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="namn@exempel.se"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Lösenord</Label>
                <button
                  type="button"
                  onClick={() => setShowResetPassword(true)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
                >
                  Glömt lösenord?
                </button>
              </div>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="Ditt lösenord"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                className="h-11"
              />
            </div>
            <Button type="submit" className="w-full h-11" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loggar in...
                </>
              ) : (
                'Logga in'
              )}
            </Button>
          </form>

          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">eller</span>
            </div>
          </div>

          <Button
            variant="outline"
            className="w-full"
            asChild
          >
            <Link href="/register">
              Skapa konto
            </Link>
          </Button>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground leading-relaxed">
          Genom att logga in godkänner du våra{' '}
          <a href="#" className="underline underline-offset-2 hover:text-foreground transition-colors">
            villkor
          </a>{' '}
          och{' '}
          <a href="#" className="underline underline-offset-2 hover:text-foreground transition-colors">
            integritetspolicy
          </a>
          .
        </p>
      </div>
    </div>
  )
}
