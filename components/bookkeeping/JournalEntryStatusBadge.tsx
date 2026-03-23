import { Badge } from '@/components/ui/badge'
import type { JournalEntry } from '@/types'

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'success' | 'warning' | 'destructive' }> = {
  draft: { label: 'Utkast', variant: 'secondary' },
  posted: { label: 'Bokförd', variant: 'success' },
  reversed: { label: 'Omförd', variant: 'warning' },
  cancelled: { label: 'Makulerad', variant: 'secondary' },
}

const sourceTypeBadges: Record<string, { label: string; variant: 'default' | 'secondary' | 'success' | 'warning' | 'destructive' }> = {
  storno: { label: 'Storno', variant: 'destructive' },
  correction: { label: 'Rättelse', variant: 'default' },
}

export const sourceTypeLabels: Record<string, string> = {
  manual: 'Manuell',
  bank_transaction: 'Banktransaktion',
  invoice_created: 'Faktura skapad',
  invoice_paid: 'Fakturabetalning',
  credit_note: 'Kreditfaktura',
  salary_payment: 'Lön',
  opening_balance: 'Ingående balans',
  year_end: 'Årsbokslut',
  storno: 'Storno',
  correction: 'Rättelse',
  import: 'Import',
  system: 'System',
  supplier_invoice_registered: 'Leverantörsfaktura',
  supplier_invoice_paid: 'Leverantörsbetalning',
  supplier_invoice_cash_payment: 'Kontantbetalning',
  currency_revaluation: 'Valutaomvärdering',
}

interface Props {
  entry: JournalEntry
  showStatus?: boolean
}

export default function JournalEntryStatusBadge({ entry, showStatus = true }: Props) {
  const status = statusConfig[entry.status]
  const sourceType = sourceTypeBadges[entry.source_type]

  return (
    <span className="inline-flex items-center gap-1">
      {showStatus && status && (
        <Badge variant={status.variant} className="text-[10px] px-1.5 py-0">
          {status.label}
        </Badge>
      )}
      {sourceType && (
        <Badge variant={sourceType.variant} className="text-[10px] px-1.5 py-0">
          {sourceType.label}
        </Badge>
      )}
    </span>
  )
}
