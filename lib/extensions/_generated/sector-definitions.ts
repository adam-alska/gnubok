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
          "dataPattern": "both",
          "description": "AI-assistent för skatte- och bokföringsfrågor med tillgång till din data",
          "longDescription": "Ställ frågor om skatt, bokföring och företagande till en AI-assistent som förstår svensk redovisning. Kan hämta och visualisera din bokföringsdata — fakturor, transaktioner, resultaträkning, balansräkning och mer.",
          "readsCoreTables": [
                "invoices",
                "supplier_invoices",
                "transactions",
                "journal_entries",
                "journal_entry_lines",
                "fiscal_periods",
                "company_settings",
                "customers",
                "suppliers",
                "chart_of_accounts"
          ],
          "hasOwnData": true,
          "quickAction": {
                "label": "AI-assistent",
                "description": "Fråga om bokföring",
                "icon": "MessageSquare",
                "event": "open-ai-chat"
          }
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
