import type { Sector, SectorSlug, ExtensionDefinition } from './types'

// ============================================================
// Sector & Extension Registry
// ============================================================
//
// Pure data file. No React, no database calls.
// All sector and extension metadata lives here.
// ============================================================

export const SECTORS: Sector[] = [
  // ── General ──────────────────────────────────────────────
  {
    slug: 'general',
    name: 'Generella verktyg',
    icon: 'Layers',
    description: 'Verktyg som passar alla verksamheter',
    extensions: [
      {
        slug: 'receipt-ocr',
        name: 'Kvittoscanning',
        sector: 'general',
        category: 'import',
        icon: 'Camera',
        dataPattern: 'manual',
        hasOwnData: true,
        description: 'Skanna kvitton och extrahera data automatiskt',
        longDescription:
          'Ladda upp kvittofoton och låt systemet automatiskt extrahera leverantör, belopp, moms och datum. Sparar tid och minskar manuell inmatning.',
      },
      {
        slug: 'ai-categorization',
        name: 'AI-kategorisering',
        sector: 'general',
        category: 'operations',
        icon: 'Sparkles',
        dataPattern: 'core',
        readsCoreTables: ['transactions'],
        description: 'AI-drivna kategoriförslag för transaktioner',
        longDescription:
          'Använder AI för att automatiskt föreslå BAS-kontokategorier för dina banktransaktioner. Lär sig från dina tidigare bokföringsval.',
      },
      {
        slug: 'ai-chat',
        name: 'AI-assistent',
        sector: 'general',
        category: 'operations',
        icon: 'MessageSquare',
        dataPattern: 'manual',
        hasOwnData: true,
        description: 'AI-assistent för skatte- och bokföringsfrågor',
        longDescription:
          'Ställ frågor om skatt, bokföring och företagande till en AI-assistent som förstår svensk redovisning. Svar baserade på aktuella regler och praxis.',
        quickAction: {
          label: 'AI-assistent',
          description: 'Fråga om bokföring',
          icon: 'MessageSquare',
          event: 'open-ai-chat',
        },
      },
      {
        slug: 'push-notifications',
        name: 'Push-notiser',
        sector: 'general',
        category: 'operations',
        icon: 'Bell',
        dataPattern: 'core',
        readsCoreTables: ['journal_entries', 'invoices', 'receipts'],
        description: 'Händelsenotiser för bokföringsaktiviteter',
        longDescription:
          'Få push-notiser direkt i webbläsaren när viktiga händelser sker — nya fakturor, förfallna betalningar, slutförda bokföringar med mera.',
      },
      {
        slug: 'invoice-inbox',
        name: 'Leverantörsfaktura-inbox',
        sector: 'general',
        category: 'import',
        icon: 'Inbox',
        dataPattern: 'manual',
        hasOwnData: true,
        description: 'Ta emot leverantörsfakturor via e-post eller uppladdning',
        longDescription:
          'Skicka leverantörsfakturor till en dedikerad e-postadress eller ladda upp manuellt. AI extraherar automatiskt leverantörsdata, belopp och moms. Granska och bekräfta med ett klick för att skapa leverantörsfakturor.',
      },
      {
        slug: 'calendar',
        name: 'Kalender',
        sector: 'general',
        category: 'operations',
        icon: 'Calendar',
        dataPattern: 'core',
        readsCoreTables: ['invoices', 'deadlines', 'customers'],
        description: 'Fullstandig kalendervy med manads-, vecko- och dagsvisning',
        longDescription:
          'Se alla fakturadatum och deadlines i en interaktiv kalender med manads-, vecko- och dagsvy.',
      },
      {
        slug: 'user-description-match',
        name: 'Beskrivningsmatchning',
        sector: 'general',
        category: 'operations',
        icon: 'TextSearch',
        dataPattern: 'core',
        readsCoreTables: ['transactions', 'mapping_rules'],
        description: 'Matcha transaktioner med egna beskrivningar',
        longDescription:
          'Beskriv vad en transaktion gäller med egna ord och få smarta bokföringsförslag. Systemet lär sig av dina beskrivningar och applicerar automatiskt på framtida transaktioner från samma leverantör.',
      },
      {
        slug: 'enable-banking',
        name: 'Bankintegration (PSD2)',
        sector: 'general',
        category: 'import',
        icon: 'Landmark',
        dataPattern: 'manual',
        hasOwnData: true,
        description: 'Automatisk banktransaktionssynk via PSD2',
        longDescription:
          'Koppla ditt bankkonto direkt och synka transaktioner automatiskt via säker PSD2-bankintegration. Stöder de flesta svenska banker.',
      },
    ],
  },

  // ── Restaurant ───────────────────────────────────────────
  {
    slug: 'restaurant',
    name: 'Restaurang & Café',
    icon: 'UtensilsCrossed',
    description: 'Branschverktyg för restauranger och caféverksamhet',
    extensions: [
      {
        slug: 'food-cost',
        name: 'Food Cost %',
        sector: 'restaurant',
        category: 'reports',
        icon: 'ChefHat',
        dataPattern: 'core',
        readsCoreTables: ['journal_entry_lines'],
        description: 'Beräkna råvarukostnad i procent av omsättning',
        longDescription:
          'Beräkna och följ upp din råvarukostnadsprocent (food cost) automatiskt utifrån bokföringen. Jämför inköpskonton (4000-serien) mot livsmedelsomsättning (3000-serien) och se trender över tid.',
      },
      {
        slug: 'earnings-per-liter',
        name: 'Intäkt per liter alkohol',
        sector: 'restaurant',
        category: 'reports',
        icon: 'Wine',
        dataPattern: 'both',
        readsCoreTables: ['journal_entry_lines'],
        hasOwnData: true,
        description: 'Beräkna intäkt per såld liter alkohol',
        longDescription:
          'Kombinerar alkoholintäkter från bokföringen med manuellt inmatade literuppgifter för att räkna ut intäkt per liter. Följ trender och optimera ditt sortiment.',
      },
      {
        slug: 'pos-import',
        name: 'Kassa Z-rapport Import',
        sector: 'restaurant',
        category: 'import',
        icon: 'FileSpreadsheet',
        dataPattern: 'manual',
        hasOwnData: true,
        description: 'Importera Z-rapporter från kassasystem',
        longDescription:
          'Importera dagliga Z-rapporter från ditt kassasystem (CSV/Excel). Se daglig försäljningsstatistik, betalsättsfördelning och trender.',
      },
      {
        slug: 'tip-tracking',
        name: 'Dricksuppföljning',
        sector: 'restaurant',
        category: 'operations',
        icon: 'HandCoins',
        dataPattern: 'both',
        readsCoreTables: ['journal_entry_lines'],
        hasOwnData: true,
        description: 'Spåra dricks per skift och anställd',
        longDescription:
          'Registrera dricks per skift och anställd. Se totaler, snitt per anställd och dricks som andel av omsättningen.',
      },
    ],
  },

  // ── Construction ─────────────────────────────────────────
  {
    slug: 'construction',
    name: 'Bygg & Anläggning',
    icon: 'HardHat',
    description: 'Branschverktyg för byggföretag och hantverkare',
    extensions: [
      {
        slug: 'rot-calculator',
        name: 'ROT-kalkylator',
        sector: 'construction',
        category: 'accounting',
        icon: 'Calculator',
        dataPattern: 'both',
        readsCoreTables: ['invoices'],
        hasOwnData: true,
        description: 'Beräkna ROT-avdrag per kund och jobb',
        longDescription:
          'Beräkna ROT-avdrag (30% av arbetskostnad, max 50 000 kr/år per kund). Håll koll på utnyttjad kvot per kund och undvik att överskrida maxbeloppet.',
      },
      {
        slug: 'project-cost',
        name: 'Projektkostnad',
        sector: 'construction',
        category: 'reports',
        icon: 'FolderKanban',
        dataPattern: 'both',
        readsCoreTables: ['journal_entry_lines', 'invoices'],
        hasOwnData: true,
        description: 'Följ upp kostnader och intäkter per byggprojekt',
        longDescription:
          'Samla alla kostnader och intäkter för varje byggprojekt. Se marginaler, jämför budget mot utfall och identifiera olönsamma projekt.',
      },
    ],
  },

  // ── Hotel ────────────────────────────────────────────────
  {
    slug: 'hotel',
    name: 'Hotell & Logi',
    icon: 'Hotel',
    description: 'Branschverktyg för hotell och logi',
    extensions: [
      {
        slug: 'revpar',
        name: 'RevPAR',
        sector: 'hotel',
        category: 'reports',
        icon: 'TrendingUp',
        dataPattern: 'both',
        readsCoreTables: ['journal_entry_lines'],
        hasOwnData: true,
        description: 'Revenue Per Available Room',
        longDescription:
          'Beräkna Revenue Per Available Room (RevPAR) — det viktigaste nyckeltalet inom hotellbranschen. Kombinerar beläggningsgrad och snittpris per rum.',
      },
      {
        slug: 'occupancy',
        name: 'Beläggningsgrad',
        sector: 'hotel',
        category: 'reports',
        icon: 'BedDouble',
        dataPattern: 'manual',
        hasOwnData: true,
        description: 'Spåra beläggning och rumsstatus',
        longDescription:
          'Registrera daglig beläggning, tillgängliga rum och belagda rum. Se beläggningsgrad över tid och identifiera säsongsmönster.',
      },
    ],
  },

  // ── Tech ─────────────────────────────────────────────────
  {
    slug: 'tech',
    name: 'IT & Konsulting',
    icon: 'Monitor',
    description: 'Branschverktyg för IT-konsulter och teknikföretag',
    extensions: [
      {
        slug: 'billable-hours',
        name: 'Debiterbar tid',
        sector: 'tech',
        category: 'reports',
        icon: 'Clock',
        dataPattern: 'both',
        readsCoreTables: ['invoices'],
        hasOwnData: true,
        description: 'Följ debiteringsgrad och effektiv timtaxa',
        longDescription:
          'Registrera arbetade timmar per projekt och beräkna debiteringsgrad (debiterbar/total tid). Se effektiv timtaxa och optimera din tidsanvändning.',
      },
      {
        slug: 'project-billing',
        name: 'Projektfakturering',
        sector: 'tech',
        category: 'reports',
        icon: 'ReceiptText',
        dataPattern: 'both',
        readsCoreTables: ['invoices', 'journal_entry_lines'],
        hasOwnData: true,
        description: 'Fakturerade belopp per projekt och kund',
        longDescription:
          'Följ fakturerade belopp per projekt och kund. Jämför mot budget, se olönsamma projekt och identifiera dina mest lönsamma kunder.',
      },
    ],
  },

  // ── E-commerce ───────────────────────────────────────────
  {
    slug: 'ecommerce',
    name: 'E-handel',
    icon: 'ShoppingCart',
    description: 'Branschverktyg för nätbutiker och e-handel',
    extensions: [
      {
        slug: 'shopify-import',
        name: 'Shopify-import',
        sector: 'ecommerce',
        category: 'import',
        icon: 'Store',
        dataPattern: 'manual',
        hasOwnData: true,
        description: 'Importera ordrar från Shopify',
        longDescription:
          'Importera orderdata från Shopify-export (CSV). Se intäkter per produkt, ordertrender och genomsnittligt ordervärde.',
      },
      {
        slug: 'multichannel-revenue',
        name: 'Flerkanalsintäkter',
        sector: 'ecommerce',
        category: 'reports',
        icon: 'BarChart3',
        dataPattern: 'both',
        readsCoreTables: ['journal_entry_lines'],
        hasOwnData: true,
        description: 'Intäktsanalys per försäljningskanal',
        longDescription:
          'Analysera intäkter fördelat på försäljningskanaler — webshop, marknadsplatser, fysisk butik. Identifiera dina mest lönsamma kanaler.',
      },
    ],
  },
]

// ============================================================
// Helper functions
// ============================================================

export function getSector(slug: SectorSlug): Sector | undefined {
  return SECTORS.find(s => s.slug === slug)
}

export function getExtensionDefinition(sectorSlug: string, extensionSlug: string): ExtensionDefinition | undefined {
  const sector = SECTORS.find(s => s.slug === sectorSlug)
  return sector?.extensions.find(e => e.slug === extensionSlug)
}

export function getAllExtensions(): ExtensionDefinition[] {
  return SECTORS.flatMap(s => s.extensions)
}

export function getExtensionsBySector(slug: SectorSlug): ExtensionDefinition[] {
  return getSector(slug)?.extensions ?? []
}
