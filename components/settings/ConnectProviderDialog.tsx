'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import type { AccountingProvider } from '@/types'

interface ConnectProviderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  provider: AccountingProvider | null
  onSubmit: (data: Record<string, string>) => void
  isLoading: boolean
}

export function ConnectProviderDialog({
  open,
  onOpenChange,
  provider,
  onSubmit,
  isLoading,
}: ConnectProviderDialogProps) {
  const [fields, setFields] = useState<Record<string, string>>({})

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit(fields)
  }

  function handleOpenChange(val: boolean) {
    if (!val) setFields({})
    onOpenChange(val)
  }

  if (!provider) return null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {provider === 'briox' && 'Anslut Briox'}
            {provider === 'bokio' && 'Anslut Bokio'}
            {provider === 'bjorn_lunden' && 'Anslut Björn Lundén'}
          </DialogTitle>
          <DialogDescription>
            {provider === 'briox' && 'Ange din application token från Briox-inställningarna.'}
            {provider === 'bokio' && 'Ange din API-nyckel och företags-ID från Bokio.'}
            {provider === 'bjorn_lunden' && 'Ange din företagsnyckel (UUID) från Björn Lundén.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {provider === 'briox' && (
            <div className="space-y-2">
              <Label htmlFor="application_token">Application Token</Label>
              <Input
                id="application_token"
                type="password"
                placeholder="Klistra in din application token"
                value={fields.application_token || ''}
                onChange={(e) => setFields({ ...fields, application_token: e.target.value })}
                required
              />
            </div>
          )}

          {provider === 'bokio' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="api_key">API-nyckel</Label>
                <Input
                  id="api_key"
                  type="password"
                  placeholder="Klistra in din API-nyckel"
                  value={fields.api_key || ''}
                  onChange={(e) => setFields({ ...fields, api_key: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company_id">Företags-ID</Label>
                <Input
                  id="company_id"
                  placeholder="T.ex. 123456"
                  value={fields.company_id || ''}
                  onChange={(e) => setFields({ ...fields, company_id: e.target.value })}
                  required
                />
              </div>
            </>
          )}

          {provider === 'bjorn_lunden' && (
            <div className="space-y-2">
              <Label htmlFor="company_key">Företagsnyckel</Label>
              <Input
                id="company_key"
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={fields.company_key || ''}
                onChange={(e) => setFields({ ...fields, company_key: e.target.value })}
                required
              />
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isLoading}
            >
              Avbryt
            </Button>
            <Button type="submit" variant="outline" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Ansluter...
                </>
              ) : (
                'Anslut'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
