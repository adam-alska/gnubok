import type { Extension, ExtensionContext } from '@/lib/extensions/types'
import { NextResponse } from 'next/server'
import {
  generateFullArchive,
  estimateArchiveSize,
  type ArchiveScope,
} from '@/lib/reports/full-archive-export'
import {
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  fetchUserEmail,
  getOAuthEnv,
  refreshAccessToken,
  revokeToken,
} from './lib/google-oauth'
import { ensureFolder, uploadFile } from './lib/google-drive'
import {
  createOAuthState,
  decryptToken,
  encryptToken,
  verifyOAuthState,
} from './lib/crypto'
import type {
  CloudBackupStatus,
  GoogleDriveConnection,
  GoogleDriveLastSync,
} from './types'

const CONNECTION_KEY = 'google_drive_connection'
const LAST_SYNC_KEY = 'google_drive_last_sync'
const ROOT_FOLDER_NAME = 'gnubok'
const SIZE_LIMIT_BYTES = 80 * 1024 * 1024

function jsonError(message: string, status = 500): Response {
  return NextResponse.json({ error: message }, { status })
}

async function loadConnection(
  ctx: ExtensionContext
): Promise<GoogleDriveConnection | null> {
  return ctx.settings.get<GoogleDriveConnection>(CONNECTION_KEY)
}

async function getFreshAccessToken(
  ctx: ExtensionContext,
  connection: GoogleDriveConnection
): Promise<string> {
  const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const env = getOAuthEnv(origin)
  const refreshToken = decryptToken(connection.refresh_token_encrypted)
  const { access_token } = await refreshAccessToken(env, refreshToken)
  return access_token
}

async function fetchCompanyName(ctx: ExtensionContext): Promise<string> {
  const { data } = await ctx.supabase
    .from('company_settings')
    .select('company_name, org_number')
    .eq('company_id', ctx.companyId)
    .single()
  const name = (data?.company_name as string) || 'företag'
  const org = (data?.org_number as string) || ctx.companyId.slice(0, 8)
  return `${name} (${org})`.replace(/[\\/]/g, '-')
}

