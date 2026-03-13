'use client'

import { useState, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Upload, FileText, AlertCircle, CheckCircle } from 'lucide-react'

interface SIEUploadStepProps {
  onFileSelect: (file: File) => void
  isLoading: boolean
  error: string | null
}

export default function SIEUploadStep({ onFileSelect, isLoading, error }: SIEUploadStepProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const files = e.dataTransfer.files
    if (files.length > 0) {
      const file = files[0]
      if (file.name.toLowerCase().endsWith('.sie') || file.name.toLowerCase().endsWith('.se')) {
        setSelectedFile(file)
        onFileSelect(file)
      }
    }
  }, [onFileSelect])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      setSelectedFile(files[0])
      onFileSelect(files[0])
    }
  }, [onFileSelect])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Ladda upp SIE-fil
          </CardTitle>
          <CardDescription>
            Exportera en SIE4-fil från ditt nuvarande bokföringssystem (Fortnox, Visma, etc.)
            och ladda upp den här för att importera din bokföring.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Drop zone */}
          <div
            className={`
              relative border-2 border-dashed rounded-lg p-8 text-center transition-colors
              ${isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'}
              ${error ? 'border-destructive bg-destructive/5' : ''}
              ${isLoading ? 'pointer-events-none opacity-50' : 'cursor-pointer hover:border-primary/50'}
            `}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => document.getElementById('file-input')?.click()}
          >
            <input
              id="file-input"
              type="file"
              accept=".sie,.se"
              className="hidden"
              onChange={handleFileInput}
              disabled={isLoading}
            />

            {isLoading ? (
              <div className="space-y-4">
                <FileText className="mx-auto h-12 w-12 text-muted-foreground animate-pulse" />
                <p className="text-muted-foreground">Analyserar fil...</p>
                <Progress value={33} className="w-48 mx-auto" />
              </div>
            ) : selectedFile ? (
              <div className="space-y-4">
                <CheckCircle className="mx-auto h-12 w-12 text-success" />
                <div>
                  <p className="font-medium">{selectedFile.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {(selectedFile.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <Upload className="mx-auto h-12 w-12 text-muted-foreground" />
                <div>
                  <p className="font-medium hidden sm:block">Dra och släpp SIE-fil här</p>
                  <p className="font-medium sm:hidden">Tryck för att välja SIE-fil</p>
                  <p className="text-sm text-muted-foreground hidden sm:block">eller klicka för att välja fil</p>
                  <p className="text-sm text-muted-foreground sm:hidden">.sie eller .se-filer</p>
                </div>
              </div>
            )}
          </div>

          {/* Error display */}
          {error && (
            <div className="mt-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex gap-3">
              <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-destructive">Kunde inte läsa filen</p>
                <p className="text-sm text-muted-foreground">{error}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vad är SIE?</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>
              SIE (Standard Import Export) är det svenska standardformatet för att överföra
              bokföringsdata mellan system. Det används av alla större bokföringsprogram i Sverige.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vilken SIE-typ?</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <ul className="space-y-1">
              <li><strong>SIE4</strong> - Full historik med alla verifikationer (rekommenderas)</li>
              <li><strong>SIE1</strong> - Endast årssaldon (enklare import)</li>
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Export instructions */}
      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="text-base">Så exporterar du från...</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-3">
          <div>
            <p className="font-medium">Fortnox</p>
            <p className="text-muted-foreground">Inställningar → Import/Export → Exportera SIE</p>
          </div>
          <div>
            <p className="font-medium">Visma eEkonomi</p>
            <p className="text-muted-foreground">Rapporter → Övrigt → Exportera till SIE</p>
          </div>
          <div>
            <p className="font-medium">Bokio</p>
            <p className="text-muted-foreground">Inställningar → Bokföring → Exportera SIE-fil</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
