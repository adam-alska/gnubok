import { sectors, type ModuleItem, type ModuleCategory, CATEGORY_LABELS } from '@/lib/modules-data'
import type { BusinessProfile, ModuleRecommendation, ModuleRecommendationTier, GroupedRecommendations } from '@/types/onboarding'

// ─── Recommendation rule ───────────────────────────────────────────────
interface RecommendationRule {
  moduleSlug: string
  /** Base score (0-100). Higher = more relevant */
  baseScore: number
  /** Condition that boosts the score if met */
  boostCondition?: (profile: BusinessProfile) => boolean
  /** Amount to boost the score */
  boostAmount?: number
  /** Condition that disqualifies this module */
  excludeCondition?: (profile: BusinessProfile) => boolean
  /** Reason shown to user */
  reason: string
  /** Reason when boosted */
  boostReason?: string
}

// ─── Per-sector rules ──────────────────────────────────────────────────
const sectorRules: Record<string, RecommendationRule[]> = {
  restaurang: [
    { moduleSlug: 'restaurangkontoplan', baseScore: 95, reason: 'Grundläggande kontoplan för restaurang' },
    { moduleSlug: 'momssplit-mat-dryck', baseScore: 90, reason: 'Automatisk momsuppdelning 12%/25%' },
    { moduleSlug: 'dagskassaavstamning', baseScore: 85, reason: 'Daglig kassaavstämning' },
    { moduleSlug: 'tipsbokforing', baseScore: 60, boostCondition: (p) => p.har_anstallda === true, boostAmount: 30, reason: 'Hantera dricks korrekt', boostReason: 'Viktigt med anställda som får dricks' },
    { moduleSlug: 'personalliggare', baseScore: 50, boostCondition: (p) => p.har_anstallda === true, boostAmount: 40, reason: 'Krav från Skatteverket', boostReason: 'Obligatoriskt med anställda' },
    { moduleSlug: 'alkoholpunktskatt', baseScore: 30, boostCondition: (p) => p.har_alkoholtillstand === true, boostAmount: 50, reason: 'Punktskattehantering', boostReason: 'Krävs vid alkoholtillstånd' },
    { moduleSlug: 'representationsbokforing', baseScore: 40, reason: 'Bokför representation korrekt' },
    { moduleSlug: 'matkostnad', baseScore: 80, reason: 'Spåra food cost över tid' },
    { moduleSlug: 'personalkostnad-vs-omsattning', baseScore: 60, boostCondition: (p) => p.har_anstallda === true, boostAmount: 25, reason: 'Analysera personalkostnader' },
    { moduleSlug: 'svinnrapport', baseScore: 65, reason: 'Analysera matsvinn' },
    { moduleSlug: 'z-rapport-import', baseScore: 70, boostCondition: (p) => p.kassasystem !== 'inget' && p.kassasystem !== undefined, boostAmount: 25, reason: 'Importera dagskassarapporter', boostReason: 'Import från ert kassasystem' },
    { moduleSlug: 'leverantorsfaktura-import', baseScore: 70, reason: 'Importera leverantörsfakturor' },
    { moduleSlug: 'menyhantering', baseScore: 50, reason: 'Digital menyhantering' },
    { moduleSlug: 'bordsbokning', baseScore: 40, boostCondition: (p) => p.har_bordsbokning === true, boostAmount: 45, reason: 'Bordsreservationer', boostReason: 'Ni tar emot bokningar' },
    { moduleSlug: 'receptkalkyl', baseScore: 55, reason: 'Beräkna kostnad per rätt' },
    { moduleSlug: 'personalschema', baseScore: 40, boostCondition: (p) => p.har_anstallda === true, boostAmount: 40, reason: 'Schemaplanering', boostReason: 'Schemaläggning för personal' },
    { moduleSlug: 'leverantorsbestallning', baseScore: 45, reason: 'Beställ varor till leverantörer' },
    { moduleSlug: 'revpash', baseScore: 35, reason: 'Intäkt per stolstimme' },
  ],

  bygg: [
    { moduleSlug: 'byggkontoplan', baseScore: 95, reason: 'Grundläggande kontoplan för bygg' },
    { moduleSlug: 'omvand-skattskyldighet-bygg', baseScore: 90, reason: 'Obligatorisk omvänd moms inom bygg' },
    { moduleSlug: 'rot-avdrag', baseScore: 50, boostCondition: (p) => p.har_rot_avdrag === true, boostAmount: 45, reason: 'ROT-avdrag', boostReason: 'Ni utför ROT-arbeten' },
    { moduleSlug: 'successiv-vinstavrakning', baseScore: 60, boostCondition: (p) => p.projektbaserat === true, boostAmount: 30, reason: 'Projektintäktsredovisning', boostReason: 'Viktigt för projektbaserat arbete' },
    { moduleSlug: 'ue-attestering', baseScore: 40, boostCondition: (p) => p.har_underentreprenorer === true, boostAmount: 50, reason: 'UE-fakturakontroll', boostReason: 'Ni anlitar underentreprenörer' },
    { moduleSlug: 'personalliggare-bygg', baseScore: 50, boostCondition: (p) => p.har_anstallda === true, boostAmount: 40, reason: 'Personalliggare för byggarbetsplats', boostReason: 'Obligatoriskt med anställda på byggarbetsplats' },
    { moduleSlug: 'ata-bokforing', baseScore: 40, boostCondition: (p) => p.har_ata === true, boostAmount: 45, reason: 'ÄTA-hantering', boostReason: 'Ni hanterar ÄTA-arbeten' },
    { moduleSlug: 'projektmarginal', baseScore: 80, reason: 'Följa projektmarginaler' },
    { moduleSlug: 'ata-analys', baseScore: 35, boostCondition: (p) => p.har_ata === true, boostAmount: 40, reason: 'Analysera ÄTA', boostReason: 'ÄTA-analys för era projekt' },
    { moduleSlug: 'likviditet-per-projekt', baseScore: 70, reason: 'Kassaflöde per projekt' },
    { moduleSlug: 'ue-fakturaimport', baseScore: 40, boostCondition: (p) => p.har_underentreprenorer === true, boostAmount: 45, reason: 'Importera UE-fakturor', boostReason: 'Automatisk import av UE-fakturor' },
    { moduleSlug: 'materialkostnadsimport', baseScore: 60, reason: 'Importera materialinköp' },
    { moduleSlug: 'projektkalkyl', baseScore: 75, boostCondition: (p) => p.projektbaserat === true, boostAmount: 15, reason: 'Projektkalkyl för anbud' },
    { moduleSlug: 'ata-hantering', baseScore: 35, boostCondition: (p) => p.har_ata === true, boostAmount: 45, reason: 'Operativ ÄTA-hantering' },
    { moduleSlug: 'byggdagbok', baseScore: 55, reason: 'Digital byggdagbok' },
    { moduleSlug: 'ritningshantering', baseScore: 40, reason: 'Versionshantering av ritningar' },
    { moduleSlug: 'materialbestallning', baseScore: 50, reason: 'Beställ och spåra material' },
  ],

  ehandel: [
    { moduleSlug: 'ehandelskontoplan', baseScore: 95, reason: 'Kontoplan för e-handel' },
    { moduleSlug: 'lagervardering-ehandel', baseScore: 80, reason: 'Lagervärdering för bokslut' },
    { moduleSlug: 'returbokforing', baseScore: 60, boostCondition: (p) => p.hanterar_returer === true, boostAmount: 30, reason: 'Bokför returer', boostReason: 'Ni hanterar returer regelbundet' },
    { moduleSlug: 'multi-currency', baseScore: 40, boostCondition: (p) => p.eu_forsaljning === true, boostAmount: 45, reason: 'Hantera utländsk valuta', boostReason: 'För EU-försäljning' },
    { moduleSlug: 'eu-moms-oss', baseScore: 35, boostCondition: (p) => p.eu_forsaljning === true, boostAmount: 55, reason: 'EU-moms (OSS)', boostReason: 'Obligatoriskt vid EU-försäljning' },
    { moduleSlug: 'plattformsavgifter', baseScore: 80, reason: 'Bokför Shopify/Stripe/Klarna-avgifter' },
    { moduleSlug: 'returprocent', baseScore: 55, boostCondition: (p) => p.hanterar_returer === true, boostAmount: 25, reason: 'Analysera returer' },
    { moduleSlug: 'genomsnittligt-ordervarde', baseScore: 70, reason: 'Snittordervärde' },
    { moduleSlug: 'kanalfordelning', baseScore: 65, reason: 'Försäljning per kanal' },
    { moduleSlug: 'fraktkostnad-vs-intakt', baseScore: 60, reason: 'Fraktanalys' },
    { moduleSlug: 'shopify-woo-import', baseScore: 60, boostCondition: (p) => p.ehandels_plattform === 'shopify' || p.ehandels_plattform === 'woocommerce', boostAmount: 35, reason: 'Importera ordrar', boostReason: 'Import från er plattform' },
    { moduleSlug: 'klarna-rapport-import', baseScore: 50, boostCondition: (p) => Array.isArray(p.betalsatt) && p.betalsatt.includes('klarna'), boostAmount: 40, reason: 'Klarna-import', boostReason: 'Ni använder Klarna' },
    { moduleSlug: 'fraktrapport-import', baseScore: 55, reason: 'Importera fraktkostnader' },
    { moduleSlug: 'orderhantering', baseScore: 75, reason: 'Central ordervy' },
    { moduleSlug: 'frakthantering', baseScore: 60, reason: 'Hantera frakt' },
    { moduleSlug: 'returhantering-operativ', baseScore: 45, boostCondition: (p) => p.hanterar_returer === true, boostAmount: 35, reason: 'Returhantering', boostReason: 'Ni hanterar returer' },
    { moduleSlug: 'produktdatahantering', baseScore: 50, reason: 'Central produktinformation' },
  ],

  tech: [
    { moduleSlug: 'it-kontoplan', baseScore: 95, reason: 'Kontoplan för IT/tech' },
    { moduleSlug: 'projektredovisning', baseScore: 75, boostCondition: (p) => p.har_konsultverksamhet === true, boostAmount: 20, reason: 'Projektredovisning', boostReason: 'För era kundprojekt' },
    { moduleSlug: 'fou-avdrag', baseScore: 40, boostCondition: (p) => p.har_fou === true, boostAmount: 50, reason: 'FoU-avdrag', boostReason: 'Nedsättning av arbetsgivaravgifter för FoU' },
    { moduleSlug: 'licensavskrivning', baseScore: 50, reason: 'Avskrivning av mjukvarulicenser' },
    { moduleSlug: 'eu-tjanstmoms', baseScore: 35, boostCondition: (p) => p.eu_forsaljning === true, boostAmount: 50, reason: 'EU-tjänstemoms', boostReason: 'Omvänd moms vid EU-försäljning' },
    { moduleSlug: 'debiteringsgrad', baseScore: 60, boostCondition: (p) => p.har_konsultverksamhet === true, boostAmount: 30, reason: 'Debiteringsgrad', boostReason: 'Viktigt för konsultverksamhet' },
    { moduleSlug: 'projektlonsamhet', baseScore: 70, reason: 'Projektlönsamhet' },
    { moduleSlug: 'mrr-arr', baseScore: 40, boostCondition: (p) => p.har_saas === true, boostAmount: 50, reason: 'MRR/ARR', boostReason: 'Följ er SaaS-tjänst' },
    { moduleSlug: 'tidrapport-import', baseScore: 65, reason: 'Importera tidrapporter' },
    { moduleSlug: 'projekthantering', baseScore: 80, reason: 'Projektöverblick' },
    { moduleSlug: 'tidrapportering', baseScore: 75, reason: 'Tidrapportering per projekt' },
    { moduleSlug: 'arendehantering', baseScore: 50, boostCondition: (p) => p.har_saas === true, boostAmount: 30, reason: 'Ärendehantering', boostReason: 'Kundsupport för er SaaS' },
    { moduleSlug: 'resursplanering', baseScore: 55, reason: 'Allokera personal till projekt' },
  ],

  detaljhandel: [
    { moduleSlug: 'detaljhandelskontoplan', baseScore: 95, reason: 'Kontoplan för detaljhandel' },
    { moduleSlug: 'lagervardering', baseScore: 80, boostCondition: (p) => p.har_lager === true, boostAmount: 15, reason: 'Lagervärdering', boostReason: 'Ni har fysiskt lager' },
    { moduleSlug: 'kassaavstamning-butik', baseScore: 85, reason: 'Daglig kassaavstämning' },
    { moduleSlug: 'svinnbokforing', baseScore: 60, reason: 'Svinnbokföring' },
    { moduleSlug: 'personalliggare-butik', baseScore: 40, boostCondition: (p) => p.har_livsmedel === true, boostAmount: 50, reason: 'Personalliggare', boostReason: 'Obligatoriskt för livsmedelsbutik' },
    { moduleSlug: 'bruttomarginal-per-varugrupp', baseScore: 75, reason: 'Bruttomarginaler' },
    { moduleSlug: 'lageromsattningshastighet', baseScore: 65, boostCondition: (p) => p.har_lager === true, boostAmount: 15, reason: 'Lageromsättning' },
    { moduleSlug: 'svinnprocent', baseScore: 55, reason: 'Svinnanalys' },
    { moduleSlug: 'forsaljning-per-m2', baseScore: 45, reason: 'Butikseffektivitet' },
    { moduleSlug: 'pos-z-rapport-import', baseScore: 70, boostCondition: (p) => p.kassasystem !== 'inget' && p.kassasystem !== undefined, boostAmount: 25, reason: 'POS-import', boostReason: 'Import från ert kassasystem' },
    { moduleSlug: 'inventeringsimport', baseScore: 50, boostCondition: (p) => p.har_lager === true, boostAmount: 20, reason: 'Inventeringsimport' },
    { moduleSlug: 'leverantorsfaktura-import-butik', baseScore: 65, reason: 'Leverantörsfakturor' },
    { moduleSlug: 'lagerhantering', baseScore: 60, boostCondition: (p) => p.har_lager === true, boostAmount: 30, reason: 'Lagerhantering', boostReason: 'Ni har fysiskt lager' },
    { moduleSlug: 'kampanjer-rabatter', baseScore: 45, reason: 'Kampanjer och erbjudanden' },
    { moduleSlug: 'kundklubb', baseScore: 35, reason: 'Lojalitetsprogram' },
    { moduleSlug: 'prishantering', baseScore: 60, reason: 'Centraliserad prissattning' },
    { moduleSlug: 'butiksdrift-schema', baseScore: 40, reason: 'Bemanning och öppettider' },
  ],

  frisor: [
    { moduleSlug: 'salongkontoplan', baseScore: 95, reason: 'Kontoplan för salong' },
    { moduleSlug: 'provisionsberakning', baseScore: 60, boostCondition: (p) => p.har_hyrstol === true, boostAmount: 30, reason: 'Provisionsberäkning', boostReason: 'Beräkna provision per stilist' },
    { moduleSlug: 'presentkort-som-skuld', baseScore: 40, boostCondition: (p) => p.har_presentkort === true, boostAmount: 50, reason: 'Presentkort', boostReason: 'Ni säljer presentkort' },
    { moduleSlug: 'kassaavstamning-salong', baseScore: 80, reason: 'Daglig kassaavstämning' },
    { moduleSlug: 'personalliggare-salong', baseScore: 85, reason: 'Personalliggare (krav Skatteverket)' },
    { moduleSlug: 'intakt-per-stol', baseScore: 65, reason: 'Intäkt per arbetsstation' },
    { moduleSlug: 'provisionsandel', baseScore: 50, boostCondition: (p) => p.har_hyrstol === true, boostAmount: 25, reason: 'Provisionsanalys' },
    { moduleSlug: 'produktforsaljning-per-besok', baseScore: 45, boostCondition: (p) => p.saljer_produkter === true, boostAmount: 30, reason: 'Produktförsäljning', boostReason: 'Ni säljer hårprodukter' },
    { moduleSlug: 'kassarapport-import-salong', baseScore: 70, reason: 'Kassarapport-import' },
    { moduleSlug: 'bokningssystem-import', baseScore: 50, boostCondition: (p) => p.bokningssystem !== 'inget' && p.bokningssystem !== undefined, boostAmount: 35, reason: 'Bokningssystem-import', boostReason: 'Import från ert bokningssystem' },
    { moduleSlug: 'tidsbokning', baseScore: 75, reason: 'Tidsbokning' },
    { moduleSlug: 'kundkort', baseScore: 65, reason: 'Kundprofiler med historik' },
    { moduleSlug: 'sms-paminnelser', baseScore: 55, reason: 'Automatiska påminnelser' },
    { moduleSlug: 'skiftschema-salong', baseScore: 45, reason: 'Personalschema' },
  ],

  konsult: [
    { moduleSlug: 'konsultkontoplan', baseScore: 95, reason: 'Kontoplan för konsult' },
    { moduleSlug: 'traktamente', baseScore: 40, boostCondition: (p) => p.har_resor === true, boostAmount: 45, reason: 'Traktamente', boostReason: 'Ni reser i tjänsten' },
    { moduleSlug: 'hemmakontor-avdrag', baseScore: 60, reason: 'Hemmakontorsavdrag' },
    { moduleSlug: 'wip-bevakning-konsult', baseScore: 50, boostCondition: (p) => p.har_wip === true, boostAmount: 40, reason: 'WIP-bevakning', boostReason: 'Ni har pågående ofakturerat arbete' },
    { moduleSlug: 'debiteringsgrad-konsult', baseScore: 75, boostCondition: (p) => p.timbaserat === true, boostAmount: 15, reason: 'Debiteringsgrad', boostReason: 'Viktigt vid timbaserat arbete' },
    { moduleSlug: 'intakt-per-konsult', baseScore: 65, reason: 'Fakturering per konsult' },
    { moduleSlug: 'tidrapport-import-konsult', baseScore: 60, reason: 'Importera tidrapporter' },
    { moduleSlug: 'uppdragshantering-konsult', baseScore: 80, reason: 'Hantera kunduppdrag' },
    { moduleSlug: 'tidrapportering-konsult', baseScore: 85, boostCondition: (p) => p.timbaserat === true, boostAmount: 10, reason: 'Tidrapportering', boostReason: 'Grundläggande för timbaserat arbete' },
    { moduleSlug: 'offert-avtal', baseScore: 70, reason: 'Offerter och avtal' },
  ],

  transport: [
    { moduleSlug: 'transportkontoplan', baseScore: 95, reason: 'Kontoplan för transport' },
    { moduleSlug: 'fordonsavskrivning', baseScore: 60, boostCondition: (p) => p.egna_fordon === true, boostAmount: 30, reason: 'Fordonsavskrivning', boostReason: 'Avskrivning av era egna fordon' },
    { moduleSlug: 'leasinghantering', baseScore: 50, reason: 'Hantera leasingfordon' },
    { moduleSlug: 'trangselskatt', baseScore: 60, reason: 'Bokför trängselskatt' },
    { moduleSlug: 'milersattning-vs-faktisk-kostnad', baseScore: 70, reason: 'Milersättning vs verklig kostnad' },
    { moduleSlug: 'kostnad-per-mil', baseScore: 75, boostCondition: (p) => p.egna_fordon === true, boostAmount: 15, reason: 'Kostnad per mil' },
    { moduleSlug: 'intakt-per-fordon', baseScore: 65, boostCondition: (p) => p.egna_fordon === true, boostAmount: 20, reason: 'Intäkt per fordon' },
    { moduleSlug: 'bransleeffektivitet', baseScore: 55, reason: 'Bränsleförbrukning' },
    { moduleSlug: 'branslekort-import', baseScore: 50, boostCondition: (p) => p.har_branslekort === true, boostAmount: 40, reason: 'Bränslekortsimport', boostReason: 'Import från era bränslekort' },
    { moduleSlug: 'vagtulls-import', baseScore: 45, reason: 'Importera trängselskatt' },
    { moduleSlug: 'flottahantering', baseScore: 60, boostCondition: (p) => p.egna_fordon === true, boostAmount: 25, reason: 'Flottöversikt', boostReason: 'Överblick av ert fordonsbestånd' },
    { moduleSlug: 'ruttplanering', baseScore: 40, boostCondition: (p) => p.har_leveranser === true, boostAmount: 40, reason: 'Ruttoptimering', boostReason: 'Optimera leveransrutter' },
    { moduleSlug: 'leveranssparning', baseScore: 35, boostCondition: (p) => p.har_leveranser === true, boostAmount: 45, reason: 'Leveransspårning', boostReason: 'Spåra leveranser' },
    { moduleSlug: 'fordonsunderhall', baseScore: 55, boostCondition: (p) => p.egna_fordon === true, boostAmount: 20, reason: 'Fordonsunderhåll' },
    { moduleSlug: 'chauforshantering', baseScore: 40, boostCondition: (p) => p.har_forare === true, boostAmount: 40, reason: 'Chaufförshantering', boostReason: 'Hantera förare' },
    { moduleSlug: 'fraktsedlar-dokument', baseScore: 50, reason: 'Fraktdokument' },
  ],

  halsa: [
    { moduleSlug: 'vardkontoplan', baseScore: 95, reason: 'Kontoplan för vård' },
    { moduleSlug: 'momsfrihet-sjukvard', baseScore: 85, reason: 'Momsfria vårdtjänster' },
    { moduleSlug: 'forsakringsersattning', baseScore: 50, boostCondition: (p) => p.forsakringspatienter === true, boostAmount: 40, reason: 'Försäkringsersättning', boostReason: 'Ni tar emot försäkringspatienter' },
    { moduleSlug: 'frikort-hogkostnadsskydd', baseScore: 60, reason: 'Frikort och högkostnadsskydd' },
    { moduleSlug: 'intakt-per-behandlare', baseScore: 70, reason: 'Intäkt per behandlare' },
    { moduleSlug: 'patientmix', baseScore: 55, reason: 'Analysera patientfördelning' },
    { moduleSlug: 'regionersattningsimport', baseScore: 45, boostCondition: (p) => p.regionavtal === true, boostAmount: 45, reason: 'Regionersattning', boostReason: 'Import av regionens utbetalningar' },
    { moduleSlug: 'forsakringsrapport-import', baseScore: 40, boostCondition: (p) => p.forsakringspatienter === true, boostAmount: 40, reason: 'Försäkringsrapporter', boostReason: 'Import för försäkringspatienter' },
    { moduleSlug: 'patientbokning', baseScore: 80, reason: 'Patientbokning' },
    { moduleSlug: 'journalhantering', baseScore: 60, boostCondition: (p) => p.journalsystem !== 'journal_digital', boostAmount: 20, reason: 'Journalhantering' },
    { moduleSlug: 'remisshantering', baseScore: 45, reason: 'Remisser' },
    { moduleSlug: 'kassasystem-patientavgifter', baseScore: 65, boostCondition: (p) => p.privatpraktik === true, boostAmount: 15, reason: 'Patientavgifter', boostReason: 'För er privatpraktik' },
  ],

  juridik: [
    { moduleSlug: 'juristkontoplan', baseScore: 95, reason: 'Kontoplan för juristfirma' },
    { moduleSlug: 'klientmedelskonto', baseScore: 50, boostCondition: (p) => p.har_klientmedel === true, boostAmount: 45, reason: 'Klientmedelskonto', boostReason: 'Ni hanterar klientmedel' },
    { moduleSlug: 'wip-vardering', baseScore: 50, boostCondition: (p) => p.har_wip === true, boostAmount: 40, reason: 'WIP-värdering', boostReason: 'För pågående ofakturerat arbete' },
    { moduleSlug: 'a-conto-bokforing', baseScore: 55, reason: 'A conto-fakturering' },
    { moduleSlug: 'debiteringsgrad-juridik', baseScore: 80, reason: 'Debiteringsgrad' },
    { moduleSlug: 'realisationsgrad', baseScore: 65, reason: 'Realisationsgrad' },
    { moduleSlug: 'genomsnittlig-timintakt', baseScore: 70, reason: 'Timintakt' },
    { moduleSlug: 'wip-rapport', baseScore: 45, boostCondition: (p) => p.har_wip === true, boostAmount: 35, reason: 'WIP-rapport', boostReason: 'WIP-rapport med åldringsanalys' },
    { moduleSlug: 'tidrapport-import-juridik', baseScore: 55, boostCondition: (p) => p.tidrapporteringssystem !== 'inget' && p.tidrapporteringssystem !== undefined, boostAmount: 30, reason: 'Tidrapport-import', boostReason: 'Import från ert system' },
    { moduleSlug: 'arendehantering-juridik', baseScore: 80, reason: 'Ärendehantering' },
    { moduleSlug: 'tidrapportering-juridik', baseScore: 85, reason: 'Tidrapportering per ärende' },
    { moduleSlug: 'dokumenthantering', baseScore: 70, reason: 'Dokumenthantering' },
    { moduleSlug: 'deadlinebevakning', baseScore: 75, reason: 'Deadlines och påminnelser' },
    { moduleSlug: 'intressekonfliktskontroll', baseScore: 40, boostCondition: (p) => p.har_intressekontroll === true, boostAmount: 50, reason: 'Intressekonfliktskontroll', boostReason: 'Ni behöver intressekonfliktskontroll' },
  ],
}

