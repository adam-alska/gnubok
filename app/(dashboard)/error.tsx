'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[dashboard] Unhandled error:', error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
      <h2 className="text-xl font-semibold">Nagot gick fel</h2>
      <p className="text-muted-foreground text-sm max-w-md text-center">
        Ett oväntat fel uppstod. Försök igen eller kontakta support om problemet
        kvarstår.
      </p>
      <Button onClick={reset}>Försök igen</Button>
    </div>
  )
}
