'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { BookOpen, Search } from 'lucide-react'
import type { Transaction } from '@/types'

interface QuickBookingFormProps {
  transaction: Transaction
  onSubmit: (debitAccount: string, creditAccount: string, description: string) => void
  isLoading?: boolean
}

interface AccountOption {
  account_number: string
  account_name: string
}

const COMMON_EXPENSE_ACCOUNTS: AccountOption[] = [
  { account_number: '5010', account_name: 'Lokalhyra' },
  { account_number: '5410', account_name: 'Forbrukningsinventarier' },
  { account_number: '5420', account_name: 'Programvaror' },
  { account_number: '5460', account_name: 'Forbrukningsmaterial' },
  { account_number: '5611', account_name: 'Svensk reklam' },
  { account_number: '5800', account_name: 'Resekostnader' },
  { account_number: '5910', account_name: 'Annonsering' },
  { account_number: '6110', account_name: 'Kontorsmaterial' },
  { account_number: '6212', account_name: 'Mobiltelefon' },
  { account_number: '6230', account_name: 'Datakommunikation' },
  { account_number: '6250', account_name: 'Postforskott' },
  { account_number: '6530', account_name: 'Redovisningstjanster' },
  { account_number: '6570', account_name: 'Bankkostnader' },
  { account_number: '6590', account_name: 'Ovriga externa tjanster' },
]

const COMMON_INCOME_ACCOUNTS: AccountOption[] = [
  { account_number: '3011', account_name: 'Forsaljning tjanster, 25% moms' },
  { account_number: '3041', account_name: 'Forsaljning tjanster, momsfri' },
  { account_number: '3740', account_name: 'Offentliga bidrag' },
  { account_number: '3911', account_name: 'Hyresintakter' },
  { account_number: '3990', account_name: 'Ovriga rorelseinkomster' },
]

const BANK_ACCOUNTS: AccountOption[] = [
  { account_number: '1910', account_name: 'Kassa' },
  { account_number: '1920', account_name: 'Plusgiro' },
  { account_number: '1930', account_name: 'Foretagskonto' },
  { account_number: '1940', account_name: 'Ovriga bankkonton' },
]

