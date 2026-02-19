import type { SectorQuestionSet } from '@/types/onboarding'

/**
 * Business questions for the top 10 most common sectors.
 * These questions drive the module recommendation engine.
 */
export const sectorQuestions: SectorQuestionSet[] = [
  // ─── Restaurang & Cafe ───────────────────────────────────────────────
  {
    sectorSlug: 'restaurang',
    sectorName: 'Restaurang & Café',
    questions: [
      {
        id: 'restaurang-alkohol',
        question: 'Serverar ni alkohol (har alkoholtillstånd)?',
        type: 'boolean',
        sectorSlug: 'restaurang',
        profileKey: 'har_alkoholtillstand',
      },
      {
        id: 'restaurang-kassasystem',
        question: 'Vilket kassasystem använder ni?',
        type: 'select',
        options: [
          { value: 'izettle', label: 'iZettle / Zettle' },
          { value: 'square', label: 'Square' },
          { value: 'orderbird', label: 'Orderbird' },
          { value: 'trivec', label: 'Trivec' },
          { value: 'annat', label: 'Annat kassasystem' },
          { value: 'inget', label: 'Inget kassasystem' },
        ],
        sectorSlug: 'restaurang',
        profileKey: 'kassasystem',
      },
      {
        id: 'restaurang-anstallda',
        question: 'Har ni anställda?',
        type: 'boolean',
        sectorSlug: 'restaurang',
        profileKey: 'har_anstallda',
      },
      {
        id: 'restaurang-catering',
        question: 'Erbjuder ni catering eller take-away?',
        type: 'boolean',
        sectorSlug: 'restaurang',
        profileKey: 'har_catering',
      },
      {
        id: 'restaurang-bordsbokning',
        question: 'Tar ni emot bordsreservationer?',
        type: 'boolean',
        sectorSlug: 'restaurang',
        profileKey: 'har_bordsbokning',
      },
    ],
  },

  // ─── Bygg & Entreprenad ──────────────────────────────────────────────
  {
    sectorSlug: 'bygg',
    sectorName: 'Bygg & Entreprenad',
    questions: [
      {
        id: 'bygg-rot',
        question: 'Utför ni arbeten som ger ROT-avdrag?',
        type: 'boolean',
        sectorSlug: 'bygg',
        profileKey: 'har_rot_avdrag',
      },
      {
        id: 'bygg-ue',
        question: 'Anlitar ni underentreprenörer?',
        type: 'boolean',
        sectorSlug: 'bygg',
        profileKey: 'har_underentreprenorer',
      },
      {
        id: 'bygg-projektbaserat',
        question: 'Arbetar ni projektbaserat med separata kalkyler?',
        type: 'boolean',
        sectorSlug: 'bygg',
        profileKey: 'projektbaserat',
      },
      {
        id: 'bygg-anstallda',
        question: 'Har ni anställda?',
        type: 'boolean',
        sectorSlug: 'bygg',
        profileKey: 'har_anstallda',
      },
      {
        id: 'bygg-ata',
        question: 'Hanterar ni ÄTA-arbeten (ändringar, tillägg, avgående)?',
        type: 'boolean',
        sectorSlug: 'bygg',
        profileKey: 'har_ata',
      },
    ],
  },

  // ─── E-handel ────────────────────────────────────────────────────────
  {
    sectorSlug: 'ehandel',
    sectorName: 'E-handel',
    questions: [
      {
        id: 'ehandel-plattform',
        question: 'Vilken e-handelsplattform använder ni?',
        type: 'select',
        options: [
          { value: 'shopify', label: 'Shopify' },
          { value: 'woocommerce', label: 'WooCommerce' },
          { value: 'magento', label: 'Magento' },
          { value: 'egen', label: 'Egenutvecklad' },
          { value: 'annat', label: 'Annat' },
        ],
        sectorSlug: 'ehandel',
        profileKey: 'ehandels_plattform',
      },
      {
        id: 'ehandel-eu',
        question: 'Säljer ni till kunder inom EU (utanför Sverige)?',
        type: 'boolean',
        sectorSlug: 'ehandel',
        profileKey: 'eu_forsaljning',
      },
      {
        id: 'ehandel-returer',
        question: 'Hanterar ni returer regelbundet?',
        type: 'boolean',
        sectorSlug: 'ehandel',
        profileKey: 'hanterar_returer',
      },
      {
        id: 'ehandel-dropshipping',
        question: 'Använder ni dropshipping?',
        type: 'boolean',
        sectorSlug: 'ehandel',
        profileKey: 'dropshipping',
      },
      {
        id: 'ehandel-betalning',
        question: 'Vilka betalsätt erbjuder ni?',
        type: 'multi_select',
        options: [
          { value: 'klarna', label: 'Klarna' },
          { value: 'stripe', label: 'Stripe' },
          { value: 'swish', label: 'Swish' },
          { value: 'paypal', label: 'PayPal' },
          { value: 'kort', label: 'Kortbetalning' },
        ],
        sectorSlug: 'ehandel',
        profileKey: 'betalsatt',
      },
    ],
  },

  // ─── Tech & IT ───────────────────────────────────────────────────────
  {
    sectorSlug: 'tech',
    sectorName: 'Tech & IT',
    questions: [
      {
        id: 'tech-saas',
        question: 'Driver ni en SaaS-tjänst med löpande abonnemang?',
        type: 'boolean',
        sectorSlug: 'tech',
        profileKey: 'har_saas',
      },
      {
        id: 'tech-konsult',
        question: 'Bedriver ni konsultverksamhet?',
        type: 'boolean',
        sectorSlug: 'tech',
        profileKey: 'har_konsultverksamhet',
      },
      {
        id: 'tech-fou',
        question: 'Bedriver ni forskning och utveckling (FoU)?',
        type: 'boolean',
        sectorSlug: 'tech',
        profileKey: 'har_fou',
      },
      {
        id: 'tech-eu',
        question: 'Säljer ni tjänster till andra EU-länder?',
        type: 'boolean',
        sectorSlug: 'tech',
        profileKey: 'eu_forsaljning',
      },
    ],
  },

  // ─── Detaljhandel ────────────────────────────────────────────────────
  {
    sectorSlug: 'detaljhandel',
    sectorName: 'Detaljhandel',
    questions: [
      {
        id: 'detaljhandel-kassa',
        question: 'Vilket kassasystem använder ni?',
        type: 'select',
        options: [
          { value: 'izettle', label: 'iZettle / Zettle' },
          { value: 'sitoo', label: 'Sitoo' },
          { value: 'caspeco', label: 'Caspeco' },
          { value: 'annat', label: 'Annat kassasystem' },
          { value: 'inget', label: 'Inget kassasystem' },
        ],
        sectorSlug: 'detaljhandel',
        profileKey: 'kassasystem',
      },
      {
        id: 'detaljhandel-lager',
        question: 'Har ni ett fysiskt lager att hantera?',
        type: 'boolean',
        sectorSlug: 'detaljhandel',
        profileKey: 'har_lager',
      },
      {
        id: 'detaljhandel-ehandel',
        question: 'Säljer ni även online (e-handel)?',
        type: 'boolean',
        sectorSlug: 'detaljhandel',
        profileKey: 'har_ehandel',
      },
      {
        id: 'detaljhandel-livsmedel',
        question: 'Säljer ni livsmedel?',
        type: 'boolean',
        sectorSlug: 'detaljhandel',
        profileKey: 'har_livsmedel',
      },
    ],
  },

  // ─── Frisör & Skönhet ────────────────────────────────────────────────
  {
    sectorSlug: 'frisor',
    sectorName: 'Frisör & Skönhet',
    questions: [
      {
        id: 'frisor-hyrstol',
        question: 'Har ni stolshyrare (hyrstolsmodell)?',
        type: 'boolean',
        sectorSlug: 'frisor',
        profileKey: 'har_hyrstol',
      },
      {
        id: 'frisor-presentkort',
        question: 'Säljer ni presentkort?',
        type: 'boolean',
        sectorSlug: 'frisor',
        profileKey: 'har_presentkort',
      },
      {
        id: 'frisor-bokning',
        question: 'Använder ni ett onlinebokningssystem?',
        type: 'select',
        options: [
          { value: 'timma', label: 'Timma' },
          { value: 'fresha', label: 'Fresha' },
          { value: 'planway', label: 'Planway' },
          { value: 'annat', label: 'Annat' },
          { value: 'inget', label: 'Inget' },
        ],
        sectorSlug: 'frisor',
        profileKey: 'bokningssystem',
      },
      {
        id: 'frisor-produkter',
        question: 'Säljer ni hårprodukter (produkter i butiken)?',
        type: 'boolean',
        sectorSlug: 'frisor',
        profileKey: 'saljer_produkter',
      },
    ],
  },

  // ─── Konsult & Rådgivning ────────────────────────────────────────────
  {
    sectorSlug: 'konsult',
    sectorName: 'Konsult & Rådgivning',
    questions: [
      {
        id: 'konsult-timbaserat',
        question: 'Debiterar ni timbaserat?',
        type: 'boolean',
        sectorSlug: 'konsult',
        profileKey: 'timbaserat',
      },
      {
        id: 'konsult-fastpris',
        question: 'Tar ni även fastprisuppdrag?',
        type: 'boolean',
        sectorSlug: 'konsult',
        profileKey: 'fastprisuppdrag',
      },
      {
        id: 'konsult-wip',
        question: 'Behöver ni spåra pågående arbete (WIP) som inte fakturerats?',
        type: 'boolean',
        sectorSlug: 'konsult',
        profileKey: 'har_wip',
      },
      {
        id: 'konsult-resor',
        question: 'Reser ni i tjänsten och behöver hantera traktamente?',
        type: 'boolean',
        sectorSlug: 'konsult',
        profileKey: 'har_resor',
      },
    ],
  },

  // ─── Transport & Logistik ────────────────────────────────────────────
  {
    sectorSlug: 'transport',
    sectorName: 'Transport & Logistik',
    questions: [
      {
        id: 'transport-fordon',
        question: 'Har ni egna fordon?',
        type: 'boolean',
        sectorSlug: 'transport',
        profileKey: 'egna_fordon',
      },
      {
        id: 'transport-forare',
        question: 'Har ni anställda chaufförer?',
        type: 'boolean',
        sectorSlug: 'transport',
        profileKey: 'har_forare',
      },
      {
        id: 'transport-branslekort',
        question: 'Använder ni bränslekort (Circle K, OKQ8, Preem)?',
        type: 'boolean',
        sectorSlug: 'transport',
        profileKey: 'har_branslekort',
      },
      {
        id: 'transport-leveranser',
        question: 'Gör ni leveranser till kunder (last mile)?',
        type: 'boolean',
        sectorSlug: 'transport',
        profileKey: 'har_leveranser',
      },
    ],
  },

  // ─── Hälsa & Sjukvård ───────────────────────────────────────────────
  {
    sectorSlug: 'halsa',
    sectorName: 'Hälsa & Sjukvård',
    questions: [
      {
        id: 'halsa-privatpraktik',
        question: 'Driver ni en privatpraktik?',
        type: 'boolean',
        sectorSlug: 'halsa',
        profileKey: 'privatpraktik',
      },
      {
        id: 'halsa-forsakring',
        question: 'Tar ni emot försäkringspatienter?',
        type: 'boolean',
        sectorSlug: 'halsa',
        profileKey: 'forsakringspatienter',
      },
      {
        id: 'halsa-journal',
        question: 'Använder ni ett journalsystem?',
        type: 'select',
        options: [
          { value: 'journal_digital', label: 'Ja, digitalt journalsystem' },
          { value: 'journal_papper', label: 'Ja, men pappersbaserat' },
          { value: 'inget', label: 'Nej, inget journalsystem' },
        ],
        sectorSlug: 'halsa',
        profileKey: 'journalsystem',
      },
      {
        id: 'halsa-regionavtal',
        question: 'Har ni avtal med region för ersättning?',
        type: 'boolean',
        sectorSlug: 'halsa',
        profileKey: 'regionavtal',
      },
    ],
  },

  // ─── Juridik & Redovisning ───────────────────────────────────────────
  {
    sectorSlug: 'juridik',
    sectorName: 'Juridik & Redovisning',
    questions: [
      {
        id: 'juridik-klientmedel',
        question: 'Hanterar ni klientmedel?',
        type: 'boolean',
        sectorSlug: 'juridik',
        profileKey: 'har_klientmedel',
      },
      {
        id: 'juridik-wip',
        question: 'Behöver ni spåra pågående arbete (WIP)?',
        type: 'boolean',
        sectorSlug: 'juridik',
        profileKey: 'har_wip',
      },
      {
        id: 'juridik-intressekontroll',
        question: 'Behöver ni intressekonfliktskontroll?',
        type: 'boolean',
        sectorSlug: 'juridik',
        profileKey: 'har_intressekontroll',
      },
      {
        id: 'juridik-tidrapportering',
        question: 'Använder ni externt tidrapporteringssystem?',
        type: 'select',
        options: [
          { value: 'clio', label: 'Clio' },
          { value: 'maconomy', label: 'Maconomy' },
          { value: 'time', label: 'Time' },
          { value: 'annat', label: 'Annat' },
          { value: 'inget', label: 'Inget' },
        ],
        sectorSlug: 'juridik',
        profileKey: 'tidrapporteringssystem',
      },
    ],
  },
]

/**
 * Get questions for a specific sector by slug.
 * Returns questions for the sector if defined, or an empty array for sectors without specific questions.
 */
export function getQuestionsForSector(sectorSlug: string): SectorQuestionSet | null {
  return sectorQuestions.find(sq => sq.sectorSlug === sectorSlug) || null
}

/**
 * Get all available sector question slugs.
 */
export function getSectorsWithQuestions(): string[] {
  return sectorQuestions.map(sq => sq.sectorSlug)
}
