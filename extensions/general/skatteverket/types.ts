/**
 * Skatteverket API types for Momsdeklaration 1.0
 *
 * Field names match Skatteverket's JSON schema exactly.
 * Reference: Tjänstebeskrivning Momsdeklaration v1.5
 */

/** Momsuppgift payload — maps 1:1 to SKV 4700 boxes */
export interface SkatteverketMomsuppgift {
  momspliktigForsaljning?: number       // Box 05
  momspliktigaUttag?: number            // Box 06
  vinstmarginal?: number                // Box 07
  hyresInkomst?: number                 // Box 08
  momsForsaljningUtgaendeHog?: number   // Box 10
  momsForsaljningUtgaendeMedel?: number // Box 11
  momsForsaljningUtgaendeLag?: number   // Box 12
  inkopVarorEU?: number                 // Box 20
  inkopTjansterEU?: number              // Box 21
  inkopTjansterUtanforEU?: number       // Box 22
  inkopVarorSE?: number                 // Box 23
  inkopTjansterSE?: number              // Box 24
  momsInkopUtgaendeHog?: number         // Box 30
  momsInkopUtgaendeMedel?: number       // Box 31
  momsInkopUtgaendeLag?: number         // Box 32
  forsaljningVarorEU?: number           // Box 35
  forsaljningVarorUtanforEU?: number    // Box 36
  inkopVaror3pHandel?: number           // Box 37
  forsaljningVaror3pHandel?: number     // Box 38
  forsaljningTjansterEU?: number        // Box 39
  ovrigForsaljningTjansterUtanforSE?: number // Box 40
  forsaljningBskKopareSE?: number       // Box 41
  momsfriForsaljning?: number           // Box 42
  ingaendeMomsAvdrag?: number           // Box 48
  summaMoms?: number                    // Box 49
  import?: number                       // Box 50
  momsImportUtgaendeHog?: number        // Box 60
  momsImportUtgaendeMedel?: number      // Box 61
  momsImportUtgaendeLag?: number        // Box 62
}

/** Validation result from Skatteverket /kontrollera or /utkast */
export interface SkatteverketKontrollresultat {
  kontroller?: SkatteverketKontroll[]
}

export interface SkatteverketKontroll {
  id: string        // FK001, RK002, etc.
  typ: 'ERROR' | 'WARNING'
  text: string
}

/** Response from saving a draft */
export interface SkatteverketUtkastResponse {
  kontrollresultat?: SkatteverketKontrollresultat
  signeringslank?: string
}

/** Response from fetching submitted declarations */
export interface SkatteverketInlamnatResponse {
  kvittensnummer?: string
  tidpunkt?: string    // ISO 8601 timestamp
  signerare?: string   // Personnummer of signer
}

/** Response from fetching decisions */
export interface SkatteverketBeslutatResponse {
  beslutsdatum?: string
  momsBeslut?: SkatteverketMomsuppgift
}

/** Stored token pair (decrypted form) */
export interface SkatteverketTokens {
  access_token: string
  refresh_token: string | null
  expires_at: number     // Unix timestamp ms
  refresh_count: number
  scope: string
}

/** Declaration submission status tracking */
export type DeclarationStatus =
  | 'draft_saved'
  | 'draft_locked'
  | 'signed'
  | 'decided'

export interface SkatteverketSubmission {
  id: string
  user_id: string
  redovisare: string         // 12-digit org/personnummer
  redovisningsperiod: string // YYYYMM
  status: DeclarationStatus
  kvittensnummer: string | null
  signeringslank: string | null
  kontrollresultat: SkatteverketKontrollresultat | null
  momsuppgift: SkatteverketMomsuppgift
  created_at: string
  updated_at: string
}
