/**
 * Momsdeklaration box mapping for Swedish VAT returns.
 *
 * Maps BAS revenue accounts to the correct box (ruta) in the
 * momsdeklaration filed with Skatteverket. Used by:
 * - Export VAT Monitor (full box overview)
 * - EU Sales List (cross-validation against box 35/39)
 *
 * Reference: Skatteverket momsdeklaration (SKV 4700)
 * https://www.skatteverket.se/foretag/moms/deklareramoms/fyllaimomsdeklarationen
 */

/** Momsdeklaration box number */
export type MomsBox =
  | '05'  // Momspliktig forsaljning (taxable sales)
  | '06'  // Momspliktiga uttag (taxable withdrawals)
  | '07'  // Vinstmarginalbeskattning (margin scheme)
  | '08'  // Hyresinkomster frivillig beskattning (rental)
  | '10'  // Utgaende moms 25%
  | '11'  // Utgaende moms 12%
  | '12'  // Utgaende moms 6%
  | '20'  // Inkop varor fran EU
  | '21'  // Inkop tjanster fran EU
  | '22'  // Inkop tjanster utanfor EU
  | '23'  // Inkop varor Sverige omvand skattskyldighet
  | '24'  // Inkop tjanster Sverige omvand skattskyldighet
  | '30'  // Utgaende moms inkop 25%
  | '31'  // Utgaende moms inkop 12%
  | '32'  // Utgaende moms inkop 6%
  | '35'  // Varuforssaljning till annat EU-land
  | '36'  // Varuforssaljning utanfor EU (export)
  | '37'  // Mellanmans inkop trepartshandel
  | '38'  // Mellanmans forsaljning trepartshandel
  | '39'  // Tjansteforssaljning EU (huvudregeln)
  | '40'  // Ovrig forsaljning av tjanster utomlands
  | '41'  // Forsaljning omvand skattskyldighet Sverige
  | '42'  // Ovrig forsaljning m.m.
  | '48'  // Ingaende moms att dra av
  | '49'  // Moms att betala eller fa tillbaka
  | '50'  // Importbeskattningsunderlag
  | '60'  // Importmoms 25%
  | '61'  // Importmoms 12%
  | '62'  // Importmoms 6%

/** Map BAS revenue account to momsdeklaration box */
export const ACCOUNT_TO_BOX: Record<string, MomsBox> = {
  // Domestic revenue (taxable) → Box 05
  '3001': '05',  // Forsaljning varor/tjanster 25%
  '3002': '05',  // Forsaljning varor/tjanster 12%
  '3003': '05',  // Forsaljning varor/tjanster 6%

  // EU goods (reverse charge, VAT-free) → Box 35
  '3108': '35',  // Forsaljning varor till annat EU-land
  '3521': '35',  // Fakturerade frakter EU (follows goods treatment)

  // Non-EU goods export (zero-rated) → Box 36
  '3105': '36',  // Forsaljning varor export utanfor EU
  '3522': '36',  // Fakturerade frakter export

  // Triangular trade → Box 38
  '3109': '38',  // Mellanmans forsaljning trepartshandel

  // EU services (reverse charge, main rule) → Box 39
  '3308': '39',  // Forsaljning tjanster EU

  // Non-EU services → Box 40
  '3305': '40',  // Forsaljning tjanster export utanfor EU

  // Output VAT → Boxes 10, 11, 12
  '2611': '10',  // Utgaende moms 25%
  '2621': '11',  // Utgaende moms 12%
  '2631': '12',  // Utgaende moms 6%

  // Input VAT → Box 48
  '2641': '48',  // Ingaende moms
  '2645': '48',  // Beraknad ingaende moms (EU forvarv)
}

/** Swedish labels for each momsdeklaration box */
export const BOX_LABELS: Record<MomsBox, string> = {
  '05': 'Momspliktig försäljning',
  '06': 'Momspliktiga uttag',
  '07': 'Vinstmarginalbeskattning',
  '08': 'Hyresinkomster (frivillig beskattning)',
  '10': 'Utgående moms 25%',
  '11': 'Utgående moms 12%',
  '12': 'Utgående moms 6%',
  '20': 'Inköp varor från EU',
  '21': 'Inköp tjänster från EU',
  '22': 'Inköp tjänster utanför EU',
  '23': 'Inköp varor Sverige (omvänd skattskyldighet)',
  '24': 'Inköp tjänster Sverige (omvänd skattskyldighet)',
  '30': 'Utgående moms på inköp 25%',
  '31': 'Utgående moms på inköp 12%',
  '32': 'Utgående moms på inköp 6%',
  '35': 'Varuförsäljning till annat EU-land',
  '36': 'Varuförsäljning utanför EU (export)',
  '37': 'Mellanmans inköp vid trepartshandel',
  '38': 'Mellanmans försäljning vid trepartshandel',
  '39': 'Tjänsteförsäljning till EU (huvudregeln)',
  '40': 'Övrig försäljning av tjänster utomlands',
  '41': 'Försäljning med omvänd skattskyldighet (Sverige)',
  '42': 'Övrig försäljning m.m.',
  '48': 'Ingående moms att dra av',
  '49': 'Moms att betala eller få tillbaka',
  '50': 'Beskattningsunderlag vid import',
  '60': 'Importmoms 25%',
  '61': 'Importmoms 12%',
  '62': 'Importmoms 6%',
}

/** Get the momsdeklaration box for a BAS account number */
export function getBoxForAccount(accountNumber: string): MomsBox | undefined {
  return ACCOUNT_TO_BOX[accountNumber]
}

/** Get the Swedish label for a momsdeklaration box */
export function getBoxLabel(box: MomsBox): string {
  return BOX_LABELS[box]
}

/** Boxes that represent VAT-exempt export/EU sales (no output VAT) */
export const EXPORT_BOXES: MomsBox[] = ['35', '36', '38', '39', '40']

/** Boxes that represent taxable domestic sales (have output VAT) */
export const DOMESTIC_BOXES: MomsBox[] = ['05', '06', '07', '08']

/** Boxes that represent output VAT */
export const OUTPUT_VAT_BOXES: MomsBox[] = ['10', '11', '12']

/** Boxes that represent input VAT */
export const INPUT_VAT_BOXES: MomsBox[] = ['48']
