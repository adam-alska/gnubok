'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Campaign,
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_TYPE_LABELS,
  BILLING_FREQUENCY_LABELS,
  CampaignStatus
} from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import { CampaignStatusBadge } from './CampaignStatusBadge'
import { DeliverableList } from './DeliverableList'
import { ExclusivityList } from './ExclusivityList'
import { ContractList } from './ContractList'
import { BriefingList } from './BriefingList'
import { CampaignInvoiceSummary } from './CampaignInvoiceSummary'
import { cn } from '@/lib/utils'
import {
  Building2,
  Calendar,
  Banknote,
  Edit2,
  Trash2,
  ArrowLeft,
  ChevronRight,
  Clock,
  FileText,
  Package,
  Shield,
  Receipt,
  BookOpen,
  Check,
  Circle,
} from 'lucide-react'
import Link from 'next/link'

interface CampaignDetailProps {
  campaign: Campaign
  onUpdate: () => void
  onEdit: () => void
}

const STATUS_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  negotiation: ['contracted', 'cancelled'],
  contracted: ['active', 'cancelled'],
  active: ['delivered', 'cancelled'],
  delivered: ['invoiced', 'active'],
  invoiced: ['completed', 'delivered'],
  completed: ['invoiced'],
  cancelled: ['negotiation'],
}

const LIFECYCLE_STEPS: { status: CampaignStatus; label: string }[] = [
  { status: 'negotiation', label: 'Förhandling' },
  { status: 'contracted', label: 'Avtalat' },
  { status: 'active', label: 'Aktivt' },
  { status: 'delivered', label: 'Levererat' },
  { status: 'invoiced', label: 'Fakturerat' },
  { status: 'completed', label: 'Klart' },
]

function getStepState(stepStatus: CampaignStatus, currentStatus: CampaignStatus): 'completed' | 'current' | 'upcoming' {
  const stepIndex = LIFECYCLE_STEPS.findIndex(s => s.status === stepStatus)
  const currentIndex = LIFECYCLE_STEPS.findIndex(s => s.status === currentStatus)
  if (currentStatus === 'cancelled') return 'upcoming'
  if (stepIndex < currentIndex) return 'completed'
  if (stepIndex === currentIndex) return 'current'
  return 'upcoming'
}

