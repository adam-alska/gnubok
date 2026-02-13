'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/use-toast'
import ShadowLedgerForm from '@/components/shadow-ledger/ShadowLedgerForm'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft } from 'lucide-react'
import type { CreateShadowLedgerEntryInput } from '@/types'

interface UmbrellaSettings {
  umbrella_provider: string | null
  umbrella_fee_percent: number | null
  umbrella_pension_percent: number | null
  municipal_tax_rate: number | null
}

export default function NewShadowLedgerEntryPage() {
  const router = useRouter()
  const { toast } = useToast()

  const [settings, setSettings] = useState<UmbrellaSettings | undefined>(undefined)
  const [isLoadingSettings, setIsLoadingSettings] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Fetch umbrella settings from company_settings
  useEffect(() => {
    async function fetchSettings() {
      try {
        const supabase = createClient()
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user) return

        const { data, error } = await supabase
          .from('company_settings')
          .select(
            'umbrella_provider, umbrella_fee_percent, umbrella_pension_percent, municipal_tax_rate'
          )
          .eq('user_id', user.id)
          .single()

        if (error) {
          console.error('Failed to fetch settings:', error)
          return
        }

        if (data) {
          setSettings({
            umbrella_provider: data.umbrella_provider,
            umbrella_fee_percent: data.umbrella_fee_percent,
            umbrella_pension_percent: data.umbrella_pension_percent,
            municipal_tax_rate: data.municipal_tax_rate,
          })
        }
      } catch (error) {
        console.error('Failed to load settings:', error)
      } finally {
        setIsLoadingSettings(false)
      }
    }

    fetchSettings()
  }, [])

  const handleSubmit = async (data: CreateShadowLedgerEntryInput) => {
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/shadow-ledger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Kunde inte spara post')
      }

      toast({
        title: 'Post sparad',
        description: data.description || 'Ny skuggbokf\u00f6ringspost skapad',
      })

      router.push('/shadow-ledger')
    } catch (error) {
      toast({
        title: 'Fel',
        description:
          error instanceof Error ? error.message : 'Kunde inte spara post',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Button variant="ghost" size="sm" asChild>
        <Link href="/shadow-ledger">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Tillbaka till skuggbokf\u00f6ring
        </Link>
      </Button>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Ny post</CardTitle>
          <CardDescription>
            Registrera en utbetalning, g\u00e5va eller annan transaktion
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingSettings ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-3/4" />
            </div>
          ) : (
            <ShadowLedgerForm
              onSubmit={handleSubmit}
              isLoading={isSubmitting}
              settings={settings}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
