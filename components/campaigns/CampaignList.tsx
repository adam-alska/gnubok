'use client'

import { useState } from 'react'
import { Campaign, CampaignStatus, CampaignType, CAMPAIGN_STATUS_LABELS, CAMPAIGN_TYPE_LABELS } from '@/types'
import { CampaignCard } from './CampaignCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search, X } from 'lucide-react'
import { EmptyCampaigns } from '@/components/ui/empty-state'

interface CampaignListProps {
  campaigns: Campaign[]
  loading?: boolean
}

const STATUS_OPTIONS: { value: CampaignStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Alla statusar' },
  { value: 'negotiation', label: CAMPAIGN_STATUS_LABELS.negotiation },
  { value: 'contracted', label: CAMPAIGN_STATUS_LABELS.contracted },
  { value: 'active', label: CAMPAIGN_STATUS_LABELS.active },
  { value: 'delivered', label: CAMPAIGN_STATUS_LABELS.delivered },
  { value: 'invoiced', label: CAMPAIGN_STATUS_LABELS.invoiced },
  { value: 'completed', label: CAMPAIGN_STATUS_LABELS.completed },
  { value: 'cancelled', label: CAMPAIGN_STATUS_LABELS.cancelled },
]

const TYPE_OPTIONS: { value: CampaignType | 'all'; label: string }[] = [
  { value: 'all', label: 'Alla typer' },
  { value: 'influencer', label: CAMPAIGN_TYPE_LABELS.influencer },
  { value: 'ugc', label: CAMPAIGN_TYPE_LABELS.ugc },
  { value: 'ambassador', label: CAMPAIGN_TYPE_LABELS.ambassador },
]

export function CampaignList({ campaigns, loading }: CampaignListProps) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | 'all'>('all')
  const [typeFilter, setTypeFilter] = useState<CampaignType | 'all'>('all')

  // Filter campaigns
  const filteredCampaigns = campaigns.filter(campaign => {
    // Search filter
    if (search) {
      const searchLower = search.toLowerCase()
      const matchesName = campaign.name.toLowerCase().includes(searchLower)
      const matchesCustomer = campaign.customer?.name.toLowerCase().includes(searchLower)
      const matchesDescription = campaign.description?.toLowerCase().includes(searchLower)
      if (!matchesName && !matchesCustomer && !matchesDescription) {
        return false
      }
    }

    // Status filter
    if (statusFilter !== 'all' && campaign.status !== statusFilter) {
      return false
    }

    // Type filter
    if (typeFilter !== 'all' && campaign.campaign_type !== typeFilter) {
      return false
    }

    return true
  })

  // Group by status for active view
  const activeStatuses: CampaignStatus[] = ['active', 'contracted', 'negotiation', 'delivered', 'invoiced']
  const activeCampaigns = filteredCampaigns.filter(c => activeStatuses.includes(c.status))
  const completedCampaigns = filteredCampaigns.filter(c => c.status === 'completed')
  const cancelledCampaigns = filteredCampaigns.filter(c => c.status === 'cancelled')

  const hasFilters = search || statusFilter !== 'all' || typeFilter !== 'all'

  const clearFilters = () => {
    setSearch('')
    setStatusFilter('all')
    setTypeFilter('all')
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-40 bg-muted animate-pulse rounded-lg" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Sök samarbeten..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as CampaignStatus | 'all')}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as CampaignType | 'all')}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Typ" />
          </SelectTrigger>
          <SelectContent>
            {TYPE_OPTIONS.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="icon" onClick={clearFilters}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Results */}
      {filteredCampaigns.length === 0 ? (
        hasFilters ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              Inga samarbeten matchar filtren
            </p>
            <Button variant="outline" className="mt-4" onClick={clearFilters}>
              Rensa filter
            </Button>
          </div>
        ) : (
          <EmptyCampaigns />
        )
      ) : (
        <div className="space-y-8">
          {/* Active campaigns */}
          {activeCampaigns.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-3">
                Aktiva ({activeCampaigns.length})
              </h3>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {activeCampaigns.map(campaign => (
                  <CampaignCard key={campaign.id} campaign={campaign} />
                ))}
              </div>
            </div>
          )}

          {/* Completed campaigns */}
          {completedCampaigns.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-3">
                Avslutade ({completedCampaigns.length})
              </h3>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {completedCampaigns.map(campaign => (
                  <CampaignCard key={campaign.id} campaign={campaign} />
                ))}
              </div>
            </div>
          )}

          {/* Cancelled campaigns */}
          {cancelledCampaigns.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-3">
                Avbrutna ({cancelledCampaigns.length})
              </h3>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {cancelledCampaigns.map(campaign => (
                  <CampaignCard key={campaign.id} campaign={campaign} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
