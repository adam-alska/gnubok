'use client'

import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import type { SupplierInvoice, SupplierInvoiceStatus } from '@/types/suppliers'
import { SUPPLIER_INVOICE_STATUS_LABELS } from '@/types/suppliers'

interface SupplierInvoiceListProps {
  invoices: SupplierInvoice[]
  selectable?: boolean
  selectedIds?: Set<string>
  onSelectChange?: (id: string, selected: boolean) => void
  onSelectAll?: (selected: boolean) => void
  showSupplier?: boolean
}

function getStatusVariant(status: SupplierInvoiceStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'paid':
      return 'default'
    case 'disputed':
      return 'destructive'
    case 'draft':
    case 'credited':
      return 'secondary'
    case 'attested':
    case 'approved':
      return 'outline'
    default:
      return 'default'
  }
}

function isOverdue(invoice: SupplierInvoice): boolean {
  if (!invoice.due_date) return false
  if (['paid', 'credited', 'disputed'].includes(invoice.status)) return false
  return new Date(invoice.due_date) < new Date()
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '-'
  return new Intl.DateTimeFormat('sv-SE').format(new Date(dateStr))
}

export default function SupplierInvoiceList({
  invoices,
  selectable = false,
  selectedIds = new Set(),
  onSelectChange,
  onSelectAll,
  showSupplier = true,
}: SupplierInvoiceListProps) {
  const allSelected = invoices.length > 0 && invoices.every((inv) => selectedIds.has(inv.id))
  const someSelected = invoices.some((inv) => selectedIds.has(inv.id))

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {selectable && (
            <TableHead className="w-10">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(checked) => onSelectAll?.(!!checked)}
                aria-label="Välj alla"
              />
            </TableHead>
          )}
          <TableHead>Fakturanummer</TableHead>
          {showSupplier && <TableHead>Leverantör</TableHead>}
          <TableHead>Fakturadatum</TableHead>
          <TableHead>Förfallodatum</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Belopp</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invoices.length === 0 ? (
          <TableRow>
            <TableCell colSpan={selectable ? 7 : 6} className="text-center text-muted-foreground py-8">
              Inga leverantörsfakturor hittades
            </TableCell>
          </TableRow>
        ) : (
          invoices.map((invoice) => {
            const overdue = isOverdue(invoice)
            return (
              <TableRow
                key={invoice.id}
                className={overdue ? 'bg-destructive/5' : undefined}
              >
                {selectable && (
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(invoice.id)}
                      onCheckedChange={(checked) =>
                        onSelectChange?.(invoice.id, !!checked)
                      }
                      aria-label={`Välj faktura ${invoice.invoice_number}`}
                    />
                  </TableCell>
                )}
                <TableCell>
                  <Link
                    href={`/supplier-invoices/${invoice.id}`}
                    className="font-medium hover:underline"
                  >
                    {invoice.invoice_number}
                  </Link>
                </TableCell>
                {showSupplier && (
                  <TableCell>
                    {invoice.supplier ? (
                      <Link
                        href={`/suppliers/${invoice.supplier.id}`}
                        className="hover:underline"
                      >
                        {invoice.supplier.name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                )}
                <TableCell>{formatDate(invoice.invoice_date)}</TableCell>
                <TableCell>
                  <span className={overdue ? 'text-destructive font-medium' : ''}>
                    {formatDate(invoice.due_date)}
                  </span>
                  {overdue && (
                    <Badge variant="destructive" className="ml-2 text-xs">
                      Förfallen
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={getStatusVariant(invoice.status)}>
                    {SUPPLIER_INVOICE_STATUS_LABELS[invoice.status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {formatCurrency(invoice.total)}
                </TableCell>
              </TableRow>
            )
          })
        )}
      </TableBody>
    </Table>
  )
}
