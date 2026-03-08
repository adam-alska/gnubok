'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, KeyRound } from 'lucide-react'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()
  const router = useRouter()
  const supabase = createClient()

  const handleResetPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)

    const strong = password.length >= 8
      && /[a-z]/.test(password)
      && /[A-Z]/.test(password)
      && /[0-9]/.test(password)
      && /[^a-zA-Z0-9]/.test(password)

    if (!strong) {
      toast({
        title: 'Lösenordet är för svagt',
        description: 'Lösenordet måste vara minst 8 tecken och innehålla versaler, gemener, siffror och specialtecken.',
        variant: 'destructive',
      })
      setIsLoading(false)
      return
    }

    if (password !== confirmPassword) {
      toast({
        title: 'Lösenorden matchar inte',
        description: 'Kontrollera att du skrev samma lösenord i båda fälten.',
        variant: 'destructive',
      })
      setIsLoading(false)
      return
    }

    try {
      const { error } = await supabase.auth.updateUser({ password })

      if (error) {
        toast({
          title: 'Kunde inte uppdatera lösenord',
          description: error.message,
          variant: 'destructive',
        })
        return
      }

      toast({
        title: 'Lösenord uppdaterat',
        description: 'Ditt lösenord har ändrats.',
      })

      router.push('/')
      router.refresh()
    } catch {
      toast({
        title: 'Något gick fel',
        description: 'Försök igen senare.',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-background to-primary/[0.03] p-4">
      <div className="w-full max-w-sm animate-slide-up">
        <div className="text-center mb-10">
          <div className="flex justify-center mb-4">
            <div className="h-14 w-14 rounded-2xl bg-primary/8 flex items-center justify-center">
              <KeyRound className="h-7 w-7 text-primary" />
            </div>
          </div>
          <h1 className="text-2xl font-medium tracking-tight">Nytt lösenord</h1>
          <p className="text-muted-foreground text-sm mt-2">
            Ange ditt nya lösenord nedan
          </p>
        </div>

        <div className="rounded-xl border bg-card p-6" style={{ boxShadow: 'var(--shadow-md)' }}>
          <form onSubmit={handleResetPassword} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="password">Nytt lösenord</Label>
              <Input
                id="password"
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
                  Sparar...
                </>
              ) : (
                'Spara nytt lösenord'
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
