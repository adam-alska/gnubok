/**
 * BAS Reference Data for Swedish SME Accounting
 *
 * Curated subset of the BAS Kontoplan (Swedish standard chart of accounts)
 * covering the most common accounts used by enskild firma and aktiebolag.
 *
 * Reference: BAS Kontogrupp 2024 (Svensk standard för kontoplan)
 * SRU codes follow Skatteverket's SRU specification for NE and INK2 forms.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BASReferenceAccount {
  account_number: string
  account_name: string
  account_class: number
  account_group: string
  account_type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'
  normal_balance: 'debit' | 'credit'
  description: string
  sru_code: string | null
}

// ---------------------------------------------------------------------------
// Class & Group Labels
// ---------------------------------------------------------------------------

/** Swedish labels for each BAS account class (1-8) */
export const ACCOUNT_CLASS_LABELS: Record<number, string> = {
  1: 'Tillgangar',
  2: 'Eget kapital och skulder',
  3: 'Rorelseintatker',
  4: 'Varuinkop och material',
  5: 'Ovriga externa kostnader',
  6: 'Ovriga externa kostnader',
  7: 'Personalkostnader och avskrivningar',
  8: 'Finansiella poster och resultat',
}

/** Swedish labels for BAS account groups (first two digits) */
export const ACCOUNT_GROUP_LABELS: Record<string, string> = {
  // Class 1 - Assets
  '10': 'Immateriella anlaggningstillgangar',
  '11': 'Byggnader och mark',
  '12': 'Maskiner och inventarier',
  '13': 'Finansiella anlaggningstillgangar',
  '14': 'Lager och pagende arbeten',
  '15': 'Kundfordringar',
  '16': 'Ovriga kortfristiga fordringar',
  '17': 'Forutbetalda kostnader och upplupna intakter',
  '18': 'Kortfristiga placeringar',
  '19': 'Kassa och bank',

  // Class 2 - Equity & Liabilities
  '20': 'Eget kapital',
  '21': 'Obeskattade reserver',
  '22': 'Avsattningar',
  '23': 'Langfristiga skulder',
  '24': 'Kortfristiga skulder till kreditinstitut och leverantorer',
  '25': 'Skatteskulder',
  '26': 'Moms och punktskatter',
  '27': 'Personalens skatter, avgifter och loneforskott',
  '28': 'Ovriga kortfristiga skulder',
  '29': 'Upplupna kostnader och forutbetalda intakter',

  // Class 3 - Revenue
  '30': 'Forsaljning varor och tjanster',
  '31': 'Momsfri forsaljning',
  '32': 'Forsaljning varor utanfor Sverige',
  '33': 'Forsaljning tjanster utanfor Sverige',
  '34': 'Forsaljning, blandad moms',
  '35': 'Fakturerade kostnader',
  '36': 'Rorelseintakter sidoverksamhet',
  '37': 'Intaktskorrigeringar',
  '38': 'Aktiverat arbete',
  '39': 'Ovriga rorelseintakter',

  // Class 4 - Cost of goods
  '40': 'Inkop varor och material',
  '41': 'Inkop varor och material',
  '44': 'Inkop varor fran utlandet',
  '45': 'Ovriga varuinkop',
  '46': 'Legoarbeten och underentreprenader',
  '47': 'Reduktion varuinkop',
  '49': 'Forandring av lager och pagende arbeten',

  // Class 5 - External expenses
  '50': 'Lokalkostnader',
  '51': 'Fastighetskostnader',
  '52': 'Hyra av anlaggningstillgangar',
  '53': 'Foretags- och produktforsakringar',
  '54': 'Forbrukningsinventarier och material',
  '55': 'Reparation och underhall',
  '56': 'Transportkostnader',
  '57': 'Frakter och transporter',
  '58': 'Resekostnader',
  '59': 'Reklam och PR',

  // Class 6 - Other external expenses
  '60': 'Ovriga forsaljningskostnader',
  '61': 'Kontorsmateriel och trycksaker',
  '62': 'Tele och post',
  '63': 'Foretags- och foreningsavgifter',
  '64': 'Forvaltningskostnader',
  '65': 'Ovriga externa tjanster',
  '66': 'Franchisingavgifter',
  '67': 'Forsknings- och utvecklingskostnader',
  '68': 'Inhyrd personal',
  '69': 'Ovriga externa kostnader',

  // Class 7 - Personnel
  '70': 'Loner till tjansteman',
  '72': 'Loner till kollektivanstallda',
  '73': 'Kostnadsersattningar och naturaformanar',
  '74': 'Pensionskostnader',
  '75': 'Sociala och andra avgifter',
  '76': 'Ovriga personalkostnader',
  '77': 'Nedskrivningar',
  '78': 'Avskrivningar',
  '79': 'Ovriga rorelsekostnader',

  // Class 8 - Financial
  '80': 'Resultat fran andelar i koncernforetag',
  '81': 'Resultat fran andelar i intresseforetag',
  '82': 'Resultat fran ovriga finansiella anlggningstillgangar',
  '83': 'Ovriga ranteintakter och finansiella intakter',
  '84': 'Rantekostnader och finansiella kostnader',
  '85': 'Extraordinara intakter',
  '86': 'Extraordinara kostnader',
  '87': 'Bokslutsdispositioner (intakter)',
  '88': 'Bokslutsdispositioner (kostnader)',
  '89': 'Skatter och arets resultat',
}

// ---------------------------------------------------------------------------
// BAS Reference Accounts
// ---------------------------------------------------------------------------

