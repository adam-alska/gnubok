'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Progress } from '@/components/ui/progress'
import { useToast } from '@/components/ui/use-toast'
import { Upload, FileText, X } from 'lucide-react'

interface ContractUploadProps {
  campaignId: string
  onSuccess?: () => void
}

export function ContractUpload({ campaignId, onSuccess }: ContractUploadProps) {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [signingDate, setSigningDate] = useState('')
  const [isPrimary, setIsPrimary] = useState(true)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // Validate file type
      const allowedTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/jpeg',
        'image/png',
        'image/webp'
      ]

      if (!allowedTypes.includes(file.type)) {
        toast({
          title: 'Ogiltig filtyp',
          description: 'Tillåtna format: PDF, DOC, DOCX, JPG, PNG, WEBP',
          variant: 'destructive',
        })
        return
      }

      // Check file size (10MB max)
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: 'Filen är för stor',
          description: 'Max filstorlek är 10MB',
          variant: 'destructive',
        })
        return
      }

      setSelectedFile(file)
    }
  }

  const handleUpload = async () => {
    if (!selectedFile) return

    setIsUploading(true)
    setUploadProgress(0)

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      if (signingDate) formData.append('signing_date', signingDate)
      formData.append('is_primary', isPrimary.toString())

      // Simulate progress for better UX
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90))
      }, 200)

      const response = await fetch(`/api/campaigns/${campaignId}/contracts`, {
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
        title: 'Avtal uppladdat',
        description: selectedFile.name,
      })

      // Reset form
      setSelectedFile(null)
      setSigningDate('')
      setIsPrimary(true)
      if (fileInputRef.current) fileInputRef.current.value = ''

      onSuccess?.()
    } catch (error) {
      toast({
        title: 'Uppladdning misslyckades',
        description: error instanceof Error ? error.message : 'Något gick fel',
        variant: 'destructive',
      })
    } finally {
      setIsUploading(false)
      setUploadProgress(0)
    }
  }

  const clearSelection = () => {
    setSelectedFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="space-y-4">
      {/* File input */}
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
          onChange={handleFileSelect}
          className="hidden"
        />

        {selectedFile ? (
          <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/50">
            <FileText className="h-8 w-8 text-primary" />
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{selectedFile.name}</p>
              <p className="text-sm text-muted-foreground">
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={clearSelection}
              disabled={isUploading}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full p-8 border-2 border-dashed rounded-lg hover:border-primary hover:bg-muted/50 transition-colors"
          >
            <div className="flex flex-col items-center gap-2">
              <Upload className="h-8 w-8 text-muted-foreground" />
              <p className="font-medium">Klicka för att välja fil</p>
              <p className="text-sm text-muted-foreground">
                PDF, DOC, DOCX, JPG, PNG (max 10MB)
              </p>
            </div>
          </button>
        )}
      </div>

      {/* Options */}
      {selectedFile && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="signing_date">Signeringsdatum</Label>
              <Input
                id="signing_date"
                type="date"
                value={signingDate}
                onChange={(e) => setSigningDate(e.target.value)}
              />
            </div>
            <div className="flex items-end gap-2 pb-2">
              <Switch
                id="is_primary"
                checked={isPrimary}
                onCheckedChange={setIsPrimary}
              />
              <Label htmlFor="is_primary" className="font-normal">
                Huvudavtal
              </Label>
            </div>
          </div>

          {/* Upload progress */}
          {isUploading && (
            <div className="space-y-2">
              <Progress value={uploadProgress} />
              <p className="text-sm text-muted-foreground text-center">
                Laddar upp... {uploadProgress}%
              </p>
            </div>
          )}

          {/* Upload button */}
          <Button
            onClick={handleUpload}
            disabled={isUploading}
            className="w-full"
          >
            {isUploading ? 'Laddar upp...' : 'Ladda upp avtal'}
          </Button>
        </>
      )}
    </div>
  )
}
