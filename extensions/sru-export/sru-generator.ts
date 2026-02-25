/**
 * Re-export from core. SRU generic generator now lives in lib/reports/sru-export/sru-generic-generator.ts.
 */
export {
  type SRUFormType,
  type GenericSRUParams,
  SRU_CODE_DESCRIPTIONS,
  generateGenericSRU,
  getGenericSRUFilename,
  sruFileToString,
  validateSRUFile,
} from '@/lib/reports/sru-export/sru-generic-generator'
