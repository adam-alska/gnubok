'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'

interface TikTokConnectButtonProps {
  disabled?: boolean
  variant?: 'default' | 'outline' | 'ghost'
  size?: 'default' | 'sm' | 'lg'
  className?: string
}

export function TikTokConnectButton({
  disabled = false,
  variant = 'default',
  size = 'default',
  className,
}: TikTokConnectButtonProps) {
  const [isConnecting, setIsConnecting] = useState(false)
  const { toast } = useToast()

  const handleConnect = async () => {
    setIsConnecting(true)

    try {
      const response = await fetch('/api/tiktok/connect', {
        method: 'POST',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start connection')
      }

      // Redirect to TikTok authorization
      window.location.href = data.authorization_url
    } catch (error) {
      toast({
        title: 'Anslutning misslyckades',
        description: error instanceof Error ? error.message : 'Ett fel uppstod',
        variant: 'destructive',
      })
      setIsConnecting(false)
    }
  }

  return (
    <Button
      onClick={handleConnect}
      disabled={disabled || isConnecting}
      variant={variant}
      size={size}
      className={className}
    >
      {isConnecting ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Ansluter...
        </>
      ) : (
        <>
          <TikTokIcon className="mr-2 h-4 w-4" />
          Koppla TikTok
        </>
      )}
    </Button>
  )
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
    </svg>
  )
}
