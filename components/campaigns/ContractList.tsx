'use client'

import { useState } from 'react'
import { Contract, ExtractionStatus } from '@/types'
import { ContractUpload } from './ContractUpload'
import { ExtractionStatusBadge } from '@/components/contracts/ExtractionStatusBadge'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import {
  FileText,
  Download,
  Trash2,
  Star,
  Calendar,
  Plus,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ContractListProps {
  campaignId: string
  contracts: Contract[]
  onUpdate: () => void
}

export function ContractList({ campaignId, contracts, onUpdate }: ContractListProps) {
  const { toast } = useToast()
  const [showUpload, setShowUpload] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [extractingId, setExtractingId] = useState<string | null>(null)

  const handleDownload = async (contract: Contract) => {
    setDownloadingId(contract.id)
    try {
      const response = await fetch(`/api/contracts/${contract.id}/download`)

      if (!response.ok) {
        throw new Error('Download failed')
      }

      const data = await response.json()

      // Open download in new tab
      window.open(data.url, '_blank')
    } catch (error) {
      toast({
        title: 'Fel',
        description: 'Kunde inte ladda ner filen',
        variant: 'destructive',
      })
    } finally {
      setDownloadingId(null)
    }
  }

  const handleDelete = async (contract: Contract) => {
    if (!confirm(`Ta bort "${contract.filename}"?`)) return

    try {
      const response = await fetch(`/api/contracts/${contract.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Delete failed')
      }

      toast({
        title: 'Avtal borttaget',
        description: contract.filename,
      })

      onUpdate()
    } catch (error) {
      toast({
        title: 'Fel',
        description: 'Kunde inte ta bort avtalet',
        variant: 'destructive',
      })
    }
  }

  const handleSetPrimary = async (contract: Contract) => {
    try {
      const response = await fetch(`/api/contracts/${contract.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_primary: true }),
      })

      if (!response.ok) {
        throw new Error('Update failed')
      }

      toast({
        title: 'Huvudavtal uppdaterat',
      })

      onUpdate()
    } catch (error) {
      toast({
        title: 'Fel',
        description: 'Kunde inte uppdatera',
        variant: 'destructive',
      })
    }
  }

  const handleExtract = async (contract: Contract) => {
    if (contract.mime_type !== 'application/pdf') {
      toast({
        title: 'Fel',
        description: 'Endast PDF-filer kan analyseras',
        variant: 'destructive',
      })
      return
    }

    setExtractingId(contract.id)
    try {
      const response = await fetch(`/api/contracts/${contract.id}/extract`, {
        method: 'POST',
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Extraction failed')
      }

      toast({
        title: 'Analys klar',
        description: 'Avtalsinformationen har extraherats',
      })

      onUpdate()
    } catch (error) {
      toast({
        title: 'Fel vid analys',
        description: error instanceof Error ? error.message : 'Kunde inte analysera avtalet',
        variant: 'destructive',
      })
    } finally {
      setExtractingId(null)
    }
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('sv-SE', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  }

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  const getFileIcon = (mimeType: string | null) => {
    if (mimeType?.startsWith('image/')) return '🖼️'
    if (mimeType === 'application/pdf') return '📄'
    if (mimeType?.includes('word')) return '📝'
    return '📎'
  }

  // Sort: primary first, then by upload date
  const sortedContracts = [...contracts].sort((a, b) => {
    if (a.is_primary && !b.is_primary) return -1
    if (!a.is_primary && b.is_primary) return 1
    return new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime()
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">
          Avtal
          <span className="text-muted-foreground ml-2">
            ({contracts.length})
          </span>
        </h3>
        <Button
          size="sm"
          variant={showUpload ? 'secondary' : 'default'}
          onClick={() => setShowUpload(!showUpload)}
        >
          {showUpload ? (
            <>
              <ChevronUp className="h-4 w-4 mr-1" />
              Stäng
            </>
          ) : (
            <>
              <Plus className="h-4 w-4 mr-1" />
              Ladda upp
            </>
          )}
        </Button>
      </div>

      {/* Upload section */}
      {showUpload && (
        <div className="p-4 border rounded-lg bg-muted/30">
          <ContractUpload
            campaignId={campaignId}
            onSuccess={() => {
              setShowUpload(false)
              onUpdate()
            }}
          />
        </div>
      )}

      {/* Contract list */}
      {sortedContracts.length > 0 ? (
        <div className="space-y-2">
          {sortedContracts.map(contract => (
            <div
              key={contract.id}
              className={cn(
                'flex items-center gap-3 p-3 border rounded-lg',
                contract.is_primary && 'border-primary/50 bg-primary/5'
              )}
            >
              <div className="text-2xl">
                {getFileIcon(contract.mime_type)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium truncate">{contract.filename}</p>
                  {contract.is_primary && (
                    <Badge variant="default" className="text-xs">
                      <Star className="h-3 w-3 mr-1" />
                      Huvudavtal
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span>{formatFileSize(contract.file_size)}</span>
                  {contract.signing_date && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Signerat: {formatDate(contract.signing_date)}
                    </span>
                  )}
                  <span>Uppladdat: {formatDate(contract.uploaded_at)}</span>
                  {contract.extraction_status && contract.extraction_status !== 'pending' && (
                    <ExtractionStatusBadge status={contract.extraction_status as ExtractionStatus} />
                  )}
                </div>
              </div>

              <div className="flex gap-1">
                {contract.mime_type === 'application/pdf' &&
                 contract.extraction_status !== 'completed' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleExtract(contract)}
                    disabled={extractingId === contract.id}
                    title="Analysera med AI"
                  >
                    {extractingId === contract.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                  </Button>
                )}
                {!contract.is_primary && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSetPrimary(contract)}
                    title="Sätt som huvudavtal"
                  >
                    <Star className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDownload(contract)}
                  disabled={downloadingId === contract.id}
                >
                  <Download className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(contract)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : !showUpload ? (
        <div className="text-center py-8 text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>Inga avtal uppladdade</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => setShowUpload(true)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Ladda upp avtal
          </Button>
        </div>
      ) : null}
    </div>
  )
}
