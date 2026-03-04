'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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
  sandbox = process.env.NEXT_PUBLIC_ENABLE_BANKING_SANDBOX === 'true',
}: BankSelectorProps) {
  const widgetRef = useRef<HTMLElement | null>(null)
  const [scriptReady, setScriptReady] = useState(false)

  // Stable ref for onSelect so the event listener never goes stale
  const onSelectRef = useRef(onSelect)
  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  const handleSelected = useCallback((e: Event) => {
    const customEvent = e as CustomEvent
    const detail = customEvent.detail as {
      name: string
      country: string
      psuType: string
      sandbox: boolean
    }

    onSelectRef.current({
      name: detail.name,
      country: detail.country,
    })
  }, [])

  // Attach the event listener once the script is ready and the widget is in the DOM.
  // Using onReady instead of onLoad ensures the script has fully executed and
  // the custom element has been defined/upgraded before we interact with it.
  useEffect(() => {
    if (!scriptReady) return

    const widget = widgetRef.current
    if (!widget) return

    widget.addEventListener('selected', handleSelected)

    return () => {
      widget.removeEventListener('selected', handleSelected)
    }
  }, [scriptReady, handleSelected])

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
        onReady={() => setScriptReady(true)}
        strategy="afterInteractive"
      />
      <link
        href="https://tilisy.enablebanking.com/lib/widgets.css"
        rel="stylesheet"
      />

      {/* Only render the custom element after the script has defined it,
          so the browser can upgrade it immediately with full interactivity */}
      {scriptReady ? (
        // @ts-expect-error - Enable Banking custom element
        <enablebanking-aspsp-list
          ref={widgetRef}
          country={country}
          psu-type="business"
          service="AIS"
          {...(sandbox ? { sandbox: true } : {})}
          style={{ minHeight: '200px' }}
        />
      ) : (
        <div className="flex items-center justify-center" style={{ minHeight: '200px' }}>
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Laddar bankwidget...</span>
        </div>
      )}

      <p className="text-xs text-muted-foreground text-center">
        {sandbox ? 'Sandbox-läge: Använd testbanker för utveckling' : 'Välj din bank för att fortsätta'}
      </p>
    </div>
  )
}
