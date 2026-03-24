import type { VatDeclarationRutor } from '@/types'
import type { SkatteverketMomsuppgift } from '../types'

// Re-export shared formatting utilities
export { formatRedovisare, formatRedovisningsperiod } from '@/lib/skatteverket/format'

/**
 * Convert gnubok VatDeclarationRutor to Skatteverket's momsuppgift payload.
 *
 * Fields with value 0 are omitted (Skatteverket treats absent fields as 0).
 * This keeps the payload clean and avoids sending unnecessary data.
 */
export function rutorToMomsuppgift(rutor: VatDeclarationRutor): SkatteverketMomsuppgift {
  const result: SkatteverketMomsuppgift = {}

  // Helper: only set non-zero values, rounded to whole kronor (SKV expects integers)
  const set = (key: keyof SkatteverketMomsuppgift, value: number) => {
    if (value !== 0) result[key] = Math.round(value)
  }

  // Taxable sales basis
  set('momspliktigForsaljning', rutor.ruta05)
  set('momspliktigaUttag', rutor.ruta06)
  set('vinstmarginal', rutor.ruta07)
  set('hyresInkomst', rutor.ruta08)

  // Output VAT on sales
  set('momsForsaljningUtgaendeHog', rutor.ruta10)
  set('momsForsaljningUtgaendeMedel', rutor.ruta11)
  set('momsForsaljningUtgaendeLag', rutor.ruta12)

  // Reverse charge purchase bases
  set('inkopVarorEU', rutor.ruta20)
  set('inkopTjansterEU', rutor.ruta21)
  set('inkopTjansterUtanforEU', rutor.ruta22)
  set('inkopVarorSE', rutor.ruta23)
  set('inkopTjansterSE', rutor.ruta24)

  // Output VAT on reverse charge purchases
  set('momsInkopUtgaendeHog', rutor.ruta30)
  set('momsInkopUtgaendeMedel', rutor.ruta31)
  set('momsInkopUtgaendeLag', rutor.ruta32)

  // EU/export sales
  set('forsaljningVarorEU', rutor.ruta35)
  set('forsaljningVarorUtanforEU', rutor.ruta36)
  set('inkopVaror3pHandel', rutor.ruta37)
  set('forsaljningVaror3pHandel', rutor.ruta38)
  set('forsaljningTjansterEU', rutor.ruta39)
  set('ovrigForsaljningTjansterUtanforSE', rutor.ruta40)
  set('forsaljningBskKopareSE', rutor.ruta41)
  set('momsfriForsaljning', rutor.ruta42)

  // Input VAT
  set('ingaendeMomsAvdrag', rutor.ruta48)

  // Net VAT (must always be present, whole kronor)
  result.summaMoms = Math.round(rutor.ruta49)

  // Import
  set('import', rutor.ruta50)
  set('momsImportUtgaendeHog', rutor.ruta60)
  set('momsImportUtgaendeMedel', rutor.ruta61)
  set('momsImportUtgaendeLag', rutor.ruta62)

  return result
}

