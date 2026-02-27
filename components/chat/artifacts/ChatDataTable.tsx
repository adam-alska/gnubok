'use client'

import type { TableArtifact } from '@/types/chat'

interface ChatDataTableProps {
  artifact: TableArtifact
}

function formatCell(value: string | number, align?: 'left' | 'right'): string {
  if (typeof value === 'number') {
    return new Intl.NumberFormat('sv-SE', {
      minimumFractionDigits: value % 1 !== 0 ? 2 : 0,
      maximumFractionDigits: 2,
    }).format(value)
  }
  return String(value)
}

export function ChatDataTable({ artifact }: ChatDataTableProps) {
  const { title, columns, rows, summary_row } = artifact

  return (
    <div className="w-full">
      <h4 className="text-sm font-semibold mb-2">{title}</h4>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-3 py-2 font-medium text-muted-foreground border-b border-border ${
                    col.align === 'right' ? 'text-right' : 'text-left'
                  }`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                className="border-b border-border/50 hover:bg-muted/20 transition-colors"
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-3 py-1.5 ${
                      col.align === 'right' ? 'text-right tabular-nums' : 'text-left'
                    }`}
                  >
                    {formatCell(row[col.key], col.align)}
                  </td>
                ))}
              </tr>
            ))}
            {summary_row && (
              <tr className="bg-muted/30 font-semibold">
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-3 py-2 border-t border-border ${
                      col.align === 'right' ? 'text-right tabular-nums' : 'text-left'
                    }`}
                  >
                    {summary_row[col.key] !== undefined
                      ? formatCell(summary_row[col.key], col.align)
                      : ''}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
