'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { ChevronRight, ChevronDown } from 'lucide-react'

interface AccountGroupRowProps {
  title: string
  subtotal: number
  children: React.ReactNode
  defaultOpen?: boolean
  className?: string
}

function formatSEK(amount: number): string {
  return new Intl.NumberFormat('sv-SE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(amount))
}

export default function AccountGroupRow({
  title,
  subtotal,
  children,
  defaultOpen = true,
  className,
}: AccountGroupRowProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className={cn('border-b last:border-b-0', className)}>
      {/* Group header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 py-2.5 px-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
      >
        {isOpen
          ? <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          : <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        }
        <span className="text-sm font-semibold flex-1">{title}</span>
        <span className="text-sm font-semibold tabular-nums">{formatSEK(subtotal)}</span>
      </button>

      {/* Account rows */}
      {isOpen && (
        <div>
          {children}
        </div>
      )}
    </div>
  )
}
