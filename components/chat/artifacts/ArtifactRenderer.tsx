'use client'

import type { ArtifactSpec } from '@/types/chat'
import { ChatChart } from './ChatChart'
import { ChatDataTable } from './ChatDataTable'
import { ChatKpiCards } from './ChatKpiCards'
import { ChatAgingBuckets } from './ChatAgingBuckets'

interface ArtifactRendererProps {
  artifact: ArtifactSpec
}

export function ArtifactRenderer({ artifact }: ArtifactRendererProps) {
  switch (artifact.type) {
    case 'bar_chart':
    case 'line_chart':
    case 'pie_chart':
    case 'stacked_bar':
      return (
        <div className="mt-3 p-3 rounded-lg border border-border bg-card">
          <ChatChart artifact={artifact} />
        </div>
      )
    case 'table':
      return (
        <div className="mt-3">
          <ChatDataTable artifact={artifact} />
        </div>
      )
    case 'kpi_cards':
      return (
        <div className="mt-3">
          <ChatKpiCards artifact={artifact} />
        </div>
      )
    case 'aging_buckets':
      return (
        <div className="mt-3 p-3 rounded-lg border border-border bg-card">
          <ChatAgingBuckets artifact={artifact} />
        </div>
      )
    default:
      return null
  }
}
