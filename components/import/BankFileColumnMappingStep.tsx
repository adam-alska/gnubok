'use client'

import { useState } from 'react'
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
import type { GenericCSVColumnMapping } from '@/lib/import/bank-file/types'

interface BankFileColumnMappingStepProps {
  headers: string[]
  previewRows: string[][]
  onConfirm: (mapping: GenericCSVColumnMapping) => void
  onBack: () => void
}

export default function BankFileColumnMappingStep({
  headers,
  previewRows,
  onConfirm,
  onBack,
}: BankFileColumnMappingStepProps) {
  const [dateCol, setDateCol] = useState<number>(-1)
  const [descCol, setDescCol] = useState<number>(-1)
  const [amountCol, setAmountCol] = useState<number>(-1)
  const [referenceCol, setReferenceCol] = useState<number>(-1)
  const [counterpartyCol, setCounterpartyCol] = useState<number>(-1)
  const [balanceCol, setBalanceCol] = useState<number>(-1)
  const [delimiter, setDelimiter] = useState<string>(',')
  const [decimalSep, setDecimalSep] = useState<',' | '.'>(',')

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
      skip_rows: 1, // Skip header
      date_format: 'YYYY-MM-DD',
    }
    onConfirm(mapping)
  }

  const columnOptions = headers.map((h, i) => ({ label: `${i + 1}: ${h}`, value: i }))

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
          {/* Delimiter and decimal settings */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Avgränsare</Label>
              <Select value={delimiter} onValueChange={setDelimiter}>
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
              <Select value={decimalSep} onValueChange={(v) => setDecimalSep(v as ',' | '.')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value=",">Komma (1 234,56)</SelectItem>
                  <SelectItem value=".">Punkt (1234.56)</SelectItem>
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
      {isValid && previewRows.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Förhandsgranskning</CardTitle>
            <CardDescription>
              Så tolkas dina data med den valda mappningen
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border max-h-64 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Datum</TableHead>
                    <TableHead>Beskrivning</TableHead>
                    <TableHead className="text-right">Belopp</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.slice(1, 6).map((row, i) => {
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
      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Tillbaka
        </Button>
        <Button onClick={handleConfirm} disabled={!isValid}>
          Fortsätt
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
