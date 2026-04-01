import type { Extension, ExtensionContext } from '@/lib/extensions/types'
import { NextResponse } from 'next/server'
import { signUp, signIn, getActivepiecesUrl } from './lib/ap-client'
import { forwardEvent } from './lib/event-forwarder'
import { extractBearerToken, validateApiKey, createServiceClientNoCookies } from '@/lib/auth/api-keys'
import { requireCompanyId } from '@/lib/company/context'

// Generate a random password for the AP user.
// Stored in extension settings, so we only generate once per user.
function generateAPPassword(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let password = 'ap_'
  for (let i = 0; i < 24; i++) {
    password += chars[Math.floor(Math.random() * chars.length)]
  }
  return password
}

interface APUserData {
  email: string
  token: string
  projectId: string
  password: string
}

export const automationsExtension: Extension = {
  id: 'automations',
  name: 'Automatiseringar',
  version: '1.0.0',

  settingsPanel: {
    label: 'Automatiseringar',
    path: '/settings?tab=automations',
  },

  apiRoutes: [
    {
      // Provision or sign in an AP user for the current gnubok user.
      // Returns a fresh AP token for iframe embedding.
      method: 'POST',
      path: '/token',
      handler: async (_request: Request, ctx?: ExtensionContext) => {
        const log = ctx?.log ?? console
        const supabase = ctx?.supabase ?? await (await import('@/lib/supabase/server')).createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const settings = ctx?.settings
        if (!settings) {
          return NextResponse.json({ error: 'Extension context unavailable' }, { status: 500 })
        }

        try {
          // Check if we already have AP credentials stored
          const existing = await settings.get<APUserData>('ap_user')

          if (existing?.email) {
            // Sign in to get a fresh token
            try {
              const auth = await signIn(existing.email, existing.password)
              await settings.set('ap_user', { ...existing, token: auth.token })
              return NextResponse.json({
                token: auth.token,
                url: getActivepiecesUrl(),
                projectId: auth.projectId,
              })
            } catch {
              log.warn('AP sign-in failed, clearing stored credentials')
              await settings.set('ap_user', null)
            }
          }

          // Try to provision a new AP user
          const email = user.email ?? `${user.id}@gnubok.local`
          const password = generateAPPassword()

          let auth: { token: string; projectId: string }
          try {
            auth = await signUp({
              email,
              password,
              firstName: 'gnubok',
              lastName: 'User',
            })
          } catch (signUpError) {
            // Sign-up may be restricted (invitation-only in CE after first user).
            // Fall back to signing in with the admin credentials from env vars.
            const adminEmail = process.env.ACTIVEPIECES_ADMIN_EMAIL
            const adminPassword = process.env.ACTIVEPIECES_ADMIN_PASSWORD
            if (!adminEmail || !adminPassword) {
              throw new Error(
                'AP sign-up is restricted and ACTIVEPIECES_ADMIN_EMAIL/ACTIVEPIECES_ADMIN_PASSWORD are not set. ' +
                'Set these env vars to the AP admin account credentials.'
              )
            }
            auth = await signIn(adminEmail, adminPassword)
          }

          const apUser: APUserData = {
            email: email,
            token: auth.token,
            projectId: auth.projectId,
            password,
          }

          await settings.set('ap_user', apUser)

          log.info('Provisioned AP session', { userId: user.id, apProjectId: auth.projectId })

          return NextResponse.json({
            token: auth.token,
            url: getActivepiecesUrl(),
            projectId: auth.projectId,
          })
        } catch (error) {
          log.error('Failed to provision AP token', {
            message: error instanceof Error ? error.message : String(error),
          })
          return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to connect to automation service' },
            { status: 500 }
          )
        }
      },
    },
    {
      // Register a webhook subscription so AP flows can receive gnubok events
      method: 'POST',
      path: '/webhooks',
      handler: async (request: Request, ctx?: ExtensionContext) => {
        const log = ctx?.log ?? console
        if (!ctx) {
          return NextResponse.json({ error: 'Extension context unavailable' }, { status: 500 })
        }

        const { event_type, webhook_url } = await request.json()

        if (!event_type || !webhook_url) {
          return NextResponse.json({ error: 'event_type and webhook_url required' }, { status: 400 })
        }

        // Validate webhook URL format and block private/internal addresses
        try {
          const parsed = new URL(webhook_url)
          if (parsed.protocol !== 'https:') {
            return NextResponse.json({ error: 'Webhook URL must use HTTPS' }, { status: 400 })
          }
          const host = parsed.hostname.toLowerCase()
          const blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '169.254.169.254']
          const blockedPrefixes = ['10.', '192.168.', '172.16.', '172.17.', '172.18.', '172.19.', '172.20.', '172.21.', '172.22.', '172.23.', '172.24.', '172.25.', '172.26.', '172.27.', '172.28.', '172.29.', '172.30.', '172.31.']
          const blockedSuffixes = ['.internal', '.local']
          if (
            blockedHosts.includes(host) ||
            blockedPrefixes.some(p => host.startsWith(p)) ||
            blockedSuffixes.some(s => host.endsWith(s))
          ) {
            return NextResponse.json({ error: 'Webhook URL must not point to internal addresses' }, { status: 400 })
          }
        } catch {
          return NextResponse.json({ error: 'Invalid webhook URL' }, { status: 400 })
        }

        const { data, error } = await ctx.supabase
          .from('automation_webhooks')
          .upsert(
            {
              company_id: ctx.companyId,
              event_type,
              webhook_url,
              active: true,
            },
            { onConflict: 'company_id,event_type' }
          )
          .select()
          .single()

        if (error) {
          log.error('Failed to register webhook', error.message)
          return NextResponse.json({ error: 'Failed to register webhook' }, { status: 500 })
        }

        return NextResponse.json({ data })
      },
    },
    {
      // List webhook subscriptions for the current company
      method: 'GET',
      path: '/webhooks',
      handler: async (_request: Request, ctx?: ExtensionContext) => {
        if (!ctx) {
          return NextResponse.json({ error: 'Extension context unavailable' }, { status: 500 })
        }

        const { data, error } = await ctx.supabase
          .from('automation_webhooks')
          .select('*')
          .eq('company_id', ctx.companyId)
          .order('created_at', { ascending: false })

        if (error) {
          return NextResponse.json({ error: 'Failed to fetch webhooks' }, { status: 500 })
        }

        return NextResponse.json({ data })
      },
    },
    {
      // Delete a webhook subscription
      method: 'DELETE',
      path: '/webhooks',
      handler: async (request: Request, ctx?: ExtensionContext) => {
        if (!ctx) {
          return NextResponse.json({ error: 'Extension context unavailable' }, { status: 500 })
        }

        const { event_type } = await request.json()

        const { error } = await ctx.supabase
          .from('automation_webhooks')
          .delete()
          .eq('company_id', ctx.companyId)
          .eq('event_type', event_type)

        if (error) {
          return NextResponse.json({ error: 'Failed to delete webhook' }, { status: 500 })
        }

        return NextResponse.json({ success: true })
      },
    },
    {
      // API proxy for Activepieces piece actions.
      // Accepts API key auth (Bearer gnubok_sk_...) and proxies to internal gnubok routes.
      // Allowed paths: transactions, customers, invoices, bookkeeping/entries, reports/*
      method: 'POST',
      path: '/proxy',
      skipAuth: true,
      handler: async (request: Request) => {
        const token = extractBearerToken(request)
        if (!token) {
          return NextResponse.json({ error: 'Missing API key' }, { status: 401 })
        }

        const authResult = await validateApiKey(token)
        if ('error' in authResult) {
          return NextResponse.json({ error: authResult.error }, { status: authResult.status })
        }

        const supabase = createServiceClientNoCookies()
        const companyId = authResult.companyId

        const body = await request.json()
        const { action, params } = body as { action: string; params: Record<string, unknown> }

        try {
          switch (action) {
            case 'list_transactions': {
              const query = supabase
                .from('transactions')
                .select('*')
                .eq('company_id', companyId)
                .order('date', { ascending: false })
                .limit((params.limit as number) ?? 50)

              if (params.status) query.eq('category', params.status)
              if (params.dateFrom) query.gte('date', params.dateFrom as string)
              if (params.dateTo) query.lte('date', params.dateTo as string)

              const { data, error } = await query
              if (error) throw error
              return NextResponse.json({ data })
            }

            case 'list_customers': {
              const { data, error } = await supabase
                .from('customers')
                .select('*')
                .eq('company_id', companyId)
                .order('name')
              if (error) throw error
              return NextResponse.json({ data })
            }

            case 'get_trial_balance': {
              const { generateTrialBalance } = await import('@/lib/reports/trial-balance')
              if (!params.periodId) {
                return NextResponse.json({ error: 'periodId required' }, { status: 400 })
              }
              const result = await generateTrialBalance(supabase, companyId, params.periodId as string)
              return NextResponse.json({ data: result })
            }

            case 'get_vat_report': {
              const { calculateVatDeclaration } = await import('@/lib/reports/vat-declaration')
              const periodType = (params.periodType as string) ?? 'monthly'
              const year = params.year as number
              const period = params.period as number
              if (!year || !period) {
                return NextResponse.json({ error: 'year and period required' }, { status: 400 })
              }
              const result = await calculateVatDeclaration(
                supabase, companyId,
                periodType as 'monthly' | 'quarterly',
                year, period
              )
              return NextResponse.json({ data: result })
            }

            case 'create_journal_entry': {
              const { createJournalEntry } = await import('@/lib/bookkeeping/engine')
              const lines = (params.lines as Array<{ account: string; debit: number; credit: number }>).map(l => ({
                account_number: l.account,
                debit_amount: l.debit ?? 0,
                credit_amount: l.credit ?? 0,
              }))
              const entry = await createJournalEntry(supabase, companyId, authResult.userId, {
                description: params.description as string,
                entry_date: (params.date as string) || new Date().toISOString().split('T')[0],
                fiscal_period_id: params.fiscalPeriodId as string,
                source_type: 'manual' as const,
                lines,
              })
              return NextResponse.json({ data: entry })
            }

            case 'create_invoice': {
              const { data, error } = await supabase
                .from('invoices')
                .insert({
                  company_id: companyId,
                  customer_id: params.customerId,
                  due_date: params.dueDate,
                  items: params.items,
                  notes: params.notes ?? '',
                  status: 'draft',
                })
                .select()
                .single()
              if (error) throw error
              return NextResponse.json({ data })
            }

            case 'categorize_transaction': {
              const { data, error } = await supabase
                .from('transactions')
                .update({
                  category_account: params.account,
                  vat_treatment: params.vatRate,
                  status: 'categorized',
                })
                .eq('id', params.transactionId)
                .eq('company_id', companyId)
                .select()
                .single()
              if (error) throw error
              return NextResponse.json({ data })
            }

            default:
              return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          console.error('[automations/proxy] Action failed:', action, message)
          return NextResponse.json(
            { error: message },
            { status: 500 }
          )
        }
      },
    },
  ],

  // Forward gnubok events to Activepieces webhooks
  eventHandlers: [
    'journal_entry.committed',
    'invoice.created',
    'invoice.sent',
    'transaction.synced',
    'transaction.categorized',
    'supplier_invoice.registered',
    'supplier_invoice.paid',
    'invoice.match_confirmed',
    'receipt.matched',
    'period.locked',
  ].map(eventType => ({
    eventType: eventType as import('@/lib/events/types').CoreEventType,
    handler: async (payload: Record<string, unknown>, ctx?: ExtensionContext) => {
      if (!ctx) return
      await forwardEvent(
        ctx.supabase,
        ctx.companyId,
        eventType,
        payload,
        ctx.log
      )
    },
  })),
}
