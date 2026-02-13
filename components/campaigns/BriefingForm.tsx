'use client'

import { useState, useRef } from 'react'
import { Briefing, BriefingType, BRIEFING_TYPE_LABELS } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import { useToast } from '@/components/ui/use-toast'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Upload, FileText, X, Link2, AlignLeft, Loader2, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BriefingFormProps {
  campaignId: string
  briefing?: Briefing | null
  onSuccess: () => void
  onCancel: () => void
}

export function BriefingForm({ campaignId, briefing, onSuccess, onCancel }: BriefingFormProps) {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isEditing = !!briefing

  // Form state
  const [briefingType, setBriefingType] = useState<BriefingType>(briefing?.briefing_type || 'link')
  const [title, setTitle] = useState(briefing?.title || '')
  const [linkUrl, setLinkUrl] = useState(briefing?.briefing_type === 'link' ? briefing?.content || '' : '')
  const [textContent, setTextContent] = useState(briefing?.text_content || '')
  const [notes, setNotes] = useState(briefing?.notes || '')

  // File upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)

  // AI summary state
  const [aiSummary, setAiSummary] = useState('')
  const [isSummarizing, setIsSummarizing] = useState(false)

  const handleSummarize = async () => {
    if (!textContent.trim()) {
      toast({
        title: 'Text saknas',
        description: 'Ange text att sammanfatta',
        variant: 'destructive',
      })
      return
    }

    setIsSummarizing(true)
    try {
      const response = await fetch('/api/briefings/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textContent }),
      })

      if (!response.ok) {
        throw new Error('Summarization failed')
      }

      const { data } = await response.json()
      setAiSummary(data.summary)
    } catch (error) {
      toast({
        title: 'Fel',
        description: 'Kunde inte sammanfatta texten',
        variant: 'destructive',
      })
    } finally {
      setIsSummarizing(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // Validate file type (only PDF for briefings)
      if (file.type !== 'application/pdf') {
        toast({
          title: 'Ogiltig filtyp',
          description: 'Endast PDF-filer ar tillåtna',
          variant: 'destructive',
        })
        return
      }

      // Check file size (10MB max)
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: 'Filen ar for stor',
          description: 'Max filstorlek ar 10MB',
          variant: 'destructive',
        })
        return
      }

      setSelectedFile(file)
      // Auto-fill title from filename if empty
      if (!title) {
        setTitle(file.name.replace(/\.pdf$/i, ''))
      }
    }
  }

  const clearFileSelection = () => {
    setSelectedFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validation
    if (!title.trim()) {
      toast({
        title: 'Titel saknas',
        description: 'Ange en titel for briefingen',
        variant: 'destructive',
      })
      return
    }

    if (briefingType === 'link' && !linkUrl.trim()) {
      toast({
        title: 'Lank saknas',
        description: 'Ange en URL for briefingen',
        variant: 'destructive',
      })
      return
    }

    if (briefingType === 'text' && !textContent.trim()) {
      toast({
        title: 'Text saknas',
        description: 'Ange textinnehall for briefingen',
        variant: 'destructive',
      })
      return
    }

    if (briefingType === 'pdf' && !selectedFile && !isEditing) {
      toast({
        title: 'Fil saknas',
        description: 'Valj en PDF-fil att ladda upp',
        variant: 'destructive',
      })
      return
    }

    setIsSubmitting(true)
    setUploadProgress(0)

    try {
      if (isEditing) {
        // Update existing briefing
        const updateData: Record<string, unknown> = {
          title: title.trim(),
          notes: notes.trim() || null,
        }

        if (briefingType === 'link') {
          updateData.content = linkUrl.trim()
        } else if (briefingType === 'text') {
          updateData.text_content = textContent.trim()
        }

        const response = await fetch(`/api/briefings/${briefing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateData),
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Update failed')
        }

        toast({
          title: 'Briefing uppdaterad',
          description: title,
        })
      } else if (briefingType === 'pdf' && selectedFile) {
        // Upload PDF file
        const formData = new FormData()
        formData.append('file', selectedFile)
        formData.append('title', title.trim())
        if (notes.trim()) formData.append('notes', notes.trim())

        // Simulate progress
        const progressInterval = setInterval(() => {
          setUploadProgress(prev => Math.min(prev + 10, 90))
        }, 200)

        const response = await fetch(`/api/campaigns/${campaignId}/briefings/upload`, {
          method: 'POST',
          body: formData,
        })

        clearInterval(progressInterval)
        setUploadProgress(100)

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Upload failed')
        }

        toast({
          title: 'Briefing uppladdad',
          description: title,
        })
      } else {
        // Create link or text briefing
        const createData = {
          briefing_type: briefingType,
          title: title.trim(),
          content: briefingType === 'link' ? linkUrl.trim() : null,
          text_content: briefingType === 'text' ? textContent.trim() : null,
          notes: notes.trim() || null,
        }

        const response = await fetch(`/api/campaigns/${campaignId}/briefings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(createData),
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Create failed')
        }

        toast({
          title: 'Briefing tillagd',
          description: title,
        })
      }

      onSuccess()
    } catch (error) {
      toast({
        title: 'Fel',
        description: error instanceof Error ? error.message : 'Något gick fel',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
      setUploadProgress(0)
    }
  }

  const getTypeIcon = (type: BriefingType) => {
    switch (type) {
      case 'pdf':
        return <FileText className="h-4 w-4" />
      case 'link':
        return <Link2 className="h-4 w-4" />
      case 'text':
        return <AlignLeft className="h-4 w-4" />
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Type selector - only show when creating new */}
      {!isEditing && (
        <div>
          <Label>Typ av briefing</Label>
          <div className="grid grid-cols-3 gap-2 mt-1.5">
            {(['link', 'text', 'pdf'] as BriefingType[]).map(type => (
              <button
                key={type}
                type="button"
                onClick={() => setBriefingType(type)}
                className={cn(
                  'flex items-center justify-center gap-2 p-3 border rounded-lg transition-colors',
                  briefingType === type
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-muted hover:border-primary/50 hover:bg-muted/50'
                )}
              >
                {getTypeIcon(type)}
                <span className="text-sm font-medium">{BRIEFING_TYPE_LABELS[type]}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Title */}
      <div>
        <Label htmlFor="title">Titel *</Label>
        <Input
          id="title"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="T.ex. Kampanjbrief Q1 2025"
          disabled={isSubmitting}
        />
      </div>

      {/* Type-specific content */}
      {briefingType === 'link' && (
        <div>
          <Label htmlFor="link">URL *</Label>
          <Input
            id="link"
            type="url"
            value={linkUrl}
            onChange={e => setLinkUrl(e.target.value)}
            placeholder="https://docs.google.com/... eller https://www.canva.com/..."
            disabled={isSubmitting}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Lankar till Google Docs, Canva, Dropbox, etc.
          </p>
        </div>
      )}

      {briefingType === 'text' && (
        <div className="space-y-3">
          <div>
            <Label htmlFor="text">Textinnehall *</Label>
            <Textarea
              id="text"
              value={textContent}
              onChange={e => setTextContent(e.target.value)}
              placeholder="Klistra in text fran e-post eller annat..."
              rows={8}
              disabled={isSubmitting}
            />
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSummarize}
            disabled={isSummarizing || !textContent.trim()}
          >
            {isSummarizing ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Sammanfattar...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-1" />
                Sammanfatta med AI
              </>
            )}
          </Button>

          {aiSummary && (
            <div className="p-4 border rounded-lg bg-muted/30">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium">AI-sammanfattning</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setAiSummary('')}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
              <div className="text-sm whitespace-pre-wrap text-muted-foreground">
                {aiSummary}
              </div>
            </div>
          )}
        </div>
      )}

      {briefingType === 'pdf' && !isEditing && (
        <div>
          <Label>PDF-fil *</Label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handleFileSelect}
            className="hidden"
          />

          {selectedFile ? (
            <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/50 mt-1.5">
              <FileText className="h-8 w-8 text-red-500" />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{selectedFile.name}</p>
                <p className="text-sm text-muted-foreground">
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={clearFileSelection}
                disabled={isSubmitting}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full p-6 border-2 border-dashed rounded-lg hover:border-primary hover:bg-muted/50 transition-colors mt-1.5"
            >
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-8 w-8 text-muted-foreground" />
                <p className="font-medium">Klicka for att valja PDF-fil</p>
                <p className="text-sm text-muted-foreground">Max 10MB</p>
              </div>
            </button>
          )}
        </div>
      )}

      {/* Notes */}
      <div>
        <Label htmlFor="notes">Anteckningar (valfritt)</Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Egna anteckningar om briefingen..."
          rows={2}
          disabled={isSubmitting}
        />
      </div>

      {/* Upload progress */}
      {isSubmitting && briefingType === 'pdf' && uploadProgress > 0 && (
        <div className="space-y-2">
          <Progress value={uploadProgress} />
          <p className="text-sm text-muted-foreground text-center">
            Laddar upp... {uploadProgress}%
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Avbryt
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {isEditing ? 'Sparar...' : 'Laddar upp...'}
            </>
          ) : isEditing ? (
            'Spara andringar'
          ) : (
            'Lagg till briefing'
          )}
        </Button>
      </div>
    </form>
  )
}