export const BAS_REFERENCE: BASReferenceAccount[] = [
  // =========================================================================
  // CLASS 1: TILLGANGAR (Assets)
  // =========================================================================

  // 10 - Immateriella anlaggningstillgangar
  {
    account_number: '1010',
    account_name: 'Utvecklingsutgifter',
    account_class: 1,
    account_group: '10',
    account_type: 'asset',
    normal_balance: 'debit',
    description: 'Aktiverade utgifter for utvecklingsarbete, t.ex. mjukvaruutveckling eller produktutveckling.',
    sru_code: '7201',
  },
  {
    account_number: '1030',
    account_name: 'Patent',
    account_class: 1,
    account_group: '10',
    account_type: 'asset',
    normal_balance: 'debit',
    description: 'Aktiverade kostnader for patent och liknande rattigheter.',
    sru_code: '7201',
  },
  {
    account_number: '1050',
    account_name: 'Goodwill',
    account_class: 1,
    account_group: '10',
    account_type: 'asset',
    normal_balance: 'debit',
    description: 'Goodwill som uppkommer vid forvrav av rorelse eller inkramsforvrav.',
    sru_code: '7201',
  },

  // 11 - Byggnader och mark
  {
    account_number: '1110',
    account_name: 'Byggnader',
    account_class: 1,
    account_group: '11',
    account_type: 'asset',
    normal_balance: 'debit',
    description: 'Anskaffningsvarde for byggnader som ags av foretaget.',
    sru_code: '7202',
  },
  {
    account_number: '1119',
    account_name: 'Ackumulerade avskrivningar byggnader',
    account_class: 1,
    account_group: '11',
    account_type: 'asset',
    normal_balance: 'credit',
    description: 'Ackumulerad vardeminskning pa byggnader sedan anskaffningstidpunkten.',
    sru_code: '7202',
  },
  {
    account_number: '1130',
    account_name: 'Mark',
    account_class: 1,
    account_group: '11',
    account_type: 'asset',
    normal_balance: 'debit',
    description: 'Anskaffningsvarde for mark som ags av foretaget. Mark skrivs inte av.',
    sru_code: '7202',
  },
  {
    account_number: '1150',
    account_name: 'Markanlaggningar',
    account_class: 1,
    account_group: '11',
    account_type: 'asset',
    normal_balance: 'debit',
    description: 'Aktiverade utgifter for markanlaggningar som parkering, dranering och brunnar.',
    sru_code: '7202',
  },

  // 12 - Maskiner och inventarier
  {
    account_number: '1210',
    account_name: 'Maskiner och andra tekniska anlaggningar',
    account_class: 1,
    account_group: '12',
    account_type: 'asset',
    normal_balance: 'debit',
    description: 'Maskiner, produktionsutrustning och andra tekniska anlaggningar.',
    sru_code: '7202',
  },
  {
    account_number: '1220',
    account_name: 'Inventarier och verktyg',
    account_class: 1,
    account_group: '12',
    account_type: 'asset',
    normal_balance: 'debit',
    description: 'Kontorsinventarier, datorer, mobler och verktyg over halva prisbasbeloppet.',
    sru_code: '7202',
  },
  {
    account_number: '1229',
    account_name: 'Ackumulerade avskrivningar inventarier',
    account_class: 1,
    account_group: '12',
    account_type: 'asset',
    normal_balance: 'credit',
    description: 'Ackumulerad vardeminskning pa inventarier och verktyg sedan anskaffning.',
    sru_code: '7202',
  },
  {
    account_number: '1240',
    account_name: 'Bilar och transportmedel',
    account_class: 1,
    account_group: '12',
    account_type: 'asset',
    normal_balance: 'debit',
    description: 'Fordon som ags av foretaget, t.ex. personbilar, lastbilar och skotare.',
    sru_code: '7202',
  },
  {
    account_number: '1249',
    account_name: 'Ackumulerade avskrivningar bilar',
    account_class: 1,
    account_group: '12',
    account_type: 'asset',
    normal_balance: 'credit',
    description: 'Ackumulerad vardeminskning pa fordon sedan anskaffning.',
    sru_code: '7202',
  },
  {
    account_number: '1250',
    account_name: 'Datorer',
    account_class: 1,
    account_group: '12',
    account_type: 'asset',
    normal_balance: 'debit',
    description: 'Datorer och servrar med anskaffningsvarde over halva prisbasbeloppet.',
    sru_code: '7202',
  },
  {
    account_number: '1259',
    account_name: 'Ackumulerade avskrivningar datorer',
    account_class: 1,
    account_group: '12',
    account_type: 'asset',
    normal_balance: 'credit',
    description: 'Ackumulerad vardeminskning pa datorer sedan anskaffning.',
    sru_code: '7202',
  },
  {
    account_number: '1290',
    account_name: 'Ovriga materiella anlaggningstillgangar',
    account_class: 1,
    account_group: '12',
    account_type: 'asset',
    normal_balance: 'debit',
    description: 'Materiella anlaggningstillgangar som inte passar i ovriga underkategorier.',
    sru_code: '7202',
  },

  // 13 - Finansiella anlaggningstillgangar
  {
    account_number: '1310',
    account_name: 'Andelar i koncernforetag',
    account_class: 1,
    account_group: '13',
    account_type: 'asset',
    normal_balance: 'debit',
    description: 'Aktier och andelar i dotterbolag och koncernforetag.',
    sru_code: '7203',
  },
  {
    account_number: '1380',
    account_name: 'Andra langfristiga fordringar',
    account_class: 1,
    account_group: '13',
    account_type: 'asset',
    normal_balance: 'debit',
    description: 'Langfristiga fordringar som inte faller under andra kategorier, t.ex. deposition.',
    sru_code: '7203',
  },

  // 14 - Lager
  {
    account_number: '1400',
    account_name: 'Lager',
    account_class: 1,
    account_group: '14',
    account_type: 'asset',
    normal_balance: 'debit',
    description: 'Varulager varor i lager avsedda for forsaljning.',
    sru_code: '7210',
  },
  {
    account_number: '1410',
    account_name: 'Lager av ravaror och fornodenheter',
    account_class: 1,
    account_group: '14',
    account_type: 'asset',
    normal_balance: 'debit',
    description: 'Ravaror och material som anvands i produktion men inte ar fardiga produkter.',
    sru_code: '7210',
  },
  {
    account_number: '1460',
    account_name: 'Lager av fardiga varor',
    account_class: 1,
    account_group: '14',
    account_type: 'asset',
    normal_balance: 'debit',
    description: 'Fardiga varor klara att levereras till kund.',
    sru_code: '7210',
  },
  {
    account_number: '1470',
    account_name: 'Pagende arbeten',
    account_class: 1,
    account_group: '14',
    account_type: 'asset',
    normal_balance: 'debit',
    description: 'Halvfabrikat och arbeten under tillverkning som annu inte slutforts.',
    sru_code: '7210',
  },

  // 15 - Kundfordringar
  {
    account_number: '1510',
    account_name: 'Kundfordringar',
    account_class: 1,
    account_group: '15',
    account_type: 'asset',
    normal_balance: 'debit',
    description: 'Pengar som kunder ar skyldiga foretaget for skickade fakturor som inte betalats annu.',
    sru_code: '7211',
  },
  {
    account_number: '1513',
    account_name: 'Kundfordringar - Loss Allowance',
    account_class: 1,
    account_group: '15',
    account_type: 'asset',
    normal_balance: 'credit',
    description: 'Varrdering av befarade kundforluster, minskar kundfordringsbalansen.',
    sru_code: '7211',
  },
  {
    account_number: '1580',
    account_name: 'Fordran for skatt',
    account_class: 1,
    account_group: '15',
    account_type: 'asset',
    normal_balance: 'debit',
    description: 'Pengar att fordra fran Skatteverket, t.ex. overskjutande moms.',
    sru_code: '7211',
  },

  // 16 - Ovriga kortfristiga fordringar
  {
    account_number: '1610',
    account_name: 'Fordringar hos anstallda',
    account_class: 1,
    account_group: '16',
    account_type: 'asset',
    normal_balance: 'debit',
    description: 'Utlagg eller forskott till anstallda som ska aterbetalas.',
    sru_code: '7212',
  },
  {
    account_number: '1630',
    account_name: 'Skattekonto',
    account_class: 1,
    account_group: '16',
    account_type: 'asset',
    normal_balance: 'debit',
    description: 'Foretages skattekonto hos Skatteverket. Visar saldo for inbetalda skatter och avgifter.',
    sru_code: '7212',
  },
  {
    account_number: '1650',
    account_name: 'Momsfordran',
    account_class: 1,
    account_group: '16',
    account_type: 'asset',
    normal_balance: 'debit',
    description: 'Fordran pa Skatteverket nar ingaende moms overstiger utgaende moms.',
    sru_code: '7212',
  },

  // 17 - Forutbetalda kostnader
  {
    account_number: '1710',
    account_name: 'Forutbetalda hyreskostnader',
    account_class: 1,
    account_group: '17',
    account_type: 'asset',
    normal_balance: 'debit',
    description: 'Hyra som betalats i forskott men avser kommande perioder.',
    sru_code: '7212',
  },
  {
    account_number: '1720',
    account_name: 'Forutbetalda forsakringspremier',
    account_class: 1,
    account_group: '17',
    account_type: 'asset',
    normal_balance: 'debit',
    description: 'Forsakringspremier betalade i forskott som avser framtida perioder.',
    sru_code: '7212',
  },
  {
    account_number: '1790',
    account_name: 'Ovriga forutbetalda kostnader och upplupna intakter',
    account_class: 1,
    account_group: '17',
    account_type: 'asset',
    normal_balance: 'debit',
    description: 'Forutbetalda kostnader och upplupna intakter som inte ryms i andra underkonton.',
    sru_code: '7212',
  },

  // 18 - Kortfristiga placeringar
  {
    account_number: '1810',
    account_name: 'Andelar i borsnoterade foretag',
    account_class: 1,
    account_group: '18',
    account_type: 'asset',
    normal_balance: 'debit',
    description: 'Kortfristiga aktieinnehav i borsnoterade foretag avsedda att saljas inom 12 manader.',
    sru_code: '7212',
  },

  // 19 - Kassa och bank
  {
    account_number: '1910',
    account_name: 'Kassa',
    account_class: 1,
    account_group: '19',
    account_type: 'asset',
    normal_balance: 'debit',
    description: 'Kontanta pengar i foretagets kassa.',
    sru_code: '7212',
  },
  {
    account_number: '1920',
    account_name: 'PlusGiro',
    account_class: 1,
    account_group: '19',
    account_type: 'asset',
    normal_balance: 'debit',
    description: 'Pengar pa foretagets PlusGiro-konto.',
    sru_code: '7212',
  },
  {
    account_number: '1930',
    account_name: 'Foretagskonto / checkkonto',
    account_class: 1,
    account_group: '19',
    account_type: 'asset',
    normal_balance: 'debit',
    description: 'Foretagets huvudsakliga bankkonto for dagliga in- och utbetalningar.',
    sru_code: '7212',
  },
  {
    account_number: '1940',
    account_name: 'Ovriga bankkonton',
    account_class: 1,
    account_group: '19',
    account_type: 'asset',
    normal_balance: 'debit',
    description: 'Ytterligare bankkonton utover huvudkontot, t.ex. sparkonto.',
    sru_code: '7212',
  },
  {
    account_number: '1950',
    account_name: 'Bankgiro',
    account_class: 1,
    account_group: '19',
    account_type: 'asset',
    normal_balance: 'debit',
    description: 'Pengar pa foretagets Bankgiro-konto.',
    sru_code: '7212',
  },

  // =========================================================================
  // CLASS 2: EGET KAPITAL OCH SKULDER (Equity & Liabilities)
  // =========================================================================

  // 20 - Eget kapital - Enskild firma
  {
    account_number: '2010',
    account_name: 'Eget kapital',
    account_class: 2,
    account_group: '20',
    account_type: 'equity',
    normal_balance: 'credit',
    description: 'Agarens insatta kapital i enskild firma. Visar vad agaren har investerat.',
    sru_code: '7221',
  },
  {
    account_number: '2013',
    account_name: 'Ovriga egna uttag',
    account_class: 2,
    account_group: '20',
    account_type: 'equity',
    normal_balance: 'debit',
    description: 'Pengar som agaren av en enskild firma tar ut privat ur foretaget.',
    sru_code: '7221',
  },
  {
    account_number: '2017',
    account_name: 'Arets kapitaltillskott',
    account_class: 2,
    account_group: '20',
    account_type: 'equity',
    normal_balance: 'credit',
    description: 'Tillskott fran agaren under lopande rakenskapsar i enskild firma.',
    sru_code: '7221',
  },
  {
    account_number: '2018',
    account_name: 'Ovriga egna insattningar',
    account_class: 2,
    account_group: '20',
    account_type: 'equity',
    normal_balance: 'credit',
    description: 'Pengar som agaren satter in privat i foretaget (enskild firma).',
    sru_code: '7221',
  },
  {
    account_number: '2019',
    account_name: 'Arets resultat (EF)',
    account_class: 2,
    account_group: '20',
    account_type: 'equity',
    normal_balance: 'credit',
    description: 'Arets vinst eller forlust i enskild firma.',
    sru_code: '7221',
  },

  // 20 - Eget kapital - Aktiebolag
  {
    account_number: '2081',
    account_name: 'Aktiekapital',
    account_class: 2,
    account_group: '20',
    account_type: 'equity',
    normal_balance: 'credit',
    description: 'Det registrerade aktiekapitalet i ett aktiebolag.',
    sru_code: '7220',
  },
  {
    account_number: '2085',
    account_name: 'Uppskrivningsfond',
    account_class: 2,
    account_group: '20',
    account_type: 'equity',
    normal_balance: 'credit',
    description: 'Fond for uppskrivning av anlaggningstillgangar i aktiebolag.',
    sru_code: '7221',
  },
  {
    account_number: '2086',
    account_name: 'Reservfond',
    account_class: 2,
    account_group: '20',
    account_type: 'equity',
    normal_balance: 'credit',
    description: 'Bundet eget kapital i aktiebolag. Ska vara minst 20% av aktiekapitalet (aldre regler).',
    sru_code: '7221',
  },
  {
    account_number: '2091',
    account_name: 'Balanserat resultat',
    account_class: 2,
    account_group: '20',
    account_type: 'equity',
    normal_balance: 'credit',
    description: 'Ackumulerade vinster eller forluster fran tidigare ar som inte delats ut.',
    sru_code: '7221',
  },
  {
    account_number: '2093',
    account_name: 'Erhallna aktieagartillskott',
    account_class: 2,
    account_group: '20',
    account_type: 'equity',
    normal_balance: 'credit',
    description: 'Tillskott fran aktieagare som inte ar lan, okar fritt eget kapital.',
    sru_code: '7221',
  },
  {
    account_number: '2098',
    account_name: 'Vinst/forlust fran foregaende ar',
    account_class: 2,
    account_group: '20',
    account_type: 'equity',
    normal_balance: 'credit',
    description: 'Foregaende ars resultat innan det fordelats till balanserat resultat eller utdelning.',
    sru_code: '7221',
  },
  {
    account_number: '2099',
    account_name: 'Arets resultat',
    account_class: 2,
    account_group: '20',
    account_type: 'equity',
    normal_balance: 'credit',
    description: 'Vinst eller forlust for innevarande rakenskapsar (aktiebolag).',
    sru_code: '7222',
  },

  // 21 - Obeskattade reserver
  {
    account_number: '2150',
    account_name: 'Ackumulerade overavskrivningar',
    account_class: 2,
    account_group: '21',
    account_type: 'liability',
    normal_balance: 'credit',
    description: 'Skattemassiga overavskrivningar pa inventarier utover plan (periodiseringsfond).',
    sru_code: '7230',
  },

  // 23 - Langfristiga skulder
  {
    account_number: '2310',
    account_name: 'Bankllan, langfristigt',
    account_class: 2,
    account_group: '23',
    account_type: 'liability',
    normal_balance: 'credit',
    description: 'Langfristiga bankllan med aterbetalningstid langre an 12 manader.',
    sru_code: '7230',
  },
  {
    account_number: '2350',
    account_name: 'Ovriga langfristiga skulder',
    account_class: 2,
    account_group: '23',
    account_type: 'liability',
    normal_balance: 'credit',
    description: 'Langfristiga skulder utover banklan, t.ex. lan fran privatpersoner.',
    sru_code: '7230',
  },

  // 24 - Kortfristiga skulder
  {
    account_number: '2410',
    account_name: 'Kortfristiga lan fran kreditinstitut',
    account_class: 2,
    account_group: '24',
    account_type: 'liability',
    normal_balance: 'credit',
    description: 'Banklan och checkrakkrediter med aterbetalningstid under 12 manader.',
    sru_code: '7230',
  },
  {
    account_number: '2440',
    account_name: 'Leverantorsskulder',
    account_class: 2,
    account_group: '24',
    account_type: 'liability',
    normal_balance: 'credit',
    description: 'Pengar som foretaget ar skyldigt leverantorer for mottagna fakturor.',
    sru_code: '7230',
  },

  // 25 - Skatteskulder
  {
    account_number: '2510',
    account_name: 'Skatteskulder',
    account_class: 2,
    account_group: '25',
    account_type: 'liability',
    normal_balance: 'credit',
    description: 'Skulder till Skatteverket for preliminar skatt och andra skattebetalningar.',
    sru_code: '7231',
  },
  {
    account_number: '2514',
    account_name: 'Beraknad inkomstskatt',
    account_class: 2,
    account_group: '25',
    account_type: 'liability',
    normal_balance: 'credit',
    description: 'Beraknad men annu inte deklarerad inkomstskatt for rakenskapsaret.',
    sru_code: '7231',
  },

  // 26 - Moms
  {
    account_number: '2610',
    account_name: 'Utgaende moms, 25%',
    account_class: 2,
    account_group: '26',
    account_type: 'liability',
    normal_balance: 'credit',
    description: 'Samlingskonto for utgaende moms med 25% momssats.',
    sru_code: '7231',
  },
  {
    account_number: '2611',
    account_name: 'Utgaende moms forsaljning 25%',
    account_class: 2,
    account_group: '26',
    account_type: 'liability',
    normal_balance: 'credit',
    description: 'Moms du tar ut pa forsaljning med 25% momssats. Ska betalas in till Skatteverket.',
    sru_code: '7231',
  },
  {
    account_number: '2614',
    account_name: 'Utgaende moms omvand skattskyldighet 25%',
    account_class: 2,
    account_group: '26',
    account_type: 'liability',
    normal_balance: 'credit',
    description: 'Utgaende moms vid omvand skattskyldighet (reverse charge) med 25% momssats.',
    sru_code: '7231',
  },
  {
    account_number: '2620',
    account_name: 'Utgaende moms, 12%',
    account_class: 2,
    account_group: '26',
    account_type: 'liability',
    normal_balance: 'credit',
    description: 'Samlingskonto for utgaende moms med 12% momssats.',
    sru_code: '7231',
  },
  {
    account_number: '2621',
    account_name: 'Utgaende moms forsaljning 12%',
    account_class: 2,
    account_group: '26',
    account_type: 'liability',
    normal_balance: 'credit',
    description: 'Moms pa forsaljning med 12% momssats, t.ex. livsmedel och hotell.',
    sru_code: '7231',
  },
  {
    account_number: '2624',
    account_name: 'Utgaende moms omvand skattskyldighet 12%',
    account_class: 2,
    account_group: '26',
    account_type: 'liability',
    normal_balance: 'credit',
    description: 'Utgaende moms vid omvand skattskyldighet (reverse charge) med 12% momssats.',
    sru_code: '7231',
  },
  {
    account_number: '2630',
    account_name: 'Utgaende moms, 6%',
    account_class: 2,
    account_group: '26',
    account_type: 'liability',
    normal_balance: 'credit',
    description: 'Samlingskonto for utgaende moms med 6% momssats.',
    sru_code: '7231',
  },
  {
    account_number: '2631',
    account_name: 'Utgaende moms forsaljning 6%',
    account_class: 2,
    account_group: '26',
    account_type: 'liability',
    normal_balance: 'credit',
    description: 'Moms pa forsaljning med 6% momssats, t.ex. bocker och tidningar.',
    sru_code: '7231',
  },
  {
    account_number: '2634',
    account_name: 'Utgaende moms omvand skattskyldighet 6%',
    account_class: 2,
    account_group: '26',
    account_type: 'liability',
    normal_balance: 'credit',
    description: 'Utgaende moms vid omvand skattskyldighet (reverse charge) med 6% momssats.',
    sru_code: '7231',
  },
  {
    account_number: '2641',
    account_name: 'Debiterad ingaende moms',
    account_class: 2,
    account_group: '26',
    account_type: 'liability',
    normal_balance: 'debit',
    description: 'Moms pa inkop som foretaget har ratt att dra av. Minskar momsskulden.',
    sru_code: '7231',
  },
  {
    account_number: '2645',
    account_name: 'Beraknad ingaende moms EU-forvarv',
    account_class: 2,
    account_group: '26',
    account_type: 'liability',
    normal_balance: 'debit',
    description: 'Ingaende moms som beraknas sjalv vid inkop fran andra EU-lander (omvand skattskyldighet).',
    sru_code: '7231',
  },
  {
    account_number: '2650',
    account_name: 'Redovisningskonto for moms',
    account_class: 2,
    account_group: '26',
    account_type: 'liability',
    normal_balance: 'credit',
    description: 'Samlingskonto dit moms bokfors efter varje momsperiod, utgor nettot att betala till Skatteverket.',
    sru_code: '7231',
  },

  // 27 - Personalens skatter och avgifter
  {
    account_number: '2710',
    account_name: 'Personalskatt',
    account_class: 2,
    account_group: '27',
    account_type: 'liability',
    normal_balance: 'credit',
    description: 'Innehallen preliminarskatt pa anstallda loner som ska betalas till Skatteverket.',
    sru_code: '7231',
  },
  {
    account_number: '2731',
    account_name: 'Avrakning socialavgifter',
    account_class: 2,
    account_group: '27',
    account_type: 'liability',
    normal_balance: 'credit',
    description: 'Arbetsgivaravgifter redovisade men annu inte inbetalda till Skatteverket.',
    sru_code: '7231',
  },

  // 28 - Ovriga kortfristiga skulder
  {
    account_number: '2820',
    account_name: 'Kortfristiga skulder till anstallda',
    account_class: 2,
    account_group: '28',
    account_type: 'liability',
    normal_balance: 'credit',
    description: 'Skulder till anstallda for t.ex. reseforskott eller utlagg.',
    sru_code: '7231',
  },
  {
    account_number: '2893',
    account_name: 'Skuld till aktieagare',
    account_class: 2,
    account_group: '28',
    account_type: 'liability',
    normal_balance: 'credit',
    description: 'Pengar som aktiebolaget lanat av sina agare. Vanligt i mindre AB.',
    sru_code: '7231',
  },
  {
    account_number: '2898',
    account_name: 'Outtagen vinstutdelning',
    account_class: 2,
    account_group: '28',
    account_type: 'liability',
    normal_balance: 'credit',
    description: 'Beslutad men annu ej utbetald aktieutdelning.',
    sru_code: '7231',
  },

  // 29 - Upplupna kostnader
  {
    account_number: '2910',
    account_name: 'Upplupna loner',
    account_class: 2,
    account_group: '29',
    account_type: 'liability',
    normal_balance: 'credit',
    description: 'Loner som intjanats men annu inte utbetalats vid periodens slut.',
    sru_code: '7231',
  },
  {
    account_number: '2920',
    account_name: 'Upplupna semesterloner',
    account_class: 2,
    account_group: '29',
    account_type: 'liability',
    normal_balance: 'credit',
    description: 'Skuld for intjanade men inte uttagna semesterdagar.',
    sru_code: '7231',
  },
  {
    account_number: '2940',
    account_name: 'Upplupna arbetsgivaravgifter',
    account_class: 2,
    account_group: '29',
    account_type: 'liability',
    normal_balance: 'credit',
    description: 'Arbetsgivaravgifter som hanfor sig till redovisade loner men annu inte betalats.',
    sru_code: '7231',
  },
  {
    account_number: '2960',
    account_name: 'Upplupna rantekostnader',
    account_class: 2,
    account_group: '29',
    account_type: 'liability',
    normal_balance: 'credit',
    description: 'Rantekostnader som upplupit men inte fakturerats eller betalats annu.',
    sru_code: '7231',
  },
  {
    account_number: '2990',
    account_name: 'Ovriga upplupna kostnader och forutbetalda intakter',
    account_class: 2,
    account_group: '29',
    account_type: 'liability',
    normal_balance: 'credit',
    description: 'Upplupna kostnader och forutbetalda intakter som inte ryms i andra underkonton.',
    sru_code: '7231',
  },

  // =========================================================================
  // CLASS 3: RORELSEINTATKER (Revenue)
  // =========================================================================

  // 30 - Forsaljning varor och tjanster
  {
    account_number: '3001',
    account_name: 'Forsaljning varor/tjanster 25%',
    account_class: 3,
    account_group: '30',
    account_type: 'revenue',
    normal_balance: 'credit',
    description: 'Intakter fran forsaljning med 25% moms - den vanligaste intaktsraden for svenska foretag.',
    sru_code: '7310',
  },
  {
    account_number: '3002',
    account_name: 'Forsaljning varor/tjanster 12%',
    account_class: 3,
    account_group: '30',
    account_type: 'revenue',
    normal_balance: 'credit',
    description: 'Intakter fran forsaljning med 12% moms, t.ex. livsmedel och restaurang.',
    sru_code: '7310',
  },
  {
    account_number: '3003',
    account_name: 'Forsaljning varor/tjanster 6%',
    account_class: 3,
    account_group: '30',
    account_type: 'revenue',
    normal_balance: 'credit',
    description: 'Intakter fran forsaljning med 6% moms, t.ex. bocker, tidningar och kollektivtrafik.',
    sru_code: '7310',
  },
  {
    account_number: '3004',
    account_name: 'Forsaljning, momsfri',
    account_class: 3,
    account_group: '30',
    account_type: 'revenue',
    normal_balance: 'credit',
    description: 'Intakter fran forsaljning som ar undantagen fran moms, t.ex. sjukvard och utbildning.',
    sru_code: '7311',
  },

  // 31 - Momsfri forsaljning
  {
    account_number: '3100',
    account_name: 'Momsfri forsaljning',
    account_class: 3,
    account_group: '31',
    account_type: 'revenue',
    normal_balance: 'credit',
    description: 'Forsaljning som ar undantagen fran moms enligt mervardeskattelagen.',
    sru_code: '7311',
  },

  // 33 - Forsaljning tjanster utanfor Sverige
  {
    account_number: '3305',
    account_name: 'Forsaljning tjanster export utanfor EU',
    account_class: 3,
    account_group: '33',
    account_type: 'revenue',
    normal_balance: 'credit',
    description: 'Intakter fran forsaljning av tjanster till kunder utanfor EU. Momsfritt.',
    sru_code: '7310',
  },
  {
    account_number: '3308',
    account_name: 'Forsaljning tjanster EU',
    account_class: 3,
    account_group: '33',
    account_type: 'revenue',
    normal_balance: 'credit',
    description: 'Intakter fran forsaljning av tjanster till foretag i andra EU-lander. Omvand skattskyldighet.',
    sru_code: '7310',
  },

  // 35 - Fakturerade kostnader
  {
    account_number: '3510',
    account_name: 'Fakturerade utlagg',
    account_class: 3,
    account_group: '35',
    account_type: 'revenue',
    normal_balance: 'credit',
    description: 'Utlagg som vidarefaktureras till kund, t.ex. resor och material.',
    sru_code: '7310',
  },

  // 37 - Intaktskorrigeringar
  {
    account_number: '3740',
    account_name: 'Orestillbud',
    account_class: 3,
    account_group: '37',
    account_type: 'revenue',
    normal_balance: 'debit',
    description: 'Oreskillnad som uppstar vid avrundning av betalningar (oret).',
    sru_code: '7310',
  },

  // 39 - Ovriga rorelseintakter
  {
    account_number: '3900',
    account_name: 'Ovriga rorelseintakter',
    account_class: 3,
    account_group: '39',
    account_type: 'revenue',
    normal_balance: 'credit',
    description: 'Andra intakter som inte hor till karnverksamheten, t.ex. uthyrning av lokal.',
    sru_code: '7311',
  },
  {
    account_number: '3910',
    account_name: 'Hyresintakter',
    account_class: 3,
    account_group: '39',
    account_type: 'revenue',
    normal_balance: 'credit',
    description: 'Intakter fran uthyrning av lokaler, mark eller annan egendom.',
    sru_code: '7311',
  },
  {
    account_number: '3960',
    account_name: 'Valutakursvinster pa fordringar och skulder',
    account_class: 3,
    account_group: '39',
    account_type: 'revenue',
    normal_balance: 'credit',
    description: 'Vinster som uppstar vid valutavaxling eller betalningar i utlandsk valuta.',
    sru_code: '7310',
  },
  {
    account_number: '3970',
    account_name: 'Vinst vid avyttring av immateriella och materiella anlaggningstillgangar',
    account_class: 3,
    account_group: '39',
    account_type: 'revenue',
    normal_balance: 'credit',
    description: 'Vinst vid forsaljning av anlaggningstillgangar, t.ex. maskiner eller inventarier.',
    sru_code: '7311',
  },
  {
    account_number: '3990',
    account_name: 'Ovriga ersattningar och intakter',
    account_class: 3,
    account_group: '39',
    account_type: 'revenue',
    normal_balance: 'credit',
    description: 'Diverse andra rorelseintakter som inte passar i ovriga kategorier.',
    sru_code: '7311',
  },

  // =========================================================================
  // CLASS 4: VARUINKOP OCH MATERIAL (Cost of goods sold)
  // =========================================================================
  {
    account_number: '4010',
    account_name: 'Varuinkop',
    account_class: 4,
    account_group: '40',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Kostnader for inkop av varor avsedda for vidareforssaljning.',
    sru_code: '7320',
  },
  {
    account_number: '4100',
    account_name: 'Inkop material och varor',
    account_class: 4,
    account_group: '41',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Material och varor som anvands i produktion eller som direkt kostnad.',
    sru_code: '7320',
  },
  {
    account_number: '4400',
    account_name: 'Inkop varor utanfor EU',
    account_class: 4,
    account_group: '44',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Varuinkop fran lander utanfor EU, kan innebara tull och importmoms.',
    sru_code: '7320',
  },
  {
    account_number: '4500',
    account_name: 'Ovriga varuinkop',
    account_class: 4,
    account_group: '45',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Varuinkop som inte passar i ovriga underkonton i klass 4.',
    sru_code: '7320',
  },
  {
    account_number: '4600',
    account_name: 'Legoarbeten och underentreprenader',
    account_class: 4,
    account_group: '46',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Kostnader for arbete utfort av underleverantorer som del av leverans till kund.',
    sru_code: '7320',
  },
  {
    account_number: '4990',
    account_name: 'Lagerforrndring',
    account_class: 4,
    account_group: '49',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Forandring av varulagervarde under perioden. Okning minskar varuforbrukningen.',
    sru_code: '7320',
  },

  // =========================================================================
  // CLASS 5: OVRIGA EXTERNA KOSTNADER (External expenses)
  // =========================================================================

  // 50 - Lokalkostnader
  {
    account_number: '5010',
    account_name: 'Lokalhyra',
    account_class: 5,
    account_group: '50',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Manadshyra for kontorslokal, lager eller annan arbetsplats.',
    sru_code: '7321',
  },
  {
    account_number: '5020',
    account_name: 'El for lokal',
    account_class: 5,
    account_group: '50',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Elkostnader for foretagets lokaler.',
    sru_code: '7321',
  },
  {
    account_number: '5050',
    account_name: 'Lokalvard',
    account_class: 5,
    account_group: '50',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Kostnader for stadning och rengoring av foretagets lokaler.',
    sru_code: '7321',
  },
  {
    account_number: '5060',
    account_name: 'Forsakring lokal',
    account_class: 5,
    account_group: '50',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Forsakringskostnader for foretagets lokaler.',
    sru_code: '7321',
  },
  {
    account_number: '5090',
    account_name: 'Ovriga lokalkostnader',
    account_class: 5,
    account_group: '50',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Lokalkostnader som inte passar i andra underkonton, t.ex. vatten och varme.',
    sru_code: '7321',
  },

  // 52 - Hyra anlaggningstillgangar
  {
    account_number: '5200',
    account_name: 'Hyra av anlaggningstillgangar',
    account_class: 5,
    account_group: '52',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Kostnader for leasing eller hyra av maskiner, bilar och annan utrustning.',
    sru_code: '7321',
  },

  // 53 - Forsakringar
  {
    account_number: '5310',
    account_name: 'Foretagsforsakringar',
    account_class: 5,
    account_group: '53',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Forsakringar for foretagets verksamhet, t.ex. ansvars-, egendoms- och avbrottsforsakring.',
    sru_code: '7321',
  },

  // 54 - Forbrukningsinventarier
  {
    account_number: '5410',
    account_name: 'Forbrukningsinventarier',
    account_class: 5,
    account_group: '54',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Inventarier med kort livslangd eller varde under halva prisbasbeloppet.',
    sru_code: '7321',
  },
  {
    account_number: '5420',
    account_name: 'Programvaror',
    account_class: 5,
    account_group: '54',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Kostnader for mjukvara, prenumerationer och licenser.',
    sru_code: '7321',
  },
  {
    account_number: '5460',
    account_name: 'Forbrukningsmaterial',
    account_class: 5,
    account_group: '54',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Forbrukningsmaterial som inte ar kontorsmaterial, t.ex. forpackningsmaterial.',
    sru_code: '7321',
  },

  // 55 - Reparation och underhall
  {
    account_number: '5500',
    account_name: 'Reparation och underhall',
    account_class: 5,
    account_group: '55',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Kostnader for reparation och underhall av maskiner, inventarier och lokaler.',
    sru_code: '7321',
  },

  // 56 - Transportkostnader
  {
    account_number: '5610',
    account_name: 'Bilkostnader',
    account_class: 5,
    account_group: '56',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Drivmedel, forsakring, reparation och ovriga kostnader for foretagebilar.',
    sru_code: '7321',
  },
  {
    account_number: '5615',
    account_name: 'Drivmedel',
    account_class: 5,
    account_group: '56',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Bransle- och drivmedelskostnader for foretagets fordon.',
    sru_code: '7321',
  },

  // 57 - Frakter
  {
    account_number: '5710',
    account_name: 'Frakter och transporter',
    account_class: 5,
    account_group: '57',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Kostnader for frakt och transport av varor till och fran foretaget.',
    sru_code: '7321',
  },

  // 58 - Resekostnader
  {
    account_number: '5800',
    account_name: 'Resekostnader',
    account_class: 5,
    account_group: '58',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Tjansteresor: tag, flyg, taxi och ovriga resekostnader.',
    sru_code: '7321',
  },
  {
    account_number: '5810',
    account_name: 'Biljetter',
    account_class: 5,
    account_group: '58',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Rese- och transportbiljetter for tjansteresor (tag, flyg, buss).',
    sru_code: '7321',
  },
  {
    account_number: '5820',
    account_name: 'Hotell och logi',
    account_class: 5,
    account_group: '58',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Overnatningskostnader i samband med tjansteresor.',
    sru_code: '7321',
  },

  // 59 - Reklam
  {
    account_number: '5910',
    account_name: 'Annonsering och reklam',
    account_class: 5,
    account_group: '59',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Kostnader for marknadsforing, annonser, Google Ads, sociala medier och reklamkampanjer.',
    sru_code: '7321',
  },
  {
    account_number: '5930',
    account_name: 'Reklamtrycksaker',
    account_class: 5,
    account_group: '59',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Trycksaker for marknadsforingsandamal, t.ex. broschyrer och visitkort.',
    sru_code: '7321',
  },

  // =========================================================================
  // CLASS 6: OVRIGA EXTERNA KOSTNADER (Other external expenses)
  // =========================================================================

  // 60 - Ovriga forsaljningskostnader
  {
    account_number: '6071',
    account_name: 'Representation, avdragsgill',
    account_class: 6,
    account_group: '60',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Avdragsgill representation vid affarsrelaterade mallder och evenemang (max 300 kr/person).',
    sru_code: '7321',
  },
  {
    account_number: '6072',
    account_name: 'Representation, ej avdragsgill',
    account_class: 6,
    account_group: '60',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Representation som overstiger avdragsgilla beloppet. Inte skattemassigt avdragsgill.',
    sru_code: '7321',
  },

  // 61 - Kontorsmateriel
  {
    account_number: '6110',
    account_name: 'Kontorsmateriel',
    account_class: 6,
    account_group: '61',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Pennor, papper, toner, USB-minnen och ovriga kontorsfornodenheter.',
    sru_code: '7321',
  },
  {
    account_number: '6150',
    account_name: 'Trycksaker',
    account_class: 6,
    account_group: '61',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Trycksaker for internt bruk, t.ex. blanketter och formulair.',
    sru_code: '7321',
  },

  // 62 - Tele och post
  {
    account_number: '6211',
    account_name: 'Telefon',
    account_class: 6,
    account_group: '62',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Kostnad for fast telefoni och telefonabonnemang.',
    sru_code: '7321',
  },
  {
    account_number: '6212',
    account_name: 'Mobiltelefon',
    account_class: 6,
    account_group: '62',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Mobilabonnemang och samtalskostnader for foretagets mobiler.',
    sru_code: '7321',
  },
  {
    account_number: '6230',
    account_name: 'Datakommunikation',
    account_class: 6,
    account_group: '62',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Bredband, internetabonnemang, domaner, hosting och molntjanster.',
    sru_code: '7321',
  },
  {
    account_number: '6250',
    account_name: 'Postbefordran',
    account_class: 6,
    account_group: '62',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Porto, frimarken och kostnader for postutskick.',
    sru_code: '7321',
  },

  // 63 - Foretagsforsakringar och avgifter
  {
    account_number: '6310',
    account_name: 'Foretagsforsakringar',
    account_class: 6,
    account_group: '63',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Premiekostnader for foretagets forsakringar, t.ex. ansvars- och egendomsforsakring.',
    sru_code: '7321',
  },
  {
    account_number: '6360',
    account_name: 'Foreningsavgifter',
    account_class: 6,
    account_group: '63',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Medlemsavgifter till branschorganisationer, fackforbund och foreningar.',
    sru_code: '7321',
  },

  // 65 - Ovriga externa tjanster
  {
    account_number: '6510',
    account_name: 'Revisionsarvode',
    account_class: 6,
    account_group: '65',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Arvode till revisor for lagstadgad revision av foretagets arsredovisning.',
    sru_code: '7321',
  },
  {
    account_number: '6530',
    account_name: 'Redovisningstjanster',
    account_class: 6,
    account_group: '65',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Avgifter till bokforingsbyrta eller redovisningskonsult.',
    sru_code: '7321',
  },
  {
    account_number: '6540',
    account_name: 'IT-tjanster',
    account_class: 6,
    account_group: '65',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Kostnader for extern IT-support, konsultation och drifttjanster.',
    sru_code: '7321',
  },
  {
    account_number: '6550',
    account_name: 'Konsultarvoden',
    account_class: 6,
    account_group: '65',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Arvode till externa konsulter for radgivning och specialisttjanster.',
    sru_code: '7321',
  },
  {
    account_number: '6560',
    account_name: 'Serviceavgifter',
    account_class: 6,
    account_group: '65',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Serviceavtal och underhalskostnader for utrustning och system.',
    sru_code: '7321',
  },
  {
    account_number: '6570',
    account_name: 'Bankkostnader',
    account_class: 6,
    account_group: '65',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Avgifter for banktjanster, betalformedling, Swish och kortinlosen.',
    sru_code: '7321',
  },

  // 69 - Ovriga externa kostnader
  {
    account_number: '6970',
    account_name: 'Tidningar och facklitteratur',
    account_class: 6,
    account_group: '69',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Prenumerationer pa tidningar, tidskrifter och branschpublikationer.',
    sru_code: '7321',
  },
  {
    account_number: '6980',
    account_name: 'Foretagshalsorvard',
    account_class: 6,
    account_group: '69',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Kostnader for foretagshalsorvard, ergonomi och friskvordsavdrag.',
    sru_code: '7321',
  },
  {
    account_number: '6991',
    account_name: 'Ovriga avdragsgilla kostnader',
    account_class: 6,
    account_group: '69',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Diverse externa kostnader som inte passar in under andra konton men ar avdragsgilla.',
    sru_code: '7321',
  },
  {
    account_number: '6992',
    account_name: 'Ovriga ej avdragsgilla kostnader',
    account_class: 6,
    account_group: '69',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Externa kostnader som inte ar skattemassigt avdragsgilla, t.ex. boter och forseningsavgifter.',
    sru_code: '7321',
  },

  // =========================================================================
  // CLASS 7: PERSONALKOSTNADER OCH AVSKRIVNINGAR (Personnel & depreciation)
  // =========================================================================

  // 70 - Loner tjansteman
  {
    account_number: '7010',
    account_name: 'Loner till tjansteman',
    account_class: 7,
    account_group: '70',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Bruttoloner (fore skatt) till anstallda tjarnsteman.',
    sru_code: '7322',
  },
  {
    account_number: '7082',
    account_name: 'Sjukloner',
    account_class: 7,
    account_group: '70',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Lon som arbetsgivaren betalar under de forsta sjukdagarna (dag 2-14).',
    sru_code: '7322',
  },
  {
    account_number: '7090',
    account_name: 'Forandring semesterlonskuld',
    account_class: 7,
    account_group: '70',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Justering av skuld for intjanade semesterdagar som annu inte tagits ut.',
    sru_code: '7322',
  },

  // 72 - Loner kollektivanstallda
  {
    account_number: '7210',
    account_name: 'Loner till kollektivanstallda',
    account_class: 7,
    account_group: '72',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Bruttoloner till arbetare och kollektivanstallda.',
    sru_code: '7322',
  },
  {
    account_number: '7290',
    account_name: 'Forandring semesterlonskuld kollektiv',
    account_class: 7,
    account_group: '72',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Justering av semesterlonskuld for kollektivanstallda.',
    sru_code: '7322',
  },

  // 73 - Kostnadsersattningar
  {
    account_number: '7310',
    account_name: 'Kontanta extraersattningar',
    account_class: 7,
    account_group: '73',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Kostnadsersattningar till anstallda, t.ex. milersattning och traktamente.',
    sru_code: '7322',
  },
  {
    account_number: '7323',
    account_name: 'Bilersattning till anstallda, skattefri',
    account_class: 7,
    account_group: '73',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Skattefri bilersattning vid tjansteresor med egen bil (18,50 kr/mil skattefritt).',
    sru_code: '7322',
  },
  {
    account_number: '7332',
    account_name: 'Traktamenten, skattefria',
    account_class: 7,
    account_group: '73',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Skattefria traktamenten vid tjansteresor med overnattning.',
    sru_code: '7322',
  },

  // 74 - Pensionskostnader
  {
    account_number: '7410',
    account_name: 'Pensionsforsakringspremier',
    account_class: 7,
    account_group: '74',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Premiebetalningar for tjanstepension till anstallda.',
    sru_code: '7322',
  },

  // 75 - Sociala avgifter
  {
    account_number: '7510',
    account_name: 'Arbetsgivaravgifter',
    account_class: 7,
    account_group: '75',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Lagstadgade sociala avgifter (ca 31,42% av bruttolonen) till Skatteverket.',
    sru_code: '7322',
  },
  {
    account_number: '7519',
    account_name: 'Sociala avgifter for semester- och lonskuld',
    account_class: 7,
    account_group: '75',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Beraknade sociala avgifter pa upplupna semesterloner och andra loneskulder.',
    sru_code: '7322',
  },
  {
    account_number: '7533',
    account_name: 'Sarskild loneskatt',
    account_class: 7,
    account_group: '75',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Sarskild loneskatt pa pensionskostnader (24,26%).',
    sru_code: '7322',
  },

  // 76 - Ovriga personalkostnader
  {
    account_number: '7610',
    account_name: 'Utbildning',
    account_class: 7,
    account_group: '76',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Kostnader for utbildning, kurser och konferenser for anstallda.',
    sru_code: '7322',
  },
  {
    account_number: '7631',
    account_name: 'Personalrepresentation, avdragsgill',
    account_class: 7,
    account_group: '76',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Avdragsgill intern representation, t.ex. personalfester och jullunch.',
    sru_code: '7322',
  },
  {
    account_number: '7690',
    account_name: 'Ovriga personalkostnader',
    account_class: 7,
    account_group: '76',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Diverse personalkostnader som inte ryms i andra underkonton.',
    sru_code: '7322',
  },

  // 78 - Avskrivningar
  {
    account_number: '7810',
    account_name: 'Avskrivningar immateriella anlaggningstillgangar',
    account_class: 7,
    account_group: '78',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Planmassig avskrivning av goodwill, patent och andra immateriella tillgangar.',
    sru_code: '7325',
  },
  {
    account_number: '7820',
    account_name: 'Avskrivningar byggnader',
    account_class: 7,
    account_group: '78',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Arlig vardeminskning pa byggnader. Typiskt 2-5% per ar beroende pa byggnadstyp.',
    sru_code: '7324',
  },
  {
    account_number: '7832',
    account_name: 'Avskrivningar inventarier och verktyg',
    account_class: 7,
    account_group: '78',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Arlig vardeminskning pa inventarier, maskiner och verktyg.',
    sru_code: '7325',
  },
  {
    account_number: '7834',
    account_name: 'Avskrivningar bilar och transportmedel',
    account_class: 7,
    account_group: '78',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Arlig vardeminskning pa fordon som ags av foretaget.',
    sru_code: '7325',
  },
  {
    account_number: '7835',
    account_name: 'Avskrivningar datorer',
    account_class: 7,
    account_group: '78',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Arlig vardeminskning pa datorer och IT-utrustning. Vanligen 3-5 ars avskrivningstid.',
    sru_code: '7325',
  },

  // 79 - Ovriga rorelsekostnader
  {
    account_number: '7910',
    account_name: 'Forlust vid avyttring av anlaggningstillgangar',
    account_class: 7,
    account_group: '79',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Forlust som uppstar vid forsaljning av anlaggningstillgangar under bokfort varde.',
    sru_code: '7360',
  },
  {
    account_number: '7960',
    account_name: 'Valutakursforluster pa fordringar och skulder',
    account_class: 7,
    account_group: '79',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Forluster som uppstar vid valutavaxling eller betalningar i utlandsk valuta.',
    sru_code: '7360',
  },
  {
    account_number: '7970',
    account_name: 'Forlust vid avyttring av kortfristiga placeringar',
    account_class: 7,
    account_group: '79',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Forlust vid forsaljning av kortfristiga vardepapper, t.ex. aktier.',
    sru_code: '7360',
  },

  // =========================================================================
  // CLASS 8: FINANSIELLA POSTER OCH RESULTAT (Financial items & result)
  // =========================================================================

  // 83 - Ranteintakter
  {
    account_number: '8310',
    account_name: 'Ranteintakter',
    account_class: 8,
    account_group: '83',
    account_type: 'revenue',
    normal_balance: 'credit',
    description: 'Ranta pa bankkontosaldo, sparkonton och utlanade pengar.',
    sru_code: '7313',
  },
  {
    account_number: '8314',
    account_name: 'Skattefria ranteintakter',
    account_class: 8,
    account_group: '83',
    account_type: 'revenue',
    normal_balance: 'credit',
    description: 'Ranteintakter som ar undantagna fran beskattning.',
    sru_code: '7313',
  },
  {
    account_number: '8330',
    account_name: 'Valutakursvinster pa likvida medel',
    account_class: 8,
    account_group: '83',
    account_type: 'revenue',
    normal_balance: 'credit',
    description: 'Valutakursvinster pa bankmedel och liknande likvida tillgangar i utlandsk valuta.',
    sru_code: '7313',
  },

  // 84 - Rantekostnader
  {
    account_number: '8410',
    account_name: 'Rantekostnader',
    account_class: 8,
    account_group: '84',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Ranta pa lan, krediter och ovriga skulder till kreditgivare.',
    sru_code: '7323',
  },
  {
    account_number: '8420',
    account_name: 'Rantor pa leverantorsskulder',
    account_class: 8,
    account_group: '84',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Drrojsmalsranta och ovrig ranta pa forsenade betalningar till leverantorer.',
    sru_code: '7323',
  },
  {
    account_number: '8430',
    account_name: 'Valutakursforluster pa likvida medel',
    account_class: 8,
    account_group: '84',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Valutakursforluster pa bankmedel och liknande likvida tillgangar i utlandsk valuta.',
    sru_code: '7323',
  },

  // 87 - Bokslutsdispositioner (intakter)
  {
    account_number: '8710',
    account_name: 'Aterrforing overavskrivningar',
    account_class: 8,
    account_group: '87',
    account_type: 'revenue',
    normal_balance: 'credit',
    description: 'Aterforing av tidigare gjorda overavskrivningar till resultatet.',
    sru_code: '7380',
  },

  // 88 - Bokslutsdispositioner (kostnader)
  {
    account_number: '8810',
    account_name: 'Overavskrivningar',
    account_class: 8,
    account_group: '88',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Skattemassiga overavskrivningar pa inventarier utover planmassiga avskrivningar.',
    sru_code: '7380',
  },
  {
    account_number: '8850',
    account_name: 'Periodiseringsfonder',
    account_class: 8,
    account_group: '88',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Avsattning till periodiseringsfond for att jamna ut resultat mellan ar (AB).',
    sru_code: '7380',
  },

  // 89 - Skatter och arets resultat
  {
    account_number: '8910',
    account_name: 'Skatt pa arets resultat',
    account_class: 8,
    account_group: '89',
    account_type: 'expense',
    normal_balance: 'debit',
    description: 'Beraknad inkomstskatt pa det skattepliktiga resultatet for rakenskapsaret.',
    sru_code: '7380',
  },
  {
    account_number: '8999',
    account_name: 'Arets resultat',
    account_class: 8,
    account_group: '89',
    account_type: 'equity',
    normal_balance: 'credit',
    description: 'Slutresultatkonto som visar vinst eller forlust efter alla intakter och kostnader.',
    sru_code: '7380',
  },
]

