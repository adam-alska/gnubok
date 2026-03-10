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
  onConnect: (bank: Bank) => void
  isConnecting?: boolean
  connectingBankName?: string | null
  className?: string
}

/**
 * Popular Swedish banks shown as quick-access buttons above the full widget.
 * Country is always 'SE' since we only support Swedish banks.
 */
const POPULAR_BANKS: Bank[] = [
  { name: 'Nordea', country: 'SE' },
  { name: 'SEB', country: 'SE' },
  { name: 'Swedbank', country: 'SE' },
  { name: 'Handelsbanken', country: 'SE' },
  { name: 'Länsförsäkringar', country: 'SE' },
  { name: 'Skandia', country: 'SE' },
  { name: 'Danske Bank', country: 'SE' },
]

export function BankSelector({
  onConnect,
  isConnecting = false,
  connectingBankName = null,
  className,
}: BankSelectorProps) {
  const widgetRef = useRef<HTMLElement | null>(null)
  const [scriptReady, setScriptReady] = useState(false)

  // Stable ref so the event listener never goes stale
  const onConnectRef = useRef(onConnect)
  useEffect(() => {
    onConnectRef.current = onConnect
  }, [onConnect])

  const handleSelected = useCallback((e: Event) => {
    const detail = (e as CustomEvent).detail as {
      name: string
      country: string
      psuType: string
      sandbox: boolean
    }
    onConnectRef.current({
      name: detail.name,
      country: detail.country,
    })
  }, [])

  // Attach event listener once the script is ready and the widget is in the DOM
  useEffect(() => {
    if (!scriptReady) return
    const widget = widgetRef.current
    if (!widget) return

    widget.addEventListener('selected', handleSelected)
    return () => {
      widget.removeEventListener('selected', handleSelected)
    }
  }, [scriptReady, handleSelected])

  // Inject styles into the widget's shadow DOM to hide logos
  useEffect(() => {
    if (!scriptReady) return
    const widget = widgetRef.current
    if (!widget?.shadowRoot) return

    const style = document.createElement('style')
    style.textContent = `
      .radio-chips__pic,
      .radio-chips__pic img,
      .radio-chips__content img,
      .radio-chips__content svg,
      .radio-chips__content .avatar,
      .radio-chips__content .icon,
      .radio-chips__content .fallback,
      .radio-chips__content > *:first-child:not(.radio-chips__title):not(.beta-flag) {
        display: none !important;
      }
    `
    widget.shadowRoot.appendChild(style)
  }, [scriptReady])

  return (
    <div className={cn('space-y-4', className)}>
      {/* Popular banks — one-click connect */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">Populära banker</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {POPULAR_BANKS.map((bank) => {
            const connecting = isConnecting && connectingBankName === bank.name
            return (
              <button
                key={bank.name}
                type="button"
                disabled={isConnecting}
                onClick={() => onConnect(bank)}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors',
                  'hover:bg-muted/50 hover:border-primary/30',
                  connecting && 'border-primary bg-primary/5',
                  isConnecting && !connecting && 'opacity-50 cursor-not-allowed'
                )}
              >
                {connecting && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                )}
                <span className="truncate">{bank.name}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Full bank list via Enable Banking widget — includes logos and search */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">Alla banker</p>
        <Script
          src="https://tilisy.enablebanking.com/lib/widgets.umd.min.js"
          onReady={() => setScriptReady(true)}
          strategy="afterInteractive"
        />
        <link
          href="https://tilisy.enablebanking.com/lib/widgets.css"
          rel="stylesheet"
        />

        {scriptReady ? (
          <div className={cn(
            'rounded-lg border bg-card/50 overflow-hidden p-3',
            isConnecting && 'pointer-events-none opacity-50'
          )}>
            {/* @ts-expect-error - Enable Banking custom element */}
            <enablebanking-aspsp-list
              ref={widgetRef}
              country="SE"
              psu-type="business"
              service="AIS"
              style={{ minHeight: '200px' }}
            />
          </div>
        ) : (
          <div className="flex items-center justify-center rounded-lg border bg-card/50" style={{ minHeight: '200px' }}>
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Laddar banker...</span>
          </div>
        )}
      </div>

      {/* Connecting overlay */}
      {isConnecting && connectingBankName && (
        <div className="flex items-center justify-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span className="text-sm font-medium">Ansluter till {connectingBankName}...</span>
        </div>
      )}
    </div>
  )
}
