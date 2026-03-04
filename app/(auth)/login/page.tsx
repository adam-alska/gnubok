'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, Mail, ArrowLeft } from 'lucide-react'
import { getErrorMessage } from '@/lib/errors/get-error-message'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isEmailSent, setIsEmailSent] = useState(false)
  const { toast } = useToast()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)

    // Read from DOM to handle browser autofill (which may not trigger onChange)
    const formData = new FormData(e.currentTarget)
    const emailValue = (formData.get('email') as string) || email

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: emailValue,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (error) {
        toast({
          title: 'Inloggning misslyckades',
          description: getErrorMessage(error, { context: 'auth' }),
          variant: 'destructive',
        })
        return
      }

      setEmail(emailValue)
      setIsEmailSent(true)
      toast({
        title: 'E-post skickad!',
        description: 'Kolla din inkorg för att logga in.',
      })
    } catch (error) {
      toast({
        title: 'Inloggning misslyckades',
        description: getErrorMessage(error, { context: 'auth' }),
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

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
              Vi har skickat en inloggningslänk till{' '}
              <span className="font-medium text-foreground">{email}</span>
            </p>
          </div>

          <div className="rounded-xl border bg-card p-4">
            <p className="text-sm text-muted-foreground text-center leading-relaxed">
              Klicka på länken i e-posten för att logga in.
              Länken är giltig i 1 timme.
            </p>
          </div>

          <Button
            variant="ghost"
            className="w-full text-muted-foreground"
            onClick={() => setIsEmailSent(false)}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Använd en annan e-post
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-background to-primary/[0.03] p-4">
      <div className="w-full max-w-sm animate-slide-up">
        <div className="text-center mb-10">
          <h1 className="font-display text-[2.75rem] leading-none font-medium tracking-tight text-foreground">
            Gnubok
          </h1>
          <p className="text-muted-foreground text-sm mt-3">
            Logga in med din e-post för att hantera din ekonomi
          </p>
        </div>

        <div className="rounded-xl border bg-card p-6" style={{ boxShadow: 'var(--shadow-md)' }}>
          <form onSubmit={handleLogin} className="space-y-5">
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
            <Button
              type="submit"
              className="w-full h-11"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Skickar...
                </>
              ) : (
                'Skicka inloggningslänk'
              )}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground leading-relaxed">
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
