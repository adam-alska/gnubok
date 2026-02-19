import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { SIEAccount } from '@/lib/import/types'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'
import { validateBody, CreateAccountsFromSIEInputSchema } from '@/lib/validation'

/**
 * Determine account type based on account class (first digit)
 */
function getAccountType(accountNumber: string): 'asset' | 'equity' | 'liability' | 'revenue' | 'expense' {
  const firstDigit = parseInt(accountNumber.charAt(0), 10)

  switch (firstDigit) {
    case 1:
      return 'asset'
    case 2:
      // 20xx-20xx is equity, 21xx-29xx is liability
      const group = parseInt(accountNumber.substring(0, 2), 10)
      return group <= 20 ? 'equity' : 'liability'
    case 3:
      return 'revenue'
    case 4:
    case 5:
    case 6:
    case 7:
      return 'expense'
    case 8:
      // 8xxx can be either revenue (83xx interest income) or expense
      const subGroup = parseInt(accountNumber.substring(0, 2), 10)
      return subGroup >= 83 && subGroup <= 84 ? 'revenue' : 'expense'
    default:
      return 'expense'
  }
}

/**
 * Determine normal balance based on account type
 */
function getNormalBalance(accountType: string): 'debit' | 'credit' {
  switch (accountType) {
    case 'asset':
    case 'expense':
      return 'debit'
    case 'equity':
    case 'liability':
    case 'revenue':
      return 'credit'
    default:
      return 'debit'
  }
}

/**
 * POST /api/import/sie/create-accounts
 * Create missing accounts from SIE file definitions
 */
export async function POST(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success, remaining, reset } = apiLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  try {
    const raw = await request.json()
    const validation = validateBody(CreateAccountsFromSIEInputSchema, raw)
    if (!validation.success) return validation.response
    const accounts = validation.data.accounts as unknown as SIEAccount[]

    // Fetch existing accounts to avoid duplicates
    const { data: existingAccounts } = await supabase
      .from('chart_of_accounts')
      .select('account_number')
      .eq('user_id', user.id)

    const existingNumbers = new Set(existingAccounts?.map(a => a.account_number) || [])

    // Filter to only accounts that don't exist
    const newAccounts = accounts.filter(a => !existingNumbers.has(a.number))

    if (newAccounts.length === 0) {
      return NextResponse.json({
        success: true,
        created: 0,
        message: 'All accounts already exist'
      })
    }

    // Prepare accounts for insertion
    const accountsToInsert = newAccounts.map(account => {
      const accountClass = parseInt(account.number.charAt(0), 10) || 1
      const accountGroup = account.number.substring(0, 2)
      const accountType = getAccountType(account.number)
      const normalBalance = getNormalBalance(accountType)

      return {
        user_id: user.id,
        account_number: account.number,
        account_name: account.name,
        account_class: accountClass,
        account_group: accountGroup,
        account_type: accountType,
        normal_balance: normalBalance,
        plan_type: 'full_bas',
        is_active: true,
        is_system_account: false, // User-created via import
        sort_order: parseInt(account.number, 10) || 0,
      }
    })

    // Insert in batches of 100 to avoid timeout
    const batchSize = 100
    let totalCreated = 0

    for (let i = 0; i < accountsToInsert.length; i += batchSize) {
      const batch = accountsToInsert.slice(i, i + batchSize)

      const { error } = await supabase
        .from('chart_of_accounts')
        .insert(batch)

      if (error) {
        console.error('Error inserting accounts batch:', error)
        return NextResponse.json({
          error: `Failed to create accounts: ${error.message}`,
          created: totalCreated,
        }, { status: 500 })
      }

      totalCreated += batch.length
    }

    return NextResponse.json({
      success: true,
      created: totalCreated,
      message: `Created ${totalCreated} new accounts`,
    })

  } catch (error) {
    console.error('Create accounts error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create accounts' },
      { status: 500 }
    )
  }
}
