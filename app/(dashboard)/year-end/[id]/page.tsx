import { ClosingWizard } from '@/components/year-end/ClosingWizard'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function YearEndClosingPage({ params }: PageProps) {
  const { id } = await params

  return (
    <div className="max-w-5xl mx-auto">
      <ClosingWizard closingId={id} />
    </div>
  )
}