// ---------------------------------------------------------------------------
// Lookup indexes (lazy-initialized for performance)
// ---------------------------------------------------------------------------

let _byAccountNumber: Map<string, BASReferenceAccount> | null = null
let _byClass: Map<number, BASReferenceAccount[]> | null = null

function getByAccountNumberIndex(): Map<string, BASReferenceAccount> {
  if (!_byAccountNumber) {
    _byAccountNumber = new Map()
    for (const account of BAS_REFERENCE) {
      _byAccountNumber.set(account.account_number, account)
    }
  }
  return _byAccountNumber
}

function getByClassIndex(): Map<number, BASReferenceAccount[]> {
  if (!_byClass) {
    _byClass = new Map()
    for (const account of BAS_REFERENCE) {
      const existing = _byClass.get(account.account_class) ?? []
      existing.push(account)
      _byClass.set(account.account_class, existing)
    }
  }
  return _byClass
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Look up a single BAS reference account by its account number.
 * Returns undefined if the account number is not in the reference data.
 */
export function getBASReference(accountNumber: string): BASReferenceAccount | undefined {
  return getByAccountNumberIndex().get(accountNumber)
}

/**
 * Get all BAS reference accounts for a given account class (1-8).
 * Returns an empty array if the class has no accounts in the reference data.
 */
export function getBASReferenceByClass(accountClass: number): BASReferenceAccount[] {
  return getByClassIndex().get(accountClass) ?? []
}

/**
 * Check whether an account number exists in the BAS reference data.
 * Useful for validating that a user-entered account number is a standard BAS account.
 */
export function isStandardBASAccount(accountNumber: string): boolean {
  return getByAccountNumberIndex().has(accountNumber)
}
