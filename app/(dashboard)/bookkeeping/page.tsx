'use client'

import { useState } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import JournalEntryList from '@/components/bookkeeping/JournalEntryList'
import JournalEntryForm from '@/components/bookkeeping/JournalEntryForm'
import ChartOfAccounts from '@/components/bookkeeping/ChartOfAccounts'

export default function BookkeepingPage() {
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Bokföring</h1>
        <p className="text-muted-foreground">
          Verifikationer, kontoplan och manuella bokföringsorder
        </p>
      </div>

      <Tabs defaultValue="journal">
        <TabsList>
          <TabsTrigger value="journal">Verifikationer</TabsTrigger>
          <TabsTrigger value="new-entry">Ny verifikation</TabsTrigger>
          <TabsTrigger value="accounts">Kontoplan</TabsTrigger>
        </TabsList>

        <TabsContent value="journal">
          <JournalEntryList key={refreshKey} />
        </TabsContent>

        <TabsContent value="new-entry">
          <JournalEntryForm onCreated={() => setRefreshKey((k) => k + 1)} />
        </TabsContent>

        <TabsContent value="accounts">
          <ChartOfAccounts />
        </TabsContent>
      </Tabs>
    </div>
  )
}
