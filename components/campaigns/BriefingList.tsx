'use client'

import { useState, useRef } from 'react'
import { Briefing, BriefingType, BRIEFING_TYPE_LABELS } from '@/types'
import { BriefingForm } from './BriefingForm'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import {
  FileText,
  Link2,
  AlignLeft,
  Download,
  Trash2,
  Edit2,
  Plus,
  ChevronUp,
  ExternalLink,
  ChevronDown,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface BriefingListProps {
  campaignId: string
  briefings: Briefing[]
  onUpdate: () => void
}

export function BriefingList({ campaignId, briefings, onUpdate }: BriefingListProps) {
  const { toast } = useToast()
  const [showForm, setShowForm] = useState(false)
  const [editingBriefing, setEditingBriefing] = useState<Briefing | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [expandedTextId, setExpandedTextId] = useState<string | null>(null)

  const handleDownload = async (briefing: Briefing) => {
    if (briefing.briefing_type !== 'pdf') return

    setDownloadingId(briefing.id)
    try {
      const response = await fetch(`/api/briefings/${briefing.id}/download`)

      if (!response.ok) {
        throw new Error('Download failed')
      }

      const data = await response.json()
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

  const handleDelete = async (briefing: Briefing) => {
    if (!confirm(`Ta bort "${briefing.title}"?`)) return

    try {
      const response = await fetch(`/api/briefings/${briefing.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Delete failed')
      }

      toast({
        title: 'Briefing borttagen',
        description: briefing.title,
      })

      onUpdate()
    } catch (error) {
      toast({
        title: 'Fel',
        description: 'Kunde inte ta bort briefingen',
        variant: 'destructive',
      })
    }
  }

  const handleOpenLink = (briefing: Briefing) => {
    if (briefing.briefing_type !== 'link' || !briefing.content) return
    window.open(briefing.content, '_blank', 'noopener,noreferrer')
  }

  const handleEdit = (briefing: Briefing) => {
    setEditingBriefing(briefing)
    setShowForm(true)
  }

  const handleFormClose = () => {
    setShowForm(false)
    setEditingBriefing(null)
  }

  const handleFormSuccess = () => {
    handleFormClose()
    onUpdate()
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

  const getTypeIcon = (type: BriefingType) => {
    switch (type) {
      case 'pdf':
        return <FileText className="h-5 w-5 text-red-500" />
      case 'link':
        return <Link2 className="h-5 w-5 text-blue-500" />
      case 'text':
        return <AlignLeft className="h-5 w-5 text-green-500" />
    }
  }

  const getTypeBadgeColor = (type: BriefingType) => {
    switch (type) {
      case 'pdf':
        return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
      case 'link':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
      case 'text':
        return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
    }
  }

  const truncateUrl = (url: string, maxLength: number = 40) => {
    if (url.length <= maxLength) return url
    return url.substring(0, maxLength) + '...'
  }

  // Sort by created date (newest first)
  const sortedBriefings = [...briefings].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">
          Briefing
          <span className="text-muted-foreground ml-2">
            ({briefings.length})
          </span>
        </h3>
        <Button
          size="sm"
          variant={showForm ? 'secondary' : 'default'}
          onClick={() => {
            if (showForm) {
              handleFormClose()
            } else {
              setShowForm(true)
            }
          }}
        >
          {showForm ? (
            <>
              <ChevronUp className="h-4 w-4 mr-1" />
              Stang
            </>
          ) : (
            <>
              <Plus className="h-4 w-4 mr-1" />
              Lagg till
            </>
          )}
        </Button>
      </div>

      {/* Form section */}
      {showForm && (
        <div className="p-4 border rounded-lg bg-muted/30">
          <BriefingForm
            campaignId={campaignId}
            briefing={editingBriefing}
            onSuccess={handleFormSuccess}
            onCancel={handleFormClose}
          />
        </div>
      )}

      {/* Briefing list */}
      {sortedBriefings.length > 0 ? (
        <div className="space-y-2">
          {sortedBriefings.map(briefing => (
            <div
              key={briefing.id}
              className="p-3 border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  {getTypeIcon(briefing.briefing_type)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium">{briefing.title}</p>
                    <Badge
                      variant="secondary"
                      className={cn('text-xs', getTypeBadgeColor(briefing.briefing_type))}
                    >
                      {BRIEFING_TYPE_LABELS[briefing.briefing_type]}
                    </Badge>
                  </div>

                  {/* Type-specific content display */}
                  {briefing.briefing_type === 'pdf' && briefing.filename && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {briefing.filename}
                      {briefing.file_size && (
                        <span className="ml-2">({formatFileSize(briefing.file_size)})</span>
                      )}
                    </p>
                  )}

                  {briefing.briefing_type === 'link' && briefing.content && (
                    <button
                      onClick={() => handleOpenLink(briefing)}
                      className="text-sm text-blue-600 hover:underline flex items-center gap-1 mt-1"
                    >
                      {truncateUrl(briefing.content)}
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  )}

                  {briefing.briefing_type === 'text' && briefing.text_content && (
                    <div className="mt-2">
                      <div
                        className={cn(
                          'text-sm text-muted-foreground bg-muted/50 rounded p-2 whitespace-pre-wrap',
                          expandedTextId !== briefing.id && 'max-h-20 overflow-hidden'
                        )}
                      >
                        {briefing.text_content}
                      </div>
                      {briefing.text_content.length > 200 && (
                        <button
                          onClick={() =>
                            setExpandedTextId(
                              expandedTextId === briefing.id ? null : briefing.id
                            )
                          }
                          className="text-xs text-primary hover:underline mt-1 flex items-center gap-1"
                        >
                          {expandedTextId === briefing.id ? (
                            <>
                              <ChevronUp className="h-3 w-3" />
                              Visa mindre
                            </>
                          ) : (
                            <>
                              <ChevronDown className="h-3 w-3" />
                              Visa mer
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  )}

                  {briefing.notes && (
                    <p className="text-sm text-muted-foreground italic mt-1">
                      {briefing.notes}
                    </p>
                  )}

                  <p className="text-xs text-muted-foreground mt-1">
                    Tillagd: {formatDate(briefing.created_at)}
                  </p>
                </div>

                <div className="flex gap-1 shrink-0">
                  {briefing.briefing_type === 'pdf' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDownload(briefing)}
                      disabled={downloadingId === briefing.id}
                      title="Ladda ner"
                    >
                      {downloadingId === briefing.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                  {briefing.briefing_type === 'link' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenLink(briefing)}
                      title="Oppna lank"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEdit(briefing)}
                    title="Redigera"
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(briefing)}
                    className="text-destructive hover:text-destructive"
                    title="Ta bort"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : !showForm ? (
        <div className="text-center py-8 text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>Ingen briefing tillagd</p>
          <p className="text-sm mt-1">
            Lagg till PDF-dokument, lankar eller text fran uppdragsgivaren
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => setShowForm(true)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Lagg till briefing
          </Button>
        </div>
      ) : null}
    </div>
  )
}
