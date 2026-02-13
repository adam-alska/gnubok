'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ChatPanel } from './ChatPanel'
import { MessageCircle, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      {/* Floating chat panel */}
      <div
        className={cn(
          'fixed bottom-36 right-4 md:bottom-20 z-[60] transition-all duration-300 ease-in-out',
          isOpen
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 translate-y-4 pointer-events-none'
        )}
      >
        <div className="w-[380px] h-[550px] max-h-[calc(100vh-120px)] bg-background border rounded-xl shadow-xl overflow-hidden flex flex-col">
          {/* Close button in corner */}
          <button
            onClick={() => setIsOpen(false)}
            className="absolute top-2 right-2 z-10 p-1.5 rounded-full bg-muted/80 hover:bg-muted transition-colors"
            aria-label="Stäng chatt"
          >
            <X className="h-4 w-4" />
          </button>

          <ChatPanel />
        </div>
      </div>

      {/* Floating action button */}
      <Button
        onClick={() => setIsOpen(!isOpen)}
        size="icon"
        className={cn(
          'fixed bottom-20 right-4 md:bottom-4 z-[60] h-14 w-14 rounded-full shadow-lg transition-all duration-300',
          isOpen && 'rotate-90'
        )}
        aria-label={isOpen ? 'Stäng chatt' : 'Öppna chatt'}
      >
        {isOpen ? (
          <X className="h-6 w-6" />
        ) : (
          <MessageCircle className="h-6 w-6" />
        )}
      </Button>
    </>
  )
}
