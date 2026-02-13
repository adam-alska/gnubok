'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Campaign, Customer } from '@/types'
import { CampaignList, CampaignForm } from '@/components/campaigns'
import { useToast } from '@/components/ui/use-toast'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Plus, FileUp } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function CampaignsPage() {
  const supabase = createClient()
  const router = useRouter()
  const { toast } = useToast()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)

  const fetchData = async () => {
    try {
      // Fetch campaigns
      const campaignsResponse = await fetch('/api/campaigns')
      if (campaignsResponse.ok) {
        const { data } = await campaignsResponse.json()
        setCampaigns(data || [])
      }

      // Fetch customers for the form
      const { data: customersData } = await supabase
        .from('customers')
        .select('*')
        .order('name')

      setCustomers(customersData || [])
    } catch (error) {
      toast({
        title: 'Fel',
        description: 'Kunde inte ladda data',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Samarbeten"
        description="Hantera dina samarbeten, innehåll och avtal"
        action={
          <div className="flex gap-2">
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Skapa samarbete
            </Button>
            <Button variant="outline" onClick={() => router.push('/campaigns/import')}>
              <FileUp className="mr-2 h-4 w-4" />
              Importera avtal
            </Button>
          </div>
        }
      />

      <CampaignList campaigns={campaigns} loading={loading} />

      <CampaignForm
        open={formOpen}
        onOpenChange={setFormOpen}
        customers={customers}
        onSuccess={() => {
          setFormOpen(false)
          fetchData()
        }}
      />
    </div>
  )
}
