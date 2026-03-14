'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import JournalEntryList from '@/components/bookkeeping/JournalEntryList'
import JournalEntryForm from '@/components/bookkeeping/JournalEntryForm'
import ChartOfAccountsManager from '@/components/bookkeeping/ChartOfAccountsManager'
import { Lock } from 'lucide-react'

export default function BookkeepingPage() {
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-medium tracking-tight">Bokföring</h1>
          <p className="text-muted-foreground">
            Verifikationer, kontoplan och manuella bokföringsorder
          </p>
        </div>
        <Button variant="outline" asChild className="w-full sm:w-auto">
          <Link href="/bookkeeping/year-end">
            <Lock className="mr-2 h-4 w-4" />
            Årsbokslut
          </Link>
        </Button>
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
          <ChartOfAccountsManager />
        </TabsContent>
      </Tabs>
    </div>
  )
}
