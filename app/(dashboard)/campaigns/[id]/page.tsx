'use client'

import { useState, useEffect, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Campaign, Customer } from '@/types'
import { CampaignDetail, CampaignForm } from '@/components/campaigns'
import { useToast } from '@/components/ui/use-toast'
import { Skeleton } from '@/components/ui/skeleton'

interface PageProps {
  params: Promise<{ id: string }>
}

export default function CampaignDetailPage({ params }: PageProps) {
  const { id } = use(params)
  const supabase = createClient()
  const { toast } = useToast()
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [editFormOpen, setEditFormOpen] = useState(false)

  const fetchCampaign = async () => {
    try {
      const response = await fetch(`/api/campaigns/${id}`)
      if (response.ok) {
        const { data } = await response.json()
        setCampaign(data)
      } else {
        toast({
          title: 'Fel',
          description: 'Samarbetet hittades inte',
          variant: 'destructive',
        })
      }
    } catch (error) {
      toast({
        title: 'Fel',
        description: 'Kunde inte ladda samarbetet',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const fetchCustomers = async () => {
    const { data } = await supabase
      .from('customers')
      .select('*')
      .order('name')
    setCustomers(data || [])
  }

  useEffect(() => {
    fetchCampaign()
    fetchCustomers()
  }, [id])

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-6 w-48" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    )
  }

  if (!campaign) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Samarbetet hittades inte</p>
      </div>
    )
  }

  return (
    <>
      <CampaignDetail
        campaign={campaign}
        onUpdate={fetchCampaign}
        onEdit={() => setEditFormOpen(true)}
      />

      <CampaignForm
        open={editFormOpen}
        onOpenChange={setEditFormOpen}
        initialData={campaign}
        customers={customers}
        onSuccess={() => {
          setEditFormOpen(false)
          fetchCampaign()
        }}
      />
    </>
  )
}
