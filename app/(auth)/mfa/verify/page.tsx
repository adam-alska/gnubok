'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, ShieldCheck, LogOut } from 'lucide-react'
import { SupportLink } from '@/components/ui/support-link'

export default function MfaVerifyPage() {
  const [code, setCode] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [factorId, setFactorId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function loadFactor() {
      const { data } = await supabase.auth.mfa.listFactors()
      const verifiedFactor = data?.totp?.find(f => f.status === 'verified')
      if (verifiedFactor) {
        setFactorId(verifiedFactor.id)
      } else {
        // No MFA factor enrolled — shouldn't be here
        router.push('/')
      }
    }
    loadFactor()
    inputRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleVerify = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!factorId || code.length !== 6) return

    setIsLoading(true)

    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId,
      })

      if (challengeError) {
        toast({
          title: 'Verifiering misslyckades',
          description: 'Kunde inte starta verifiering. Försök igen.',
          variant: 'destructive',
        })
        setIsLoading(false)
        return
      }

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code,
      })

      if (verifyError) {
        toast({
          title: 'Fel kod',
          description: 'Kontrollera koden och försök igen.',
          variant: 'destructive',
        })
        setCode('')
        inputRef.current?.focus()
        setIsLoading(false)
        return
      }

      router.push('/')
      router.refresh()
    } catch {
      toast({
        title: 'Verifiering misslyckades',
        description: 'Ett oväntat fel uppstod. Försök igen.',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-background to-primary/[0.03] p-4">
      <div className="w-full max-w-sm animate-slide-up">
        <div className="text-center mb-10">
          <div className="flex justify-center mb-4">
            <div className="h-14 w-14 rounded-2xl bg-primary/8 flex items-center justify-center">
              <ShieldCheck className="h-7 w-7 text-primary" />
            </div>
          </div>
          <h1 className="text-2xl font-medium tracking-tight">Tvåfaktorsverifiering</h1>
          <p className="text-muted-foreground text-sm mt-2">
            Ange den 6-siffriga koden från din autentiseringsapp
          </p>
        </div>

        <div className="rounded-xl border bg-card p-6" style={{ boxShadow: 'var(--shadow-md)' }}>
          <form onSubmit={handleVerify} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="code">Verifieringskod</Label>
              <Input
                ref={inputRef}
                id="code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                autoComplete="one-time-code"
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                disabled={isLoading}
                className="h-11 text-center text-lg tracking-[0.5em] font-mono"
              />
            </div>
            <Button
              type="submit"
              className="w-full h-11"
              disabled={isLoading || code.length !== 6}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifierar...
                </>
              ) : (
                'Verifiera'
              )}
            </Button>
          </form>
        </div>

        <Button
          variant="ghost"
          className="w-full mt-4 text-muted-foreground"
          onClick={handleLogout}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Logga ut
        </Button>

        <p className="text-xs text-muted-foreground text-center mt-4">
          Förlorat din autentiseringsapp?{' '}
          <SupportLink variant="muted" subject="MFA-problem — kan inte logga in" className="inline">
            Kontakta support
          </SupportLink>
        </p>
      </div>
    </div>
  )
}