// ─── Helper: assign tier based on score ────────────────────────────────
function assignTier(score: number): ModuleRecommendationTier {
  if (score >= 75) return 'recommended'
  if (score >= 45) return 'optional'
  return 'advanced'
}

// ─── Main recommendation function ──────────────────────────────────────
export function getRecommendedModules(
  sectorSlug: string,
  businessProfile: BusinessProfile
): ModuleRecommendation[] {
  const sector = sectors.find(s => s.slug === sectorSlug)
  if (!sector) return []

  const rules = sectorRules[sectorSlug]

  // If no rules defined for this sector, return all modules with default scoring
  if (!rules) {
    return sector.modules.map((mod, idx) => ({
      moduleSlug: mod.slug,
      sectorSlug,
      relevanceScore: idx < 5 ? 80 : idx < 10 ? 55 : 35,
      reason: mod.desc,
      tier: idx < 5 ? 'recommended' as const : idx < 10 ? 'optional' as const : 'advanced' as const,
      category: mod.cat,
      moduleName: mod.name,
      moduleDesc: mod.desc,
    }))
  }

  // Build a map of module slugs in this sector for quick lookups
  const sectorModuleMap = new Map<string, ModuleItem>()
  for (const mod of sector.modules) {
    sectorModuleMap.set(mod.slug, mod)
  }

  const recommendations: ModuleRecommendation[] = []

  for (const rule of rules) {
    const mod = sectorModuleMap.get(rule.moduleSlug)
    if (!mod) continue

    // Check exclude condition
    if (rule.excludeCondition && rule.excludeCondition(businessProfile)) {
      continue
    }

    let score = rule.baseScore
    let reason = rule.reason

    // Check boost condition
    if (rule.boostCondition && rule.boostCondition(businessProfile)) {
      score += (rule.boostAmount || 0)
      if (rule.boostReason) reason = rule.boostReason
    }

    // Cap score at 100
    score = Math.min(score, 100)

    recommendations.push({
      moduleSlug: rule.moduleSlug,
      sectorSlug,
      relevanceScore: score,
      reason,
      tier: assignTier(score),
      category: mod.cat,
      moduleName: mod.name,
      moduleDesc: mod.desc,
    })
  }

  // Sort by score descending
  recommendations.sort((a, b) => b.relevanceScore - a.relevanceScore)

  return recommendations
}

// ─── Group recommendations by category ─────────────────────────────────
export function groupRecommendationsByCategory(
  recommendations: ModuleRecommendation[]
): GroupedRecommendations {
  const grouped: GroupedRecommendations = {
    bokforing: [],
    rapport: [],
    import: [],
    operativ: [],
  }

  for (const rec of recommendations) {
    grouped[rec.category].push(rec)
  }

  return grouped
}

// ─── Get category label ────────────────────────────────────────────────
export function getCategoryLabel(category: ModuleCategory): string {
  return CATEGORY_LABELS[category]
}
