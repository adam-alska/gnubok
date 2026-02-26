// AUTO-GENERATED — do not edit. Run `npm run setup:extensions` to regenerate.
import type { ExtensionDefinition } from '../types'

export const EXTENSION_DEFINITIONS: Record<string, ExtensionDefinition[]> = {
  'general': [
    {
          "slug": "receipt-ocr",
          "name": "Kvittoscanning",
          "sector": "general",
          "category": "import",
          "icon": "Camera",
          "dataPattern": "manual",
          "description": "Skanna kvitton och extrahera data automatiskt",
          "longDescription": "Ladda upp kvittofoton och låt systemet automatiskt extrahera leverantör, belopp, moms och datum. Sparar tid och minskar manuell inmatning.",
          "hasOwnData": true,
          "quickAction": {
                "label": "Skanna kvitto",
                "description": "Fotografera & spara",
                "icon": "Camera",
                "href": "/receipts/scan"
          }
    },
    {
          "slug": "ai-categorization",
          "name": "AI-kategorisering",
          "sector": "general",
          "category": "operations",
          "icon": "Sparkles",
          "dataPattern": "core",
          "description": "AI-drivna kategoriförslag för transaktioner",
          "longDescription": "Använder AI för att automatiskt föreslå BAS-kontokategorier för dina banktransaktioner. Lär sig från dina tidigare bokföringsval.",
          "readsCoreTables": [
                "transactions"
          ]
    },
    {
          "slug": "ai-chat",
          "name": "AI-assistent",
          "sector": "general",
          "category": "operations",
          "icon": "MessageSquare",
          "dataPattern": "manual",
          "description": "AI-assistent för skatte- och bokföringsfrågor",
          "longDescription": "Ställ frågor om skatt, bokföring och företagande till en AI-assistent som förstår svensk redovisning. Svar baserade på aktuella regler och praxis.",
          "hasOwnData": true,
          "quickAction": {
                "label": "AI-assistent",
                "description": "Fråga om bokföring",
                "icon": "MessageSquare",
                "event": "open-ai-chat"
          }
    },
    {
          "slug": "push-notifications",
          "name": "Push-notiser",
          "sector": "general",
          "category": "operations",
          "icon": "Bell",
          "dataPattern": "core",
          "description": "Händelsenotiser för bokföringsaktiviteter",
          "longDescription": "Få push-notiser direkt i webbläsaren när viktiga händelser sker — nya fakturor, förfallna betalningar, slutförda bokföringar med mera.",
          "readsCoreTables": [
                "journal_entries",
                "invoices",
                "receipts"
          ]
    },
    {
          "slug": "invoice-inbox",
          "name": "Dokumentinkorg",
          "sector": "general",
          "category": "import",
          "icon": "Inbox",
          "dataPattern": "manual",
          "description": "Ta emot alla dokument via e-post — fakturor, kvitton och myndighetspost",
          "longDescription": "Skicka alla affärsdokument till en dedikerad e-postadress. AI klassificerar automatiskt dokumenttyp (faktura, kvitto, myndighetspost), extraherar data och matchar mot transaktioner. En inkorg för alla dokument.",
          "hasOwnData": true
    },
    {
          "slug": "calendar",
          "name": "Kalender",
          "sector": "general",
          "category": "operations",
          "icon": "Calendar",
          "dataPattern": "core",
          "description": "Fullstandig kalendervy med manads-, vecko- och dagsvisning",
          "longDescription": "Se alla fakturadatum och deadlines i en interaktiv kalender med manads-, vecko- och dagsvy.",
          "readsCoreTables": [
                "invoices",
                "deadlines",
                "customers"
          ]
    },
    {
          "slug": "enable-banking",
          "name": "Bankintegration (PSD2)",
          "sector": "general",
          "category": "import",
          "icon": "Landmark",
          "dataPattern": "manual",
          "description": "Automatisk banktransaktionssynk via PSD2",
          "longDescription": "Koppla ditt bankkonto direkt och synka transaktioner automatiskt via säker PSD2-bankintegration. Stöder de flesta svenska banker.",
          "hasOwnData": true,
          "subscriptionNotice": "Denna integration kräver ett aktivt Enable Banking-abonnemang. Utan abonnemang kommer bankintegration inte att fungera."
    },
    {
          "slug": "email",
          "name": "E-post (Resend)",
          "sector": "general",
          "category": "operations",
          "icon": "Mail",
          "dataPattern": "core",
          "description": "Skicka fakturor och påminnelser via e-post",
          "longDescription": "Aktiverar e-postfunktioner: skicka fakturor till kunder, automatiska betalningspåminnelser (15/30/45 dagar), och e-postmeddelanden. Kräver ett Resend-konto med verifierad domän.",
          "readsCoreTables": [
                "invoices",
                "customers",
                "company_settings"
          ]
    },
    {
          "slug": "user-description-match",
          "name": "Beskrivningsmatchning",
          "sector": "general",
          "category": "operations",
          "icon": "TextSearch",
          "dataPattern": "core",
          "description": "Matcha transaktioner med egna beskrivningar",
          "longDescription": "Beskriv vad en transaktion gäller med egna ord och få smarta bokföringsförslag. Systemet lär sig av dina beskrivningar och applicerar automatiskt på framtida transaktioner från samma leverantör.",
          "readsCoreTables": [
                "transactions",
                "mapping_rules"
          ]
    },
  ],
}