export default function QuickBookingForm({
  transaction,
  onSubmit,
  isLoading,
}: QuickBookingFormProps) {
  const [debitAccount, setDebitAccount] = useState('')
  const [creditAccount, setCreditAccount] = useState('')
  const [description, setDescription] = useState(transaction.description)
  const [accountSearch, setAccountSearch] = useState('')
  const [searchResults, setSearchResults] = useState<AccountOption[]>([])
  const [searchTarget, setSearchTarget] = useState<'debit' | 'credit' | null>(null)

  const isExpense = transaction.amount < 0

  // Pre-fill bank account based on transaction direction
  useEffect(() => {
    if (isExpense) {
      setCreditAccount('1930') // Foretagskonto (expense paid from bank)
    } else {
      setDebitAccount('1930') // Income received to bank
    }
    setDescription(transaction.description)
  }, [transaction, isExpense])

  const supabase = createClient()

  async function searchAccounts(query: string) {
    if (query.length < 2) {
      setSearchResults([])
      return
    }

    const { data } = await supabase
      .from('chart_of_accounts')
      .select('account_number, account_name')
      .or(`account_number.ilike.%${query}%,account_name.ilike.%${query}%`)
      .eq('is_active', true)
      .limit(10)

    setSearchResults(data || [])
  }

  function selectAccount(account: AccountOption) {
    if (searchTarget === 'debit') {
      setDebitAccount(account.account_number)
    } else if (searchTarget === 'credit') {
      setCreditAccount(account.account_number)
    }
    setSearchTarget(null)
    setAccountSearch('')
    setSearchResults([])
  }

  function handleQuickSelect(account: AccountOption) {
    if (isExpense) {
      setDebitAccount(account.account_number)
    } else {
      setCreditAccount(account.account_number)
    }
  }

  const quickAccounts = isExpense ? COMMON_EXPENSE_ACCOUNTS : COMMON_INCOME_ACCOUNTS
  const canSubmit = debitAccount.length === 4 && creditAccount.length === 4

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <BookOpen className="h-4 w-4" />
        Bokfor direkt
      </div>

      <div className="rounded-lg bg-muted/50 p-3">
        <p className="text-sm">
          <span className="text-muted-foreground">Belopp:</span>{' '}
          <span className="font-medium">{formatCurrency(Math.abs(transaction.amount), transaction.currency)}</span>
          <span className="text-muted-foreground ml-2">({isExpense ? 'Utgift' : 'Inkomst'})</span>
        </p>
      </div>

      {/* Quick account selection */}
      <div>
        <Label className="text-xs text-muted-foreground mb-2 block">
          Vanliga konton ({isExpense ? 'kostnader' : 'intakter'})
        </Label>
        <div className="flex flex-wrap gap-1.5">
          {quickAccounts.slice(0, 8).map((account) => (
            <button
              key={account.account_number}
              onClick={() => handleQuickSelect(account)}
              className={`text-xs px-2 py-1 rounded-md border transition-colors hover:bg-primary/10 hover:border-primary/30 ${
                (isExpense ? debitAccount : creditAccount) === account.account_number
                  ? 'bg-primary/10 border-primary/30 text-primary'
                  : 'border-border'
              }`}
            >
              {account.account_number} {account.account_name}
            </button>
          ))}
        </div>
      </div>

      {/* Account inputs */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="debit" className="text-xs">
            Debet
          </Label>
          <div className="relative">
            <Input
              id="debit"
              placeholder="Konto"
              value={debitAccount}
              onChange={(e) => setDebitAccount(e.target.value.replace(/\D/g, '').slice(0, 4))}
              onFocus={() => setSearchTarget('debit')}
              maxLength={4}
              className="font-mono"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="credit" className="text-xs">
            Kredit
          </Label>
          <div className="relative">
            <Input
              id="credit"
              placeholder="Konto"
              value={creditAccount}
              onChange={(e) => setCreditAccount(e.target.value.replace(/\D/g, '').slice(0, 4))}
              onFocus={() => setSearchTarget('credit')}
              maxLength={4}
              className="font-mono"
            />
          </div>
        </div>
      </div>

      {/* Bank account quick picks */}
      <div>
        <Label className="text-xs text-muted-foreground mb-1.5 block">Bankkonto</Label>
        <div className="flex flex-wrap gap-1.5">
          {BANK_ACCOUNTS.map((account) => (
            <button
              key={account.account_number}
              onClick={() => {
                if (isExpense) {
                  setCreditAccount(account.account_number)
                } else {
                  setDebitAccount(account.account_number)
                }
              }}
              className={`text-xs px-2 py-1 rounded-md border transition-colors hover:bg-primary/10 hover:border-primary/30 ${
                (isExpense ? creditAccount : debitAccount) === account.account_number
                  ? 'bg-primary/10 border-primary/30 text-primary'
                  : 'border-border'
              }`}
            >
              {account.account_number} {account.account_name}
            </button>
          ))}
        </div>
      </div>

      {/* Account search */}
      {searchTarget && (
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Sok konto (nummer eller namn)..."
              value={accountSearch}
              onChange={(e) => {
                setAccountSearch(e.target.value)
                searchAccounts(e.target.value)
              }}
              autoFocus
              className="pl-8 h-8 text-sm"
            />
          </div>
          {searchResults.length > 0 && (
            <div className="max-h-32 overflow-y-auto border rounded-lg divide-y">
              {searchResults.map((account) => (
                <button
                  key={account.account_number}
                  onClick={() => selectAccount(account)}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors flex items-center gap-2"
                >
                  <span className="font-mono font-medium">{account.account_number}</span>
                  <span className="text-muted-foreground">{account.account_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Description */}
      <div>
        <Label htmlFor="booking-desc" className="text-xs">
          Beskrivning
        </Label>
        <Input
          id="booking-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="text-sm"
        />
      </div>

      <Button
        onClick={() => onSubmit(debitAccount, creditAccount, description)}
        disabled={!canSubmit || isLoading}
        className="w-full"
      >
        {isLoading ? 'Bokfor...' : `Bokfor ${formatCurrency(Math.abs(transaction.amount))}`}
      </Button>
    </div>
  )
}
