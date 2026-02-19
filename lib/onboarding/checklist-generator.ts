import type { ChecklistTask } from '@/types/onboarding'

/**
 * Common checklist tasks applicable to all businesses.
 */
const commonTasks: ChecklistTask[] = [
  {
    taskKey: 'categorize_transactions',
    title: 'Kategorisera dina första transaktioner',
    description: 'Gå igenom dina banktransaktioner och markera dem som företag eller privat.',
    sortOrder: 1,
  },
  {
    taskKey: 'send_first_invoice',
    title: 'Skicka din första faktura',
    description: 'Lägg till en kund och skapa en faktura för att testa fakturaflödet.',
    sortOrder: 2,
  },
  {
    taskKey: 'review_monthly_report',
    title: 'Granska månadsrapporten',
    description: 'Öppna Rapporter och kontrollera resultaträkningen för innevarande månad.',
    sortOrder: 3,
  },
  {
    taskKey: 'scan_first_receipt',
    title: 'Skanna ditt första kvitto',
    description: 'Använd kameran för att fotografera och spara ett affärskvitto.',
    sortOrder: 4,
  },
]

/**
 * Sector-specific checklist tasks.
 */
const sectorTasks: Record<string, ChecklistTask[]> = {
  restaurang: [
    {
      taskKey: 'import_z_rapport',
      title: 'Importera din första Z-rapport',
      description: 'Hämta dagskassarapporten från ert kassasystem och importera den.',
      sortOrder: 10,
    },
    {
      taskKey: 'setup_moms_split',
      title: 'Kontrollera momssplit mat/dryck',
      description: 'Verifiera att moms delas korrekt mellan 12% (mat) och 25% (alkohol/dryck).',
      sortOrder: 11,
    },
  ],
  bygg: [
    {
      taskKey: 'create_first_project',
      title: 'Skapa ditt första projekt',
      description: 'Lägg upp ett byggprojekt med kalkyl för att börja följa kostnader.',
      sortOrder: 10,
    },
    {
      taskKey: 'check_rot_setup',
      title: 'Konfigurera ROT-avdrag',
      description: 'Sätt upp ROT-avdragsinformation för att kunna rapportera till Skatteverket.',
      sortOrder: 11,
    },
  ],
  ehandel: [
    {
      taskKey: 'connect_ecommerce',
      title: 'Anslut din e-handelsplattform',
      description: 'Importera ordrar från Shopify, WooCommerce eller annan plattform.',
      sortOrder: 10,
    },
    {
      taskKey: 'review_return_policy',
      title: 'Konfigurera returbokföring',
      description: 'Sätt upp hur returer och kreditfakturor ska hanteras automatiskt.',
      sortOrder: 11,
    },
  ],
  tech: [
    {
      taskKey: 'setup_time_tracking',
      title: 'Börja tidrapportera',
      description: 'Logga tid på ditt första projekt för att bygga debiteringsunderlag.',
      sortOrder: 10,
    },
    {
      taskKey: 'create_first_project_tech',
      title: 'Skapa ditt första kundprojekt',
      description: 'Lägg upp ett projekt med budget och milstolpar.',
      sortOrder: 11,
    },
  ],
  detaljhandel: [
    {
      taskKey: 'import_pos_report',
      title: 'Importera första kassarapporten',
      description: 'Hämta Z-rapport från ert kassasystem och importera den.',
      sortOrder: 10,
    },
    {
      taskKey: 'setup_inventory',
      title: 'Lägg upp ert lager',
      description: 'Registrera era viktigaste produkter för lagerövervakning.',
      sortOrder: 11,
    },
  ],
  frisor: [
    {
      taskKey: 'setup_booking',
      title: 'Konfigurera bokningssystemet',
      description: 'Lägg till behandlingar och tider för onlinebokning.',
      sortOrder: 10,
    },
    {
      taskKey: 'register_staff',
      title: 'Lägg till personal',
      description: 'Registrera frisörer/terapeuter med provision och schema.',
      sortOrder: 11,
    },
  ],
  konsult: [
    {
      taskKey: 'setup_time_tracking_konsult',
      title: 'Börja tidrapportera',
      description: 'Logga tid på ditt första uppdrag för att bygga fakturaunderlag.',
      sortOrder: 10,
    },
    {
      taskKey: 'create_first_offer',
      title: 'Skapa din första offert',
      description: 'Använd offertmallen för att skicka ett förslag till en kund.',
      sortOrder: 11,
    },
  ],
  transport: [
    {
      taskKey: 'register_vehicles',
      title: 'Registrera era fordon',
      description: 'Lägg till fordon i flottan för kostnadsuppföljning.',
      sortOrder: 10,
    },
    {
      taskKey: 'import_fuel_cards',
      title: 'Importera bränslekort',
      description: 'Anslut tankningsinformation från Circle K, OKQ8 eller Preem.',
      sortOrder: 11,
    },
  ],
  halsa: [
    {
      taskKey: 'setup_patient_booking',
      title: 'Konfigurera patientbokning',
      description: 'Lägg till behandlingstyper och öppettider för bokning.',
      sortOrder: 10,
    },
    {
      taskKey: 'verify_vat_exempt',
      title: 'Verifiera momsfrihet',
      description: 'Kontrollera att vårdtjänster korrekt undantas från moms.',
      sortOrder: 11,
    },
  ],
  juridik: [
    {
      taskKey: 'setup_case_management',
      title: 'Skapa ditt första ärende',
      description: 'Lägg upp ett klientärende för att börja tidrapportera.',
      sortOrder: 10,
    },
    {
      taskKey: 'configure_client_funds',
      title: 'Konfigurera klientmedelskonto',
      description: 'Sätt upp separata konton för klientmedel enligt god advokatsed.',
      sortOrder: 11,
    },
  ],
}

/**
 * Generate a full checklist for a given sector and selected modules.
 */
export function generateChecklistTasks(
  sectorSlug: string,
  _selectedModules: string[]
): ChecklistTask[] {
  const tasks = [...commonTasks]

  // Add sector-specific tasks
  const sector = sectorTasks[sectorSlug]
  if (sector) {
    tasks.push(...sector)
  }

  // Sort by sortOrder
  tasks.sort((a, b) => a.sortOrder - b.sortOrder)

  return tasks
}
