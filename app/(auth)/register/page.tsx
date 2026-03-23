'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, Mail, ArrowLeft } from 'lucide-react'
import Image from 'next/image'
import { getErrorMessage } from '@/lib/errors/get-error-message'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isRegistered, setIsRegistered] = useState(false)
  const { toast } = useToast()
  const supabase = createClient()

  function isStrongPassword(pw: string): boolean {
    return pw.length >= 8
      && /[a-z]/.test(pw)
      && /[A-Z]/.test(pw)
      && /[0-9]/.test(pw)
      && /[^a-zA-Z0-9]/.test(pw)
  }

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)

    const formData = new FormData(e.currentTarget)
    const emailValue = (formData.get('email') as string) || email
    const passwordValue = (formData.get('password') as string) || password
    const confirmValue = (formData.get('confirm_password') as string) || confirmPassword

    if (!isStrongPassword(passwordValue)) {
      toast({
        title: 'Lösenordet är för svagt',
        description: 'Lösenordet måste vara minst 8 tecken och innehålla versaler, gemener, siffror och specialtecken.',
        variant: 'destructive',
      })
      setIsLoading(false)
      return
    }

    if (passwordValue !== confirmValue) {
      toast({
        title: 'Lösenorden matchar inte',
        description: 'Kontrollera att du skrev samma lösenord i båda fälten.',
        variant: 'destructive',
      })
      setIsLoading(false)
      return
    }

    try {
      console.log('[register] attempting signUp', {
        email: emailValue,
        hasPassword: !!passwordValue,
        passwordLength: passwordValue.length,
        redirectTo: `${window.location.origin}/auth/callback`,
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      })

      const { data, error } = await supabase.auth.signUp({
        email: emailValue,
        password: passwordValue,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (error) {
        console.error('[register] signUp error', {
          message: error.message,
          code: error.code,
          status: error.status,
          name: error.name,
          stack: error.stack,
          cause: error.cause,
          fullError: JSON.stringify(error, Object.getOwnPropertyNames(error)),
        })
        toast({
          title: 'Registrering misslyckades',
          description: getErrorMessage(error, { context: 'auth' }),
          variant: 'destructive',
        })
        return
      }

      console.log('[register] signUp response', {
        userId: data.user?.id,
        email: data.user?.email,
        isAnonymous: data.user?.is_anonymous,
        identities: data.user?.identities?.length,
        hasSession: !!data.session,
        confirmationSentAt: data.user?.confirmation_sent_at,
        provider: data.user?.app_metadata?.provider,
      })

      setEmail(emailValue)
      setIsRegistered(true)
    } catch (error) {
      console.error('[register] unexpected exception', {
        error,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        type: typeof error,
        constructor: error?.constructor?.name,
      })
      toast({
        title: 'Registrering misslyckades',
        description: getErrorMessage(error, { context: 'auth' }),
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  if (isRegistered) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-background to-primary/[0.03] p-4">
        <div className="w-full max-w-sm animate-slide-up space-y-8">
          <div className="flex justify-center">
            <div className="h-14 w-14 rounded-2xl bg-primary/8 flex items-center justify-center">
              <Mail className="h-7 w-7 text-primary" />
            </div>
          </div>

          <div className="text-center space-y-2">
            <h1 className="text-2xl font-medium tracking-tight">Bekräfta din e-post</h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Vi har skickat en bekräftelselänk till{' '}
              <span className="font-medium text-foreground">{email}</span>
            </p>
          </div>

          <div className="rounded-xl border bg-card p-4">
            <p className="text-sm text-muted-foreground text-center leading-relaxed">
              Klicka på länken i e-posten för att aktivera ditt konto.
              Länken är giltig i 24 timmar.
            </p>
          </div>

          <Button variant="ghost" className="w-full text-muted-foreground" asChild>
            <Link href="/login">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Tillbaka till inloggning
            </Link>
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
            Skapa ett konto för att komma igång
          </p>
        </div>

        <div className="rounded-xl border bg-card p-6" style={{ boxShadow: 'var(--shadow-md)' }}>
          <form onSubmit={handleRegister} className="space-y-5">
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
              <Label htmlFor="password">Lösenord</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                placeholder="Minst 8 tecken, Aa1!"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                disabled={isLoading}
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm_password">Bekräfta lösenord</Label>
              <Input
                id="confirm_password"
                name="confirm_password"
                type="password"
                autoComplete="new-password"
                placeholder="Upprepa lösenordet"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                disabled={isLoading}
                className="h-11"
              />
            </div>
            <Button type="submit" className="w-full h-11" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Skapar konto...
                </>
              ) : (
                'Skapa konto'
              )}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Har du redan ett konto?{' '}
          <Link
            href="/login"
            className="font-medium text-foreground underline underline-offset-2 hover:text-primary transition-colors"
          >
            Logga in
          </Link>
        </p>

        <p className="mt-4 text-center text-xs text-muted-foreground leading-relaxed">
          Genom att skapa konto godkänner du våra{' '}
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
