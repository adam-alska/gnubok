'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import { BankIdQrCode } from './BankIdQrCode'
import { Button } from '@/components/ui/button'
import { Smartphone, Monitor } from 'lucide-react'

type BankIdStatus = 'idle' | 'scanning' | 'complete' | 'failed' | 'no_account'

interface BankIdSession {
  sessionId: string
  autoStartToken: string
  qrStartToken: string
  qrStartSecret: string
}

export interface BankIdResult {
  tokenHash?: string
  type?: string
  isNewUser?: boolean
  error?: 'no_account' | 'already_linked' | 'session_invalid'
  givenName?: string
  surname?: string
  sessionId?: string
}

interface BankIdAuthProps {
  mode: 'login' | 'signup' | 'link'
  onComplete: (result: BankIdResult) => void
}

const API_BASE = '/api/extensions/ext/tic/bankid'

function isMobile(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

/**
 * BankID authentication flow component.
 * Handles QR code display (desktop) or app deep link (mobile),
 * polling, and result handling.
 */
export function BankIdAuth({ mode, onComplete }: BankIdAuthProps) {
  const [status, setStatus] = useState<BankIdStatus>('idle')
  const [session, setSession] = useState<BankIdSession | null>(null)
  const [hintMessage, setHintMessage] = useState<string>('')
  const [errorMessage, setErrorMessage] = useState<string>('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const lastStartRef = useRef<number>(0)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  const cleanup = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
  }, [])

  useEffect(() => cleanup, [cleanup])

  const startSession = useCallback(async () => {
    // Prevent rapid restarts (each start = billable TIC session)
    const now = Date.now()
    if (now - lastStartRef.current < 5000) return
    lastStartRef.current = now

    cleanup()
    setStatus('scanning')
    setHintMessage('Starta BankID-appen')
    setErrorMessage('')

    try {
      const res = await fetch(`${API_BASE}/start`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to start BankID')
      }

      const { data } = await res.json()
      const newSession: BankIdSession = data
      setSession(newSession)

      // On mobile, open BankID app
      if (isMobile()) {
        const returnUrl = encodeURIComponent(window.location.href)
        window.location.href = `bankid:///?autostarttoken=${newSession.autoStartToken}&redirect=${returnUrl}`
      }

      // Start polling
      abortRef.current = new AbortController()
      pollRef.current = setInterval(async () => {
        try {
          const pollRes = await fetch(`${API_BASE}/poll`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: newSession.sessionId }),
            signal: abortRef.current?.signal,
          })

          if (!pollRes.ok) return

          const pollJson = await pollRes.json()
          const pollData = pollJson.data

          if (!pollData) {
            console.warn('[bankid] poll returned no data:', pollJson)
            return
          }

          // Update hint message from TIC API
          if (pollData.message) {
            setHintMessage(pollData.message)
          }

          // Handle token refresh (order regeneration ~25s)
          if (pollData.qrStartToken && pollData.qrStartSecret) {
            setSession((prev) =>
              prev
                ? { ...prev, qrStartToken: pollData.qrStartToken, qrStartSecret: pollData.qrStartSecret }
                : prev
            )
          }

          if (pollData.status === 'complete') {
            cleanup()
            setStatus('complete')

            if (mode === 'login') {
              // For login, call /complete to exchange for Supabase session
              try {
                const completeRes = await fetch(`${API_BASE}/complete`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    sessionId: newSession.sessionId,
                    mode: 'login',
                  }),
                })
                const completeJson = await completeRes.json()

                if (!completeRes.ok) {
                  onCompleteRef.current({
                    error: completeJson.error,
                    givenName: completeJson.givenName,
                    surname: completeJson.surname,
                  })
                  return
                }

                onCompleteRef.current({
                  tokenHash: completeJson.data.tokenHash,
                  type: completeJson.data.type,
                  isNewUser: completeJson.data.isNewUser,
                })
              } catch {
                onCompleteRef.current({ error: 'session_invalid' })
              }
            } else if (mode === 'link') {
              // For link, call /link to associate BankID with current user
              try {
                const linkRes = await fetch(`${API_BASE}/link`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ sessionId: newSession.sessionId }),
                })
                const linkJson = await linkRes.json()

                if (!linkRes.ok) {
                  onCompleteRef.current({ error: linkJson.error })
                  return
                }

                onCompleteRef.current({})
              } catch {
                onCompleteRef.current({ error: 'session_invalid' })
              }
            } else {
              // For signup, return user data + sessionId so parent can collect email
              onCompleteRef.current({
                givenName: pollData.user?.givenName,
                surname: pollData.user?.surname,
                sessionId: newSession.sessionId,
              })
            }
          } else if (pollData.status === 'failed' || pollData.status === 'cancelled') {
            cleanup()
            setStatus('failed')
            setErrorMessage(pollData.message || 'BankID-identifieringen misslyckades')
          }
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') return
          // Polling error — will retry next tick
        }
      }, 2000)
    } catch (error) {
      setStatus('failed')
      setErrorMessage(error instanceof Error ? error.message : 'Ett oväntat fel uppstod')
    }
  }, [cleanup, mode])

  const handleCancel = useCallback(async () => {
    if (session) {
      fetch(`${API_BASE}/${session.sessionId}`, { method: 'DELETE' }).catch(() => {})
    }
    cleanup()
    setStatus('idle')
    setSession(null)
  }, [session, cleanup])

  if (status === 'idle') {
    const label = mode === 'login'
      ? 'Logga in med BankID'
      : mode === 'link'
        ? 'Koppla BankID'
        : 'Skapa konto med BankID'

    return (
      <Button
        onClick={startSession}
        variant="outline"
        className="w-full gap-2 border-[1.5px] py-6 text-base"
      >
        <BankIdIcon />
        {label}
      </Button>
    )
  }

  if (status === 'failed') {
    return (
      <div className="flex flex-col items-center gap-4">
        <p className="text-sm text-destructive">{errorMessage}</p>
        <Button onClick={startSession} variant="outline" className="gap-2">
          <BankIdIcon />
          Forsok igen
        </Button>
      </div>
    )
  }

  const openBankIdOnDevice = () => {
    if (!session) return
    // Open BankID app on the same device via deep link
    // redirect=null tells BankID not to redirect after completion
    window.location.href = `bankid:///?autostarttoken=${session.autoStartToken}&redirect=null`
  }

  // Scanning / waiting for user
  return (
    <div className="flex flex-col items-center gap-4">
      {session && !isMobile() && (
        <>
          <BankIdQrCode
            qrStartToken={session.qrStartToken}
            qrStartSecret={session.qrStartSecret}
          />
          <Button
            onClick={openBankIdOnDevice}
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
          >
            <Monitor className="h-3.5 w-3.5" />
            BankID pa den har enheten
          </Button>
        </>
      )}

      {isMobile() && (
        <div className="flex flex-col items-center gap-2">
          <Smartphone className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Oppnar BankID-appen...</p>
        </div>
      )}

      <p className="text-sm text-muted-foreground">{hintMessage}</p>

      <Button
        onClick={handleCancel}
        variant="ghost"
        size="sm"
        className="text-muted-foreground"
      >
        Avbryt
      </Button>
    </div>
  )
}

function BankIdIcon() {
  return (
    <Image
      src="/logos/bankid-seeklogo.svg"
      alt="BankID"
      width={20}
      height={20}
      className="dark:invert"
    />
  )
}
