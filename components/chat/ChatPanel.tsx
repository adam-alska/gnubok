'use client'

import { useEffect, useRef } from 'react'
import { ChatMessage } from './ChatMessage'
import { ChatInput } from './ChatInput'
import { useChatStream } from './useChatStream'
import { useToast } from '@/components/ui/use-toast'
import { Bot, Trash2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ChatPanelProps {
  className?: string
}

export function ChatPanel({ className }: ChatPanelProps) {
  const { toast } = useToast()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const {
    messages,
    isLoading,
    isStreaming,
    error,
    sendMessage,
    clearChat,
  } = useChatStream({
    onError: (error) => {
      toast({
        title: 'Fel',
        description: error,
        variant: 'destructive',
      })
    },
  })

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  const handleClearChat = () => {
    clearChat()
    toast({
      title: 'Chatten rensad',
      description: 'En ny konversation har startats.',
    })
  }

  return (
    <div className={`flex flex-col h-full ${className || ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Bot className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="font-medium text-sm">AI-assistent</h3>
            <p className="text-xs text-muted-foreground">
              Skatt, moms och bokföring
            </p>
          </div>
        </div>
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearChat}
            className="text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-4 w-4 mr-1" />
            Ny chatt
          </Button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 py-8">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Bot className="h-6 w-6 text-primary" />
            </div>
            <h4 className="font-medium mb-2">Hur kan jag hjälpa dig?</h4>
            <p className="text-sm text-muted-foreground max-w-xs">
              Jag kan svara på frågor om skatt, moms, bokföring och andra
              ekonomiska frågor för företagare.
            </p>
            <div className="mt-6 space-y-2 w-full max-w-xs">
              <SuggestionButton
                onClick={() => sendMessage('Hur fungerar momsen på mina fakturor?')}
                disabled={isLoading}
              >
                Hur fungerar momsen på mina fakturor?
              </SuggestionButton>
              <SuggestionButton
                onClick={() => sendMessage('Vad kan jag dra av som företagare?')}
                disabled={isLoading}
              >
                Vad kan jag dra av som företagare?
              </SuggestionButton>
              <SuggestionButton
                onClick={() => sendMessage('När måste jag momsregistrera mig?')}
                disabled={isLoading}
              >
                När måste jag momsregistrera mig?
              </SuggestionButton>
            </div>
          </div>
        ) : (
          <div className="py-4">
            {messages.map((message, index) => (
              <ChatMessage
                key={message.id}
                message={message}
                isStreaming={
                  isStreaming &&
                  index === messages.length - 1 &&
                  message.role === 'assistant'
                }
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <ChatInput
        onSend={sendMessage}
        disabled={isStreaming}
        isLoading={isLoading}
        placeholder="Ställ en fråga om skatt, moms eller bokföring..."
      />
    </div>
  )
}

function SuggestionButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full text-left text-sm px-3 py-2 rounded-lg border border-border/60 hover:bg-muted/50 hover:border-border transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  )
}
