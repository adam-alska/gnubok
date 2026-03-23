import type { KPIPreferences } from '@/types'

export interface KPIDefinition {
  id: string
  label: string
  subtitle: string
  description: string
  formula: string
  defaultAccounts: string[]
  accountDescription: string
  customizableAccounts: boolean
  defaultVisible: boolean
  format: 'currency' | 'percentage' | 'days'
  colorLogic: 'positive-good' | 'negative-good' | 'neutral'
}

export const KPI_DEFINITIONS: KPIDefinition[] = [
  {
    id: 'netResult',
    label: 'Resultat',
    subtitle: 'netto',
    description: 'Nettoresultat för perioden (intäkter minus kostnader)',
    formula: 'Totala intäkter − Totala kostnader ± Finansiella poster',
    defaultAccounts: [],
    accountDescription: 'Intäkter (klass 3), Kostnader (klass 4–7), Finansiellt (klass 8)',
    customizableAccounts: false,
    defaultVisible: true,
    format: 'currency',
    colorLogic: 'positive-good',
  },
  {
    id: 'cashPosition',
    label: 'Kassa',
    subtitle: 'likvida medel',
    description: 'Totala likvida medel (bank- och kassakonton)',
    formula: 'Summa utgående saldon för valda 19xx-konton',
    defaultAccounts: ['1910', '1920', '1930', '1940', '1950', '1960', '1970', '1980'],
    accountDescription: 'Bank- och kassakonton (19xx)',
    customizableAccounts: true,
    defaultVisible: true,
    format: 'currency',
    colorLogic: 'positive-good',
  },
  {
    id: 'outstandingReceivables',
    label: 'Kundfordringar',
    subtitle: 'utestående',
    description: 'Utestående kundfordringar',
    formula: 'Summa obetalda kundfakturor',
    defaultAccounts: ['1510'],
    accountDescription: 'Kundfordringar (1510)',
    customizableAccounts: false,
    defaultVisible: true,
    format: 'currency',
    colorLogic: 'neutral',
  },
  {
    id: 'vatLiability',
    label: 'Moms',
    subtitle: '',
    description: 'Momsskuld eller momsfordran för perioden',
    formula: 'Utgående moms (2611 + 2621 + 2631) − Ingående moms (2641 + 2645)',
    defaultAccounts: ['2611', '2621', '2631', '2641', '2645'],
    accountDescription: 'Utgående moms (2611, 2621, 2631), Ingående moms (2641, 2645)',
    customizableAccounts: true,
    defaultVisible: true,
    format: 'currency',
    colorLogic: 'negative-good',
  },
  {
    id: 'grossMargin',
    label: 'Bruttomarginal',
    subtitle: 'av intäkter',
    description: 'Andel av intäkterna som blir kvar efter varuinköp',
    formula: '(Intäkter − Varukostnad klass 4) ÷ Intäkter × 100',
    defaultAccounts: [],
    accountDescription: 'Intäkter (klass 3), Varor och material (klass 4)',
    customizableAccounts: false,
    defaultVisible: false,
    format: 'percentage',
    colorLogic: 'positive-good',
  },
  {
    id: 'expenseRatio',
    label: 'Kostnadsandel',
    subtitle: 'av intäkter',
    description: 'Andel av intäkterna som går till kostnader',
    formula: 'Totala kostnader ÷ Totala intäkter × 100',
    defaultAccounts: [],
    accountDescription: 'Intäkter (klass 3), Kostnader (klass 4–7)',
    customizableAccounts: false,
    defaultVisible: false,
    format: 'percentage',
    colorLogic: 'negative-good',
  },
  {
    id: 'avgPaymentDays',
    label: 'Betalningstid',
    subtitle: 'snitt',
    description: 'Genomsnittligt antal dagar till kundbetalning',
    formula: 'Summa betaldagar ÷ Antal betalda fakturor (minst 5 krävs)',
    defaultAccounts: [],
    accountDescription: 'Beräknas från betalda kundfakturor, inte konton',
    customizableAccounts: false,
    defaultVisible: false,
    format: 'days',
    colorLogic: 'negative-good',
  },
]

export const ALL_KPI_IDS = KPI_DEFINITIONS.map((d) => d.id)

export function getKPIDefinition(id: string): KPIDefinition | undefined {
  return KPI_DEFINITIONS.find((d) => d.id === id)
}

export function getDefaultPreferences(): KPIPreferences {
  return {
    visibleKpis: KPI_DEFINITIONS.filter((d) => d.defaultVisible).map((d) => d.id),
    kpiOrder: ALL_KPI_IDS,
    accountOverrides: {},
  }
}

export function mergeWithDefaults(prefs: Partial<KPIPreferences>): KPIPreferences {
  const defaults = getDefaultPreferences()
  return {
    visibleKpis: prefs.visibleKpis ?? defaults.visibleKpis,
    kpiOrder: prefs.kpiOrder ?? defaults.kpiOrder,
    accountOverrides: prefs.accountOverrides ?? defaults.accountOverrides,
  }
}