export const cloudBackupExtension: Extension = {
  id: 'cloud-backup',
  name: 'Molnsynkronisering',
  version: '1.0.0',
  sector: 'general',

  settingsPanel: {
    label: 'Molnsynkronisering',
    path: '/settings/backup',
  },

  apiRoutes: [
    // Kick off OAuth: return the Google consent URL.
    {
      method: 'POST',
      path: '/connect',
      handler: async (request, ctx) => {
        if (!ctx) return jsonError('Missing context', 500)
        try {
          const origin = new URL(request.url).origin
          const env = getOAuthEnv(origin)
          const state = createOAuthState(ctx.userId, ctx.companyId)
          const url = buildAuthorizationUrl(env, state)
          return NextResponse.json({ url })
        } catch (err) {
          ctx.log.error('connect failed', err)
          return jsonError(
            err instanceof Error ? err.message : 'Could not start OAuth',
            500
          )
        }
      },
    },

    // Google redirects here after the user consents.
    {
      method: 'GET',
      path: '/oauth/callback',
      handler: async (request, ctx) => {
        if (!ctx) return jsonError('Missing context', 500)
        const url = new URL(request.url)
        const code = url.searchParams.get('code')
        const state = url.searchParams.get('state')
        const errorParam = url.searchParams.get('error')
        const origin = url.origin
        const redirect = (status: string, reason?: string) => {
          const target = new URL('/settings/backup', origin)
          target.searchParams.set('cloud_backup', status)
          if (reason) target.searchParams.set('reason', reason)
          return NextResponse.redirect(target)
        }

        if (errorParam) {
          return redirect('error', errorParam)
        }
        if (!code || !state) {
          return redirect('error', 'missing_params')
        }

        const verified = verifyOAuthState(state)
        if (!verified) {
          return redirect('error', 'invalid_state')
        }
        if (verified.userId !== ctx.userId || verified.companyId !== ctx.companyId) {
          return redirect('error', 'state_mismatch')
        }

        try {
          const env = getOAuthEnv(origin)
          const tokens = await exchangeCodeForTokens(env, code)
          const email = await fetchUserEmail(tokens.access_token)

          const connection: GoogleDriveConnection = {
            refresh_token_encrypted: encryptToken(tokens.refresh_token),
            account_email: email,
            connected_at: new Date().toISOString(),
            root_folder_id: null,
            company_folder_id: null,
          }
          await ctx.settings.set(CONNECTION_KEY, connection)
          return redirect('connected')
        } catch (err) {
          ctx.log.error('oauth callback failed', err)
          return redirect(
            'error',
            err instanceof Error ? err.message.slice(0, 80) : 'exchange_failed'
          )
        }
      },
    },

    // Revoke the refresh token and clear the stored connection.
    {
      method: 'POST',
      path: '/disconnect',
      handler: async (_request, ctx) => {
        if (!ctx) return jsonError('Missing context', 500)
        try {
          const connection = await loadConnection(ctx)
          if (connection) {
            try {
              const refreshToken = decryptToken(connection.refresh_token_encrypted)
              await revokeToken(refreshToken)
            } catch (err) {
              ctx.log.warn('token revoke failed (continuing)', err)
            }
          }
          await ctx.settings.set(CONNECTION_KEY, null)
          await ctx.settings.set(LAST_SYNC_KEY, null)
          return NextResponse.json({ ok: true })
        } catch (err) {
          ctx.log.error('disconnect failed', err)
          return jsonError(
            err instanceof Error ? err.message : 'Disconnect failed',
            500
          )
        }
      },
    },

    // Read-only status used by the UI to show connected/last-sync info.
    {
      method: 'GET',
      path: '/status',
      handler: async (_request, ctx) => {
        if (!ctx) return jsonError('Missing context', 500)
        const connection = await loadConnection(ctx)
        const lastSync = await ctx.settings.get<GoogleDriveLastSync>(LAST_SYNC_KEY)
        const status: CloudBackupStatus = {
          connected: !!connection,
          account_email: connection?.account_email ?? null,
          connected_at: connection?.connected_at ?? null,
          last_sync: lastSync ?? null,
        }
        return NextResponse.json({ data: status })
      },
    },

    // Generate an archive and upload it to Drive. Returns the Drive file info.
    {
      method: 'POST',
      path: '/sync',
      handler: async (request, ctx) => {
        if (!ctx) return jsonError('Missing context', 500)
        try {
          const connection = await loadConnection(ctx)
          if (!connection) {
            return jsonError('not_connected', 400)
          }

          const body = (await request.json().catch(() => ({}))) as {
            include_documents?: boolean
          }
          const scope: ArchiveScope = 'all'
          const includeDocuments = body.include_documents !== false

          const estimate = await estimateArchiveSize(ctx.supabase, ctx.companyId, scope)
          if (includeDocuments && estimate.total_bytes > SIZE_LIMIT_BYTES) {
            return NextResponse.json(
              {
                error: 'archive_too_large',
                size_bytes: estimate.total_bytes,
                size_limit_bytes: SIZE_LIMIT_BYTES,
              },
              { status: 413 }
            )
          }

          const accessToken = await getFreshAccessToken(ctx, connection)

          // Ensure folder structure. Persist ids on first sync so later runs skip the lookup.
          let rootFolderId = connection.root_folder_id
          let companyFolderId = connection.company_folder_id
          if (!rootFolderId) {
            const root = await ensureFolder(accessToken, ROOT_FOLDER_NAME, null)
            rootFolderId = root.id
          }
          if (!companyFolderId) {
            const companyName = await fetchCompanyName(ctx)
            const companyFolder = await ensureFolder(
              accessToken,
              companyName,
              rootFolderId
            )
            companyFolderId = companyFolder.id
          }
          if (
            rootFolderId !== connection.root_folder_id ||
            companyFolderId !== connection.company_folder_id
          ) {
            await ctx.settings.set(CONNECTION_KEY, {
              ...connection,
              root_folder_id: rootFolderId,
              company_folder_id: companyFolderId,
            })
          }

          const archive = await generateFullArchive(ctx.supabase, ctx.companyId, {
            scope: 'all',
            include_documents: includeDocuments,
          })

          const stamp = new Date()
            .toISOString()
            .replace(/[-:]/g, '')
            .replace(/\..+/, '')
          const fileName = `arkiv_full_${stamp}.zip`

          const uploaded = await uploadFile(
            accessToken,
            companyFolderId,
            fileName,
            archive
          )

          const lastSync: GoogleDriveLastSync = {
            at: new Date().toISOString(),
            file_id: uploaded.id,
            file_name: uploaded.name,
            file_size_bytes: uploaded.size_bytes,
            folder_id: companyFolderId,
          }
          await ctx.settings.set(LAST_SYNC_KEY, lastSync)

          return NextResponse.json({
            data: {
              ...lastSync,
              web_view_link: uploaded.web_view_link,
            },
          })
        } catch (err) {
          ctx.log.error('sync failed', err)
          return jsonError(
            err instanceof Error ? err.message : 'Sync failed',
            500
          )
        }
      },
    },
  ],
}
