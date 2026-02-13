import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ContractImportWizard } from '@/components/contracts/ContractImportWizard'

export const metadata = {
  title: 'Importera avtal | Samarbeten',
  description: 'Importera och analysera avtal med AI',
}

export default async function CampaignImportPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch customers for matching
  const { data: customers } = await supabase
    .from('customers')
    .select('*')
    .eq('user_id', user.id)
    .order('name')

  return (
    <div className="container max-w-6xl py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Importera avtal</h1>
        <p className="text-muted-foreground mt-1">
          Ladda upp ett avtal och låt AI extrahera samarbetsinformation automatiskt
        </p>
      </div>

      <ContractImportWizard customers={customers || []} />
    </div>
  )
}
