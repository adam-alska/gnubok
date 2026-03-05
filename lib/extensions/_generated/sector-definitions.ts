// AUTO-GENERATED — do not edit. Run `npm run setup:extensions` to regenerate.
import type { ExtensionDefinition } from '../types'

export const EXTENSION_DEFINITIONS: Record<string, ExtensionDefinition[]> = {
  'general': [
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
  ],
}
