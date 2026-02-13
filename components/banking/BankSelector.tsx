'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import Script from 'next/script'

export interface Bank {
  name: string
  country: string
  logo?: string
  bic?: string
}

interface BankSelectorProps {
  onSelect: (bank: Bank) => void
  selectedBank?: Bank | null
  isLoading?: boolean
  className?: string
  country?: string
  sandbox?: boolean
}

export function BankSelector({
  onSelect,
  isLoading = false,
  className,
  country = 'SE',
  sandbox = true, // Default to sandbox for development
}: BankSelectorProps) {
  const widgetRef = useRef<HTMLElement | null>(null)
  const [scriptLoaded, setScriptLoaded] = useState(false)

  useEffect(() => {
    if (!scriptLoaded) return

    const widget = widgetRef.current
    if (!widget) return

    const handleSelected = (e: Event) => {
      const customEvent = e as CustomEvent
      const detail = customEvent.detail as {
        name: string
        country: string
        psuType: string
        sandbox: boolean
      }

      onSelect({
        name: detail.name,
        country: detail.country,
      })
    }

    widget.addEventListener('selected', handleSelected)

    return () => {
      widget.removeEventListener('selected', handleSelected)
    }
  }, [onSelect, scriptLoaded])

  const handleScriptLoad = () => {
    setScriptLoaded(true)
  }

  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center p-8', className)}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Ansluter...</span>
      </div>
    )
  }

  return (
    <div className={cn('space-y-3', className)}>
      <Script
        src="https://tilisy.enablebanking.com/lib/widgets.umd.min.js"
        onLoad={handleScriptLoad}
        strategy="afterInteractive"
      />
      <link
        href="https://tilisy.enablebanking.com/lib/widgets.css"
        rel="stylesheet"
      />

      {/* @ts-expect-error - Enable Banking custom element */}
      <enablebanking-aspsp-list
        ref={widgetRef}
        country={country}
        psu-type="business"
        service="AIS"
        {...(sandbox ? { sandbox: true } : {})}
        style={{ minHeight: '200px' }}
      />

      <p className="text-xs text-muted-foreground text-center">
        {sandbox ? 'Sandbox-läge: Använd testbanker för utveckling' : 'Välj din bank för att fortsätta'}
      </p>
    </div>
  )
}
