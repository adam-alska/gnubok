'use client'

import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  CheckCircle,
  XCircle,
  AlertCircle,
  FileText,
  ExternalLink,
  RotateCcw,
} from 'lucide-react'
import type { ImportResult } from '@/lib/import/types'

interface ImportResultStepProps {
  result: ImportResult
  onNewImport: () => void
}

export default function ImportResultStep({ result, onNewImport }: ImportResultStepProps) {
  const hasErrors = result.errors.length > 0
  const hasWarnings = result.warnings.length > 0

  return (
    <div className="space-y-6">
      {/* Success/Failure header */}
      <Card className={result.success ? 'border-success/50' : 'border-destructive/50'}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {result.success ? (
              <>
                <CheckCircle className="h-6 w-6 text-success" />
                Import genomförd
              </>
            ) : (
              <>
                <XCircle className="h-6 w-6 text-destructive" />
                Import misslyckades
              </>
            )}
          </CardTitle>
          <CardDescription>
            {result.success
              ? 'Din bokföring har importerats framgångsrikt.'
              : 'Det uppstod fel under importen. Se detaljer nedan.'}
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Statistics */}
      {result.success && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <FileText className="h-4 w-4" />
                <span className="text-sm">Verifikationer skapade</span>
              </div>
              <p className="text-2xl font-bold">{result.journalEntriesCreated}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <span className="text-sm">Räkenskapsår</span>
              </div>
              <div className="text-2xl font-bold">
                {result.fiscalPeriodId ? (
                  <Badge variant="default" className="bg-success">Skapat</Badge>
                ) : (
                  <Badge variant="secondary">Befintligt</Badge>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <span className="text-sm">Ingående balanser</span>
              </div>
              <div className="text-2xl font-bold">
                {result.openingBalanceEntryId ? (
                  <Badge variant="default" className="bg-success">Importerade</Badge>
                ) : (
                  <Badge variant="secondary">Inga</Badge>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Errors */}
      {hasErrors && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <XCircle className="h-5 w-5" />
              Fel ({result.errors.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {result.errors.map((error, i) => (
                <div key={i} className="text-sm flex gap-2">
                  <XCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Warnings */}
      {hasWarnings && (
        <Card className="border-warning/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-warning">
              <AlertCircle className="h-5 w-5" />
              Varningar ({result.warnings.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {result.warnings.map((warning, i) => (
                <div key={i} className="text-sm flex gap-2">
                  <AlertCircle className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Next steps */}
      {result.success && (
        <Card className="bg-muted/50">
          <CardHeader>
            <CardTitle className="text-base">Nästa steg</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                1
              </div>
              <div>
                <p className="font-medium">Granska importerade verifikationer</p>
                <p className="text-sm text-muted-foreground">
                  Kontrollera att allt ser korrekt ut i bokföringslistan
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                2
              </div>
              <div>
                <p className="font-medium">Verifiera balanserna</p>
                <p className="text-sm text-muted-foreground">
                  Jämför huvudboken med din tidigare bokföring
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                3
              </div>
              <div>
                <p className="font-medium">Fortsätt med ny bokföring</p>
                <p className="text-sm text-muted-foreground">
                  Nu kan du börja lägga till nya transaktioner
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={onNewImport}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Ny import
        </Button>
        <div className="flex gap-2">
          {result.success && (
            <>
              <Button variant="outline" asChild>
                <Link href="/bookkeeping">
                  Visa bokföring
                  <ExternalLink className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild>
                <Link href="/reports">
                  Visa rapporter
                  <ExternalLink className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
