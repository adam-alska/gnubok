'use client'

import { useCallback, useRef, useState } from 'react'
import type { InvoiceInboxItem } from '@/types'
import { Upload, Loader2, FileUp, CheckCircle2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface InboxUploadZoneProps {
  onUploadComplete: (item: InvoiceInboxItem | InvoiceInboxItem[]) => void
  isUploading: boolean
  setIsUploading: (v: boolean) => void
}

interface FileProgress {
  name: string
  status: 'pending' | 'uploading' | 'done' | 'error'
  error?: string
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
  const [fileProgress, setFileProgress] = useState<FileProgress[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const uploadFiles = useCallback(
    async (files: File[]) => {
      setError(null)

      // Validate all files first
      const validFiles: File[] = []
      for (const file of files) {
        if (!ACCEPTED_TYPES.includes(file.type)) {
          setError(`${file.name}: filtypen stöds inte. Välj PDF, JPEG, PNG eller WebP.`)
          return
        }
        if (file.size > MAX_SIZE) {
          setError(`${file.name}: filen är för stor. Max 10 MB.`)
          return
        }
        validFiles.push(file)
      }

      if (validFiles.length === 0) return

      setIsUploading(true)

      // Show per-file progress for multi-file uploads
      if (validFiles.length > 1) {
        setFileProgress(validFiles.map((f) => ({ name: f.name, status: 'uploading' })))
      }

      try {
        const formData = new FormData()

        if (validFiles.length === 1) {
          // Single file: use legacy `file` key for backward compat
          formData.append('file', validFiles[0])
        } else {
          // Multiple files: use `files` key
          for (const file of validFiles) {
            formData.append('files', file)
          }
        }

        const res = await fetch('/api/extensions/ext/invoice-inbox/inbox', {
          method: 'POST',
          body: formData,
        })

        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: 'Uppladdning misslyckades' }))
          setError(body.error ?? 'Uppladdning misslyckades')
          if (validFiles.length > 1) {
            setFileProgress((prev) => prev.map((f) => ({ ...f, status: 'error' as const })))
          }
          return
        }

        const body = await res.json()

        if (validFiles.length === 1) {
          onUploadComplete(body.data)
          setFileProgress([])
        } else {
          // Mark individual files
          const items: InvoiceInboxItem[] = body.data || []
          const errors: string[] = body.errors || []

          setFileProgress((prev) =>
            prev.map((fp, i) => {
              // Check if this file had an error
              const errMsg = errors.find((e) => e.startsWith(fp.name))
              if (errMsg) {
                return { ...fp, status: 'error' as const, error: errMsg }
              }
              return { ...fp, status: 'done' as const }
            })
          )

          if (items.length > 0) {
            onUploadComplete(items)
          }

          // Clear progress after a delay
          setTimeout(() => setFileProgress([]), 3000)
        }
      } catch {
        setError('Nätverksfel vid uppladdning')
        setFileProgress([])
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
      const files = Array.from(e.dataTransfer.files)
      if (files.length > 0) uploadFiles(files)
    },
    [uploadFiles]
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
      const files = Array.from(e.target.files || [])
      if (files.length > 0) uploadFiles(files)
      e.target.value = ''
    },
    [uploadFiles]
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
          multiple
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
            <p className="text-sm font-medium text-primary">Släpp filerna här</p>
          </>
        ) : (
          <>
            <Upload className="h-8 w-8 text-muted-foreground/60 mb-2" />
            <p className="text-sm text-muted-foreground">
              Dra och släpp fakturor, eller{' '}
              <span className="font-medium text-primary">välj filer</span>
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              PDF, JPEG, PNG eller WebP (max 10 MB per fil)
            </p>
          </>
        )}
      </div>

      {fileProgress.length > 0 && (
        <div className="mt-3 space-y-1">
          {fileProgress.map((fp) => (
            <div key={fp.name} className="flex items-center gap-2 text-sm">
              {fp.status === 'uploading' && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              {fp.status === 'done' && <CheckCircle2 className="h-3.5 w-3.5 text-success" />}
              {fp.status === 'error' && <AlertCircle className="h-3.5 w-3.5 text-destructive" />}
              <span className={cn(
                'truncate',
                fp.status === 'error' && 'text-destructive'
              )}>
                {fp.name}
              </span>
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive mt-2">{error}</p>
      )}
    </div>
  )
}
