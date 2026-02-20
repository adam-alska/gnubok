'use client'

import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  CheckCircle,
  XCircle,
  FileText,
  Link2,
  Sparkles,
  Copy,
  ArrowRight,
  RotateCcw,
  ExternalLink,
} from 'lucide-react'
import type { IngestResult } from '@/lib/transactions/ingest'

interface BankFileResultStepProps {
  result: IngestResult
  onNewImport: () => void
}

export default function BankFileResultStep({
  result,
  onNewImport,
}: BankFileResultStepProps) {
  const isSuccess = result.imported > 0 || result.duplicates > 0

  return (
    <div className="space-y-6">
      {/* Status header */}
      <Card className={isSuccess ? 'border-green-300' : 'border-destructive/50'}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {isSuccess ? (
              <>
                <CheckCircle className="h-6 w-6 text-green-600" />
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
            {isSuccess
              ? `${result.imported} transaktioner importerades framgångsrikt.`
              : `${result.errors} fel uppstod under importen.`}
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <FileText className="h-4 w-4" />
              <span className="text-sm">Importerade</span>
            </div>
            <p className="text-2xl font-bold text-green-600">{result.imported}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Copy className="h-4 w-4" />
              <span className="text-sm">Dubletter</span>
            </div>
            <p className="text-2xl font-bold text-muted-foreground">{result.duplicates}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Sparkles className="h-4 w-4" />
              <span className="text-sm">Auto-kategoriserade</span>
            </div>
            <p className="text-2xl font-bold">{result.auto_categorized}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Link2 className="h-4 w-4" />
              <span className="text-sm">Fakturamatchade</span>
            </div>
            <p className="text-2xl font-bold">{result.auto_matched_invoices}</p>
          </CardContent>
        </Card>
      </div>

      {/* Next steps */}
      {isSuccess && (
        <Card className="bg-muted/50">
          <CardHeader>
            <CardTitle className="text-base">Nästa steg</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium flex-shrink-0">
                1
              </div>
              <div>
                <p className="font-medium">Granska okategoriserade transaktioner</p>
                <p className="text-sm text-muted-foreground">
                  {result.imported - result.auto_categorized > 0
                    ? `${result.imported - result.auto_categorized} transaktioner behöver kategoriseras manuellt.`
                    : 'Alla transaktioner kategoriserades automatiskt.'}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium flex-shrink-0">
                2
              </div>
              <div>
                <p className="font-medium">Bekräfta fakturamatchningar</p>
                <p className="text-sm text-muted-foreground">
                  {result.auto_matched_invoices > 0
                    ? `${result.auto_matched_invoices} transaktioner matchades mot fakturor. Bekräfta dessa på transaktionssidan.`
                    : 'Inga automatiska fakturamatchningar hittades.'}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium flex-shrink-0">
                3
              </div>
              <div>
                <p className="font-medium">Importera fler kontoutdrag</p>
                <p className="text-sm text-muted-foreground">
                  Importera löpande kontoutdrag för att hålla bokföringen uppdaterad.
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
          {isSuccess && (
            <Button asChild>
              <Link href="/transactions">
                Visa transaktioner
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
