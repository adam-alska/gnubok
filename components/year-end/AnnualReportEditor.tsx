'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Loader2,
  FileText,
  Download,
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import type { AnnualReport, AnnualReportNote, AnnualReportStatus } from '@/types/year-end'
import { ANNUAL_REPORT_STATUS_LABELS } from '@/types/year-end'

interface AnnualReportEditorProps {
  closingId: string
}

function formatAmount(amount: number): string {
  return amount.toLocaleString('sv-SE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function AnnualReportEditor({ closingId }: AnnualReportEditorProps) {
  const [report, setReport] = useState<AnnualReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Local edit state
  const [managementReport, setManagementReport] = useState('')
  const [notes, setNotes] = useState<AnnualReportNote[]>([])

  const loadReport = useCallback(async (reportId: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/annual-report/${reportId}`)
      const result = await res.json()
      if (result.data) {
        setReport(result.data)
        setManagementReport(result.data.management_report || '')
        setNotes(result.data.notes_data || [])
      }
    } catch {
      setError('Kunde inte ladda arsredovisning')
    } finally {
      setLoading(false)
    }
  }, [])

  // Try to find an existing report
  useEffect(() => {
    async function findReport() {
      setLoading(true)
      try {
        const res = await fetch('/api/annual-report')
        const result = await res.json()
        if (result.data) {
          const existing = (result.data as AnnualReport[]).find(
            (r) => r.year_end_closing_id === closingId
          )
          if (existing) {
            await loadReport(existing.id)
            return
          }
        }
      } catch {
        // No existing report found
      } finally {
        setLoading(false)
      }
    }
    findReport()
  }, [closingId, loadReport])

  async function generateReport() {
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/annual-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year_end_closing_id: closingId }),
      })
      const result = await res.json()
      if (result.error) {
        setError(result.error)
      } else if (result.data) {
        setReport(result.data)
        setManagementReport(result.data.management_report || '')
        setNotes(result.data.notes_data || [])
      }
    } catch {
      setError('Kunde inte generera arsredovisning')
    } finally {
      setGenerating(false)
    }
  }

  async function saveReport() {
    if (!report) return
    setSaving(true)
    setSaveSuccess(false)
    try {
      const res = await fetch(`/api/annual-report/${report.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          management_report: managementReport,
          notes_data: notes,
        }),
      })
      const result = await res.json()
      if (result.data) {
        setReport(result.data)
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 3000)
      }
    } catch {
      setError('Kunde inte spara')
    } finally {
      setSaving(false)
    }
  }

  function addNote() {
    const nextNumber = notes.length > 0 ? Math.max(...notes.map((n) => n.noteNumber)) + 1 : 1
    setNotes([
      ...notes,
      {
        noteNumber: nextNumber,
        title: '',
        content: '',
        type: 'other',
      },
    ])
  }

  function updateNote(index: number, field: keyof AnnualReportNote, value: string) {
    const updated = [...notes]
    ;(updated[index] as unknown as Record<string, unknown>)[field] = value
    setNotes(updated)
  }

  function removeNote(index: number) {
    setNotes(notes.filter((_, i) => i !== index))
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground mt-2">Laddar...</p>
        </CardContent>
      </Card>
    )
  }

  if (!report) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">Generera arsredovisning</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
            Skapa arsredovisningen baserat pa det genomforda bokslutet.
            Resultatrakning, balansrakning och noter genereras automatiskt.
          </p>
          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg mb-4 max-w-md mx-auto">
              {error}
            </div>
          )}
          <Button onClick={generateReport} disabled={generating} size="lg">
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Genererar...
              </>
            ) : (
              <>
                <FileText className="h-4 w-4 mr-2" />
                Generera arsredovisning
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    )
  }

  const reportData = report.report_data as Record<string, string>

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Årsredovisning</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {reportData?.companyName} - {reportData?.fiscalYear}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={report.status} />
              <Button variant="outline" size="sm" onClick={generateReport} disabled={generating}>
                {generating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Regenerera'
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Management report (for AB) */}
      {report.entity_type === 'aktiebolag' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Forvaltningsberattelse</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={managementReport}
              onChange={(e) => setManagementReport(e.target.value)}
              className="min-h-[300px] font-mono text-sm"
              placeholder="Skriv forvaltningsberattelsen har..."
            />
            <p className="text-xs text-muted-foreground mt-2">
              Redigera texten ovan. Ersatt platshallare inom hakparenteser med faktiska uppgifter.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Income Statement Summary */}
      {report.income_statement && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Resultatrakning</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Rorelsens intakter</span>
                <span>{formatAmount(report.income_statement.total_revenue)} kr</span>
              </div>
              <div className="flex justify-between">
                <span>Rorelsens kostnader</span>
                <span>-{formatAmount(report.income_statement.total_expenses)} kr</span>
              </div>
              {report.income_statement.total_financial !== 0 && (
                <div className="flex justify-between">
                  <span>Finansiella poster</span>
                  <span>{formatAmount(report.income_statement.total_financial)} kr</span>
                </div>
              )}
              <div className="flex justify-between font-bold pt-2 border-t">
                <span>Arets resultat</span>
                <span
                  className={
                    report.income_statement.net_result >= 0
                      ? 'text-green-600'
                      : 'text-red-600'
                  }
                >
                  {formatAmount(report.income_statement.net_result)} kr
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Balance Sheet Summary */}
      {report.balance_sheet && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Balansrakning</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-6 text-sm">
              <div>
                <h4 className="font-medium mb-2">Tillgangar</h4>
                <div className="flex justify-between font-semibold border-t pt-2">
                  <span>Summa tillgangar</span>
                  <span>{formatAmount(report.balance_sheet.total_assets)} kr</span>
                </div>
              </div>
              <div>
                <h4 className="font-medium mb-2">Eget kapital och skulder</h4>
                <div className="flex justify-between font-semibold border-t pt-2">
                  <span>Summa</span>
                  <span>
                    {formatAmount(report.balance_sheet.total_equity_liabilities)} kr
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notes */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Noter</CardTitle>
            <Button variant="outline" size="sm" onClick={addNote}>
              <Plus className="h-4 w-4 mr-1" />
              Lägg till not
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {notes.map((note, index) => (
            <div key={index} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">Not {note.noteNumber}</Badge>
                  <Input
                    value={note.title}
                    onChange={(e) => updateNote(index, 'title', e.target.value)}
                    placeholder="Rubrik"
                    className="h-8 w-64"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeNote(index)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <Textarea
                value={note.content}
                onChange={(e) => updateNote(index, 'content', e.target.value)}
                placeholder="Innehall..."
                className="min-h-[100px] text-sm"
              />
            </div>
          ))}
          {notes.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Inga noter tillagda. Klicka &quot;Lägg till not&quot; för att skapa en ny not.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Save and download */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {saveSuccess && (
                <div className="flex items-center gap-1 text-green-600 text-sm">
                  <CheckCircle2 className="h-4 w-4" />
                  Sparat
                </div>
              )}
              {error && (
                <div className="flex items-center gap-1 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4" />
                  {error}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={saveReport} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Spara
              </Button>
              <Button
                onClick={() => {
                  // Open PDF generation in new tab (client-side rendering)
                  window.open(`/year-end/${closingId}?tab=pdf&reportId=${report.id}`, '_blank')
                }}
              >
                <Download className="h-4 w-4 mr-2" />
                Generera PDF
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function StatusBadge({ status }: { status: AnnualReportStatus }) {
  const colorMap: Record<AnnualReportStatus, string> = {
    draft: 'bg-gray-100 text-gray-800',
    review: 'bg-blue-100 text-blue-800',
    approved: 'bg-green-100 text-green-800',
    filed: 'bg-purple-100 text-purple-800',
  }

  return (
    <Badge className={colorMap[status]}>
      {ANNUAL_REPORT_STATUS_LABELS[status]}
    </Badge>
  )
}