export function CampaignDetail({ campaign, onUpdate, onEdit }: CampaignDetailProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [isUpdating, setIsUpdating] = useState(false)

  const formatCurrency = (amount: number | null) => {
    if (!amount) return '-'
    return new Intl.NumberFormat('sv-SE', {
      style: 'currency',
      currency: campaign.currency || 'SEK',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const formatDate = (date: string | null) => {
    if (!date) return '-'
    return new Date(date).toLocaleDateString('sv-SE', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  }

  const handleStatusChange = async (newStatus: CampaignStatus) => {
    setIsUpdating(true)
    try {
      const response = await fetch(`/api/campaigns/${campaign.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })

      if (!response.ok) {
        throw new Error('Failed to update status')
      }

      toast({
        title: 'Status uppdaterad',
        description: CAMPAIGN_STATUS_LABELS[newStatus],
      })

      onUpdate()
    } catch (error) {
      toast({
        title: 'Fel',
        description: 'Kunde inte uppdatera status',
        variant: 'destructive',
      })
    } finally {
      setIsUpdating(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`Ta bort samarbetet "${campaign.name}"? Detta kan inte ångras.`)) return

    try {
      const response = await fetch(`/api/campaigns/${campaign.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete')
      }

      toast({
        title: 'Samarbete borttaget',
        description: campaign.name,
      })

      router.push('/campaigns')
    } catch (error) {
      toast({
        title: 'Fel',
        description: 'Kunde inte ta bort samarbetet',
        variant: 'destructive',
      })
    }
  }

  const availableTransitions = STATUS_TRANSITIONS[campaign.status] || []

  // Count items
  const deliverableCount = campaign.deliverables?.length || 0
  const exclusivityCount = campaign.exclusivities?.length || 0
  const contractCount = campaign.contracts?.length || 0
  const invoiceCount = campaign.invoices?.length || 0
  const briefingCount = campaign.briefings?.length || 0

  // Deliverable progress
  const completedDeliverables = campaign.deliverables?.filter(d =>
    ['approved', 'published'].includes(d.status)
  ).length || 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/campaigns"
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Tillbaka till samarbeten
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">{campaign.name}</h1>
          {(campaign.customer || campaign.brand_name) && (
            <p className="text-muted-foreground flex items-center gap-1 mt-1">
              {campaign.brand_name && (
                <span className="flex items-center gap-1">
                  {campaign.brand_name}
                </span>
              )}
              {campaign.brand_name && campaign.customer && (
                <ChevronRight className="h-4 w-4" />
              )}
              {campaign.customer && (
                <span className="flex items-center gap-1">
                  <Building2 className="h-4 w-4" />
                  {campaign.customer.name}
                </span>
              )}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Prominent "Create invoice" button when status is delivered */}
          {campaign.status === 'delivered' && (
            <Button
              onClick={() => router.push(`/invoices/new?campaign_id=${campaign.id}&customer_id=${campaign.customer_id}`)}
              className="bg-accent hover:bg-accent/90 text-accent-foreground"
            >
              <Receipt className="h-4 w-4 mr-1" />
              Skapa faktura
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Edit2 className="h-4 w-4 mr-1" />
            Redigera
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDelete}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Ta bort
          </Button>
        </div>
      </div>

      {/* Status and quick info */}
      <div className="flex flex-wrap items-center gap-3">
        <CampaignStatusBadge status={campaign.status} />
        <Badge variant="secondary">{CAMPAIGN_TYPE_LABELS[campaign.campaign_type]}</Badge>

        {availableTransitions.length > 0 && (
          <Select
            value=""
            onValueChange={(v) => handleStatusChange(v as CampaignStatus)}
            disabled={isUpdating}
          >
            <SelectTrigger className="w-[180px] h-8 text-sm">
              <SelectValue placeholder="Ändra status..." />
            </SelectTrigger>
            <SelectContent>
              {availableTransitions.map(status => (
                <SelectItem key={status} value={status}>
                  {CAMPAIGN_STATUS_LABELS[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Campaign lifecycle timeline */}
      {campaign.status !== 'cancelled' && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              {LIFECYCLE_STEPS.map((step, index) => {
                const state = getStepState(step.status, campaign.status)
                return (
                  <div key={step.status} className="flex items-center flex-1">
                    <div className="flex flex-col items-center">
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-colors",
                        state === 'completed' && "bg-success text-success-foreground",
                        state === 'current' && "bg-primary text-primary-foreground ring-4 ring-primary/20",
                        state === 'upcoming' && "bg-muted text-muted-foreground"
                      )}>
                        {state === 'completed' ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Circle className="h-3 w-3" />
                        )}
                      </div>
                      <span className={cn(
                        "text-[10px] mt-1.5 text-center leading-tight whitespace-nowrap",
                        state === 'current' ? "text-foreground font-medium" : "text-muted-foreground"
                      )}>
                        {step.label}
                      </span>
                    </div>
                    {index < LIFECYCLE_STEPS.length - 1 && (
                      <div className={cn(
                        "flex-1 h-0.5 mx-1",
                        state === 'completed' ? "bg-success" : "bg-muted"
                      )} />
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Overview cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="hover-lift">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Banknote className="h-4 w-4" />
              <span className="text-sm">Arvode</span>
            </div>
            <p className="text-2xl font-bold tabular-nums">{formatCurrency(campaign.total_value)}</p>
            {campaign.vat_included && (
              <p className="text-xs text-muted-foreground">inkl. moms</p>
            )}
          </CardContent>
        </Card>

        <Card className="hover-lift">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Calendar className="h-4 w-4" />
              <span className="text-sm">Publiceringsdatum</span>
            </div>
            <p className="font-medium">
              {campaign.publication_date ? formatDate(campaign.publication_date) : 'Ej satt'}
            </p>
            {campaign.draft_deadline && (
              <p className="text-sm text-muted-foreground">
                Utkast: {formatDate(campaign.draft_deadline)}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="hover-lift">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Package className="h-4 w-4" />
              <span className="text-sm">Innehåll</span>
            </div>
            <p className="font-medium">
              {deliverableCount > 0 ? (
                <span>{completedDeliverables}/{deliverableCount} klara</span>
              ) : (
                <span className="text-muted-foreground">Inga</span>
              )}
            </p>
            {deliverableCount > 0 && (
              <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-success rounded-full transition-all"
                  style={{ width: `${Math.round((completedDeliverables / deliverableCount) * 100)}%` }}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="hover-lift">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <FileText className="h-4 w-4" />
              <span className="text-sm">Avtal</span>
            </div>
            <p className="font-medium">
              {campaign.contract_signed_at
                ? formatDate(campaign.contract_signed_at)
                : 'Ej signerat'}
            </p>
            {contractCount > 0 && (
              <p className="text-sm text-muted-foreground">
                {contractCount} dokument
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Description */}
      {campaign.description && (
        <Card>
          <CardContent className="pt-4">
            <p className="text-muted-foreground whitespace-pre-wrap text-balance">
              {campaign.description}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Tabs for different sections */}
      <Tabs defaultValue="deliverables" className="space-y-4">
        <TabsList>
          <TabsTrigger value="deliverables" className="gap-2">
            <Package className="h-4 w-4" />
            Innehåll
            {deliverableCount > 0 && (
              <Badge variant="secondary" className="ml-1">{deliverableCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="exclusivities" className="gap-2">
            <Shield className="h-4 w-4" />
            Exklusivitet
            {exclusivityCount > 0 && (
              <Badge variant="secondary" className="ml-1">{exclusivityCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="briefings" className="gap-2">
            <BookOpen className="h-4 w-4" />
            Briefing
            {briefingCount > 0 && (
              <Badge variant="secondary" className="ml-1">{briefingCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="contracts" className="gap-2">
            <FileText className="h-4 w-4" />
            Avtal
            {contractCount > 0 && (
              <Badge variant="secondary" className="ml-1">{contractCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="invoices" className="gap-2">
            <Receipt className="h-4 w-4" />
            Fakturor
            {invoiceCount > 0 && (
              <Badge variant="secondary" className="ml-1">{invoiceCount}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="deliverables">
          <Card>
            <CardContent className="pt-6">
              <DeliverableList
                campaignId={campaign.id}
                deliverables={campaign.deliverables || []}
                onUpdate={onUpdate}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="exclusivities">
          <Card>
            <CardContent className="pt-6">
              <ExclusivityList
                campaignId={campaign.id}
                exclusivities={campaign.exclusivities || []}
                onUpdate={onUpdate}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="briefings">
          <Card>
            <CardContent className="pt-6">
              <BriefingList
                campaignId={campaign.id}
                briefings={campaign.briefings || []}
                onUpdate={onUpdate}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contracts">
          <Card>
            <CardContent className="pt-6">
              <ContractList
                campaignId={campaign.id}
                contracts={campaign.contracts || []}
                onUpdate={onUpdate}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invoices">
          <Card>
            <CardContent className="pt-6">
              <CampaignInvoiceSummary
                campaignId={campaign.id}
                invoices={campaign.invoices || []}
                totalValue={campaign.total_value}
                currency={campaign.currency}
                onCreateInvoice={() => {
                  router.push(`/invoices/new?campaign_id=${campaign.id}&customer_id=${campaign.customer_id}`)
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Notes */}
      {campaign.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Anteckningar</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground whitespace-pre-wrap">
              {campaign.notes}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
