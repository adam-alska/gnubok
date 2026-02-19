'use client'

import { use } from 'react'
import { useRouter } from 'next/navigation'
import ReconciliationWorkspace from '@/components/reconciliation/ReconciliationWorkspace'

export default function ReconciliationSessionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()

  return (
    <ReconciliationWorkspace
      sessionId={id}
      onBack={() => router.push('/reconciliation')}
    />
  )
}
