'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ArrowLeft, ArrowRight, Columns3 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { getCSVPreview } from '@/lib/import/bank-file/formats/generic-csv'
import type { GenericCSVColumnMapping } from '@/lib/import/bank-file/types'

interface BankFileColumnMappingStepProps {
  rawFileContent: string
  onConfirm: (mapping: GenericCSVColumnMapping) => void
  onBack: () => void
}

export default function BankFileColumnMappingStep({
  rawFileContent,
  onConfirm,
  onBack,
}: BankFileColumnMappingStepProps) {
  const [dateCol, setDateCol] = useState<number>(-1)
  const [descCol, setDescCol] = useState<number>(-1)
  const [amountCol, setAmountCol] = useState<number>(-1)
  const [referenceCol, setReferenceCol] = useState<number>(-1)
  const [counterpartyCol, setCounterpartyCol] = useState<number>(-1)
  const [balanceCol, setBalanceCol] = useState<number>(-1)
  // Auto-detect the most likely delimiter by counting field splits on the first line.
  // Runs once per file. Users can still override via the dropdown.
  const detectedDelimiter = useMemo(() => {
    const firstLine = rawFileContent.split(/\r?\n/).find((l) => l.trim() !== '') ?? ''
    const candidates: Array<{ d: string; count: number }> = [
      { d: ',', count: getCSVPreview(firstLine, ',', 1)[0]?.length ?? 0 },
      { d: ';', count: getCSVPreview(firstLine, ';', 1)[0]?.length ?? 0 },
      { d: '\t', count: getCSVPreview(firstLine, '\t', 1)[0]?.length ?? 0 },
    ]
    const best = candidates.reduce((a, b) => (b.count > a.count ? b : a))
    return best.count > 1 ? best.d : ','
  }, [rawFileContent])

  const [delimiter, setDelimiter] = useState<string>(detectedDelimiter)
  const [decimalSep, setDecimalSep] = useState<',' | '.'>(',')
  const [dateFormat, setDateFormat] = useState<string>('YYYY-MM-DD')

  // Re-parse headers and preview whenever delimiter or file content changes
  const parsedRows = useMemo(
    () => getCSVPreview(rawFileContent, delimiter, 10),
    [rawFileContent, delimiter]
  )

  // Auto-detect whether the first row is a header: if any cell on row 0 looks
  // like a date (YYYY-MM-DD, DD.MM.YYYY, DD/MM/YYYY, YYYYMMDD), it's data, not a header.
  // Users can still override via the switch.
  const DATE_PATTERNS = [/^\d{4}-\d{2}-\d{2}$/, /^\d{2}[./]\d{2}[./]\d{4}$/, /^\d{8}$/]
  const detectedHasHeader = useMemo(() => {
    const firstRow = parsedRows[0]
    if (!firstRow) return true
    const hasDateCell = firstRow.some((cell) =>
      DATE_PATTERNS.some((re) => re.test(cell.trim()))
    )
    return !hasDateCell
  }, [parsedRows])

  const [hasHeaderOverride, setHasHeaderOverride] = useState<boolean | null>(null)
  const hasHeader = hasHeaderOverride ?? detectedHasHeader

  const columnHeaders = useMemo(() => {
    if (hasHeader && parsedRows[0]) return parsedRows[0]
    const count = parsedRows[0]?.length ?? 0
    return Array.from({ length: count }, (_, i) => `Kolumn ${i + 1}`)
  }, [parsedRows, hasHeader])

  const dataRows = hasHeader ? parsedRows.slice(1) : parsedRows

  // Auto-guess date/description/amount columns from the first data row.
  // Only used as initial defaults — user can override any pick.
  const AMOUNT_RE = /^-?\d+([.,]\d+)?$/
  useEffect(() => {
    if (dateCol !== -1 || descCol !== -1 || amountCol !== -1) return
    const sample = dataRows[0]
    if (!sample || sample.length === 0) return

    const dateIdx = sample.findIndex((cell) =>
      DATE_PATTERNS.some((re) => re.test(cell.trim()))
    )
    const amountIdx = sample
      .map((cell, i) => ({ i, cell: cell.trim().replace(/\s/g, '') }))
      .reverse()
      .find(({ cell, i }) => AMOUNT_RE.test(cell) && i !== dateIdx)?.i ?? -1
    const descIdx = sample.findIndex((_, i) => i !== dateIdx && i !== amountIdx)

    if (dateIdx >= 0) setDateCol(dateIdx)
    if (descIdx >= 0) setDescCol(descIdx)
    if (amountIdx >= 0) setAmountCol(amountIdx)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataRows])

  const isValid = dateCol >= 0 && descCol >= 0 && amountCol >= 0

  const handleConfirm = () => {
    const mapping: GenericCSVColumnMapping = {
      date: dateCol,
      description: descCol,
      amount: amountCol,
      ...(referenceCol >= 0 && { reference: referenceCol }),
      ...(counterpartyCol >= 0 && { counterparty: counterpartyCol }),
      ...(balanceCol >= 0 && { balance: balanceCol }),
      delimiter,
      decimal_separator: decimalSep,
      skip_rows: hasHeader ? 1 : 0,
      date_format: dateFormat,
    }
    onConfirm(mapping)
  }

  const columnOptions = columnHeaders.map((h, i) => ({ label: `${i + 1}: ${h}`, value: i }))

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Columns3 className="h-5 w-5" />
            Kolumnmappning
          </CardTitle>
          <CardDescription>
            Vi kunde inte identifiera bankformatet automatiskt. Mappa kolumnerna manuellt.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Header row toggle */}
          <div className="flex items-center justify-between rounded-md border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="has-header">Har filen rubrikrad?</Label>
              <p className="text-xs text-muted-foreground">
                Slå av om filen saknar rubrikrad och första raden redan innehåller transaktionsdata.
              </p>
            </div>
            <Switch id="has-header" checked={hasHeader} onCheckedChange={setHasHeaderOverride} />
          </div>

          {/* Delimiter, decimal, and date format settings */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Avgränsare</Label>
              <Select value={delimiter} onValueChange={(v) => { if (v) setDelimiter(v) }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value=",">Komma (,)</SelectItem>
                  <SelectItem value=";">Semikolon (;)</SelectItem>
                  <SelectItem value="\t">Tab</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Decimalavgränsare</Label>
              <Select value={decimalSep} onValueChange={(v) => { if (v) setDecimalSep(v as ',' | '.') }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value=",">Komma (1 234,56)</SelectItem>
                  <SelectItem value=".">Punkt (1234.56)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Datumformat</Label>
              <Select value={dateFormat} onValueChange={(v) => { if (v) setDateFormat(v) }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                  <SelectItem value="DD.MM.YYYY">DD.MM.YYYY</SelectItem>
                  <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                  <SelectItem value="YYYYMMDD">YYYYMMDD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Required column mappings */}
          <div>
            <h3 className="text-sm font-medium mb-3">Obligatoriska kolumner</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Datum *</Label>
                <Select
                  value={dateCol >= 0 ? dateCol.toString() : ''}
                  onValueChange={(v) => setDateCol(parseInt(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Välj kolumn" />
                  </SelectTrigger>
                  <SelectContent>
                    {columnOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value.toString()}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Beskrivning *</Label>
                <Select
                  value={descCol >= 0 ? descCol.toString() : ''}
                  onValueChange={(v) => setDescCol(parseInt(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Välj kolumn" />
                  </SelectTrigger>
                  <SelectContent>
                    {columnOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value.toString()}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Belopp *</Label>
                <Select
                  value={amountCol >= 0 ? amountCol.toString() : ''}
                  onValueChange={(v) => setAmountCol(parseInt(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Välj kolumn" />
                  </SelectTrigger>
                  <SelectContent>
                    {columnOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value.toString()}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Optional column mappings */}
          <div>
            <h3 className="text-sm font-medium mb-3">Valfria kolumner</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Referens/OCR</Label>
                <Select
                  value={referenceCol >= 0 ? referenceCol.toString() : 'none'}
                  onValueChange={(v) => setReferenceCol(v === 'none' ? -1 : parseInt(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Ingen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Ingen</SelectItem>
                    {columnOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value.toString()}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Motpart</Label>
                <Select
                  value={counterpartyCol >= 0 ? counterpartyCol.toString() : 'none'}
                  onValueChange={(v) => setCounterpartyCol(v === 'none' ? -1 : parseInt(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Ingen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Ingen</SelectItem>
                    {columnOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value.toString()}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Saldo</Label>
                <Select
                  value={balanceCol >= 0 ? balanceCol.toString() : 'none'}
                  onValueChange={(v) => setBalanceCol(v === 'none' ? -1 : parseInt(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Ingen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Ingen</SelectItem>
                    {columnOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value.toString()}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Live preview */}
      {isValid && dataRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Förhandsgranskning</CardTitle>
            <CardDescription>
              Så tolkas dina data med den valda mappningen
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border max-h-64 overflow-x-auto overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Datum</TableHead>
                    <TableHead>Beskrivning</TableHead>
                    <TableHead className="text-right">Belopp</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dataRows.slice(0, 5).map((row, i) => {
                    const amountStr = row[amountCol] || '0'
                    const amount = decimalSep === ','
                      ? parseFloat(amountStr.replace(/\s/g, '').replace(',', '.'))
                      : parseFloat(amountStr.replace(/\s/g, ''))

                    return (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-sm">{row[dateCol] || '–'}</TableCell>
                        <TableCell className="text-sm">{row[descCol] || '–'}</TableCell>
                        <TableCell
                          className={`text-right font-mono text-sm ${
                            !isNaN(amount) && amount >= 0 ? 'text-success' : 'text-destructive'
                          }`}
                        >
                          {!isNaN(amount) ? formatCurrency(amount) : amountStr}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <Button variant="outline" className="min-h-11" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Tillbaka
        </Button>
        <Button className="min-h-11" onClick={handleConfirm} disabled={!isValid}>
          Fortsätt
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
