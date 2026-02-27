'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronUp, FileText, User, Bot, Database, Loader2 } from 'lucide-react'
import type { ChatMessage as ChatMessageType, SourceReference } from '@/types/chat'
import { ArtifactRenderer } from './artifacts/ArtifactRenderer'

interface ChatMessageProps {
  message: ChatMessageType
  isStreaming?: boolean
  toolsExecuting?: string[]
}

function SourcesList({ sources }: { sources: SourceReference[] }) {
  const [isExpanded, setIsExpanded] = useState(false)

  if (sources.length === 0) return null

  return (
    <div className="mt-3 pt-3 border-t border-border/40">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <FileText className="h-3 w-3" />
        <span>{sources.length} källa{sources.length !== 1 ? 'or' : ''}</span>
        {isExpanded ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )}
      </button>

      {isExpanded && (
        <div className="mt-2 space-y-1.5">
          {sources.map((source, index) => (
            <div
              key={source.id || index}
              className="text-xs bg-muted/50 rounded-md px-2.5 py-1.5"
            >
              <div className="font-medium text-foreground/80">
                {source.title}
                {source.section_title && (
                  <span className="font-normal text-muted-foreground">
                    {' '}
                    &rsaquo; {source.section_title}
                  </span>
                )}
              </div>
              <div className="text-muted-foreground mt-0.5">
                {source.source_file} ({(source.similarity * 100).toFixed(0)}% relevans)
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const TOOL_LABELS: Record<string, string> = {
  get_invoices: 'Hämtar fakturor',
  get_supplier_invoices: 'Hämtar leverantörsfakturor',
  get_account_balances: 'Hämtar kontosaldon',
  get_transactions: 'Hämtar transaktioner',
  get_journal_entries: 'Hämtar verifikationer',
  get_income_statement: 'Genererar resultaträkning',
  get_balance_sheet: 'Genererar balansräkning',
  get_vat_summary: 'Beräknar momssammanställning',
  get_company_overview: 'Hämtar företagsöversikt',
  get_aging_report: 'Genererar åldersanalys',
}

function ToolExecutingIndicator({ tools }: { tools: string[] }) {
  if (tools.length === 0) return null

  return (
    <div className="flex flex-col gap-1 mb-2">
      {tools.map((toolName, i) => (
        <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          <Database className="h-3 w-3" />
          <span>{TOOL_LABELS[toolName] || toolName}...</span>
        </div>
      ))}
    </div>
  )
}

export function ChatMessage({ message, isStreaming, toolsExecuting }: ChatMessageProps) {
  const isUser = message.role === 'user'

  return (
    <div
      className={cn(
        'flex gap-3 px-4 py-3',
        isUser ? 'flex-row-reverse' : 'flex-row'
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground'
        )}
      >
        {isUser ? (
          <User className="h-4 w-4" />
        ) : (
          <Bot className="h-4 w-4" />
        )}
      </div>

      {/* Message content */}
      <div
        className={cn(
          'flex-1 max-w-[80%] rounded-xl px-4 py-3',
          isUser
            ? 'bg-primary text-primary-foreground ml-auto'
            : 'bg-muted/60 text-foreground'
        )}
      >
        {/* Tool execution indicator */}
        {!isUser && isStreaming && toolsExecuting && toolsExecuting.length > 0 && !message.content && (
          <ToolExecutingIndicator tools={toolsExecuting} />
        )}

        <div className={cn(
          "text-sm break-words",
          !isUser && "prose prose-sm max-w-none prose-headings:text-foreground prose-headings:font-semibold prose-h1:text-base prose-h2:text-sm prose-h3:text-sm prose-p:text-foreground prose-p:my-1.5 prose-headings:my-2 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-li:text-foreground prose-strong:text-foreground prose-table:my-2 prose-table:text-xs prose-th:px-2 prose-th:py-1 prose-td:px-2 prose-td:py-1 prose-th:bg-muted/50 prose-th:border prose-td:border prose-th:border-border/50 prose-td:border-border/50 prose-th:text-foreground prose-td:text-foreground"
        )}>
          {isUser ? (
            <p className="whitespace-pre-wrap m-0">{message.content}</p>
          ) : (
            <ReactMarkdown>{message.content}</ReactMarkdown>
          )}
          {isStreaming && !isUser && (
            <span className="inline-block w-1.5 h-4 bg-current animate-pulse ml-0.5" />
          )}
        </div>

        {/* Artifact visualization */}
        {!isUser && message.artifact && (
          <ArtifactRenderer artifact={message.artifact} />
        )}

        {!isUser && message.sources && message.sources.length > 0 && (
          <SourcesList sources={message.sources} />
        )}
      </div>
    </div>
  )
}
