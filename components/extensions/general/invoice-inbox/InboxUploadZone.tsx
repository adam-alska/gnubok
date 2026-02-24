'use client'

import { useCallback, useRef, useState } from 'react'
import type { InvoiceInboxItem } from '@/types'
import { Upload, Loader2, FileUp } from 'lucide-react'
import { cn } from '@/lib/utils'

interface InboxUploadZoneProps {
  onUploadComplete: (item: InvoiceInboxItem) => void
  isUploading: boolean
  setIsUploading: (v: boolean) => void
}

const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
const MAX_SIZE = 10 * 1024 * 1024 // 10 MB

export default function InboxUploadZone({
  onUploadComplete,
  isUploading,
  setIsUploading,
}: InboxUploadZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const uploadFile = useCallback(
    async (file: File) => {
      setError(null)

      if (!ACCEPTED_TYPES.includes(file.type)) {
        setError('Filtypen stöds inte. Välj PDF, JPEG, PNG eller WebP.')
        return
      }

      if (file.size > MAX_SIZE) {
        setError('Filen är för stor. Max 10 MB.')
        return
      }

      setIsUploading(true)

      try {
        const formData = new FormData()
        formData.append('file', file)

        const res = await fetch('/api/extensions/invoice-inbox/inbox', {
          method: 'POST',
          body: formData,
        })

        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: 'Uppladdning misslyckades' }))
          setError(body.error ?? 'Uppladdning misslyckades')
          return
        }

        const { data } = await res.json()
        onUploadComplete(data)
      } catch {
        setError('Nätverksfel vid uppladdning')
      } finally {
        setIsUploading(false)
      }
    },
    [onUploadComplete, setIsUploading]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) uploadFile(file)
    },
    [uploadFile]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) uploadFile(file)
      // Reset so same file can be re-selected
      e.target.value = ''
    },
    [uploadFile]
  )

  return (
    <div>
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !isUploading && inputRef.current?.click()}
        className={cn(
          'relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors cursor-pointer',
          isDragOver
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50 hover:bg-accent/30',
          isUploading && 'pointer-events-none opacity-60'
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          className="hidden"
          onChange={handleFileSelect}
          disabled={isUploading}
        />

        {isUploading ? (
          <>
            <Loader2 className="h-8 w-8 text-primary animate-spin mb-2" />
            <p className="text-sm text-muted-foreground">Laddar upp och analyserar...</p>
          </>
        ) : isDragOver ? (
          <>
            <FileUp className="h-8 w-8 text-primary mb-2" />
            <p className="text-sm font-medium text-primary">Släpp filen här</p>
          </>
        ) : (
          <>
            <Upload className="h-8 w-8 text-muted-foreground/60 mb-2" />
            <p className="text-sm text-muted-foreground">
              Dra och släpp en faktura, eller{' '}
              <span className="font-medium text-primary">välj fil</span>
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              PDF, JPEG, PNG eller WebP (max 10 MB)
            </p>
          </>
        )}
      </div>

      {error && (
        <p className="text-sm text-destructive mt-2">{error}</p>
      )}
    </div>
  )
}
