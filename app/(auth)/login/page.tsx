'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, Mail, Sparkles } from 'lucide-react'
import { getErrorMessage } from '@/lib/errors/get-error-message'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isEmailSent, setIsEmailSent] = useState(false)
  const { toast } = useToast()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Mail className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-2xl">Kolla din e-post</CardTitle>
            <CardDescription>
              Vi har skickat en inloggningslänk till <strong>{email}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-muted-foreground mb-4">
              Klicka på länken i e-posten för att logga in. Länken är giltig i 1 timme.
            </p>
            <Button
              variant="ghost"
              onClick={() => setIsEmailSent(false)}
            >
              Använd en annan e-post
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">ERP Base</CardTitle>
          <CardDescription>
            Logga in med din e-post för att hantera din ekonomi
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-postadress</Label>
              <Input
                id="email"
                type="email"
                placeholder="namn@exempel.se"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={isLoading || !email}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Skickar...
                </>
              ) : (
                <>
                  <Mail className="mr-2 h-4 w-4" />
                  Skicka inloggningslänk
                </>
              )}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Genom att logga in godkänner du våra{' '}
            <a href="#" className="underline hover:text-primary">
              villkor
            </a>{' '}
            och{' '}
            <a href="#" className="underline hover:text-primary">
              integritetspolicy
            </a>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
