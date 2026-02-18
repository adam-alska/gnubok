import type { ComponentType } from 'react'
import type { ModuleItem } from '@/lib/modules-data'

export interface ModuleWorkspaceProps {
  module: ModuleItem
  sectorSlug: string
  settingsHref: string
}

type WorkspaceComponent = ComponentType<ModuleWorkspaceProps>

// Registry: maps "sector/slug" → workspace component
const registry: Record<string, WorkspaceComponent> = {}

export function registerWorkspace(sector: string, slug: string, component: WorkspaceComponent) {
  registry[`${sector}/${slug}`] = component
}

export function getWorkspaceComponent(sector: string, slug: string): WorkspaceComponent | null {
  return registry[`${sector}/${slug}`] ?? null
}

// ── Restaurang: Bokföring ────────────────────────────────────
import { RestaurangkontoplanWorkspace } from '@/components/modules/restaurang/RestaurangkontoplanWorkspace'
import { MomssplitWorkspace } from '@/components/modules/restaurang/MomssplitWorkspace'
import { DagskassaavstamningWorkspace } from '@/components/modules/restaurang/DagskassaavstamningWorkspace'
import { TipsbokforingWorkspace } from '@/components/modules/restaurang/TipsbokforingWorkspace'
import { PersonalliggareWorkspace } from '@/components/modules/restaurang/PersonalliggareWorkspace'
import { AlkoholpunktskattWorkspace } from '@/components/modules/restaurang/AlkoholpunktskattWorkspace'
import { RepresentationsbokforingWorkspace } from '@/components/modules/restaurang/RepresentationsbokforingWorkspace'

registerWorkspace('restaurang', 'restaurangkontoplan', RestaurangkontoplanWorkspace)
registerWorkspace('restaurang', 'momssplit-mat-dryck', MomssplitWorkspace)
registerWorkspace('restaurang', 'dagskassaavstamning', DagskassaavstamningWorkspace)
registerWorkspace('restaurang', 'tipsbokforing', TipsbokforingWorkspace)
registerWorkspace('restaurang', 'personalliggare', PersonalliggareWorkspace)
registerWorkspace('restaurang', 'alkoholpunktskatt', AlkoholpunktskattWorkspace)
registerWorkspace('restaurang', 'representationsbokforing', RepresentationsbokforingWorkspace)

// ── Restaurang: Rapport ──────────────────────────────────────
import { MatkostnadWorkspace } from '@/components/modules/restaurang/MatkostnadWorkspace'
import { PersonalkostnadWorkspace } from '@/components/modules/restaurang/PersonalkostnadWorkspace'
import { SvinnrapportWorkspace } from '@/components/modules/restaurang/SvinnrapportWorkspace'
import { RevpashWorkspace } from '@/components/modules/restaurang/RevpashWorkspace'

registerWorkspace('restaurang', 'matkostnad', MatkostnadWorkspace)
registerWorkspace('restaurang', 'personalkostnad-vs-omsattning', PersonalkostnadWorkspace)
registerWorkspace('restaurang', 'svinnrapport', SvinnrapportWorkspace)
registerWorkspace('restaurang', 'revpash', RevpashWorkspace)

// ── Restaurang: Import ───────────────────────────────────────
import { ZrapportImportWorkspace } from '@/components/modules/restaurang/ZrapportImportWorkspace'
import { LeverantorsfakturaImportWorkspace } from '@/components/modules/restaurang/LeverantorsfakturaImportWorkspace'

registerWorkspace('restaurang', 'z-rapport-import', ZrapportImportWorkspace)
registerWorkspace('restaurang', 'leverantorsfaktura-import', LeverantorsfakturaImportWorkspace)

// ── Restaurang: Operativ ─────────────────────────────────────
import { MenyhanteringWorkspace } from '@/components/modules/restaurang/MenyhanteringWorkspace'
import { BordsbokningWorkspace } from '@/components/modules/restaurang/BordsbokningWorkspace'
import { ReceptkalkylWorkspace } from '@/components/modules/restaurang/ReceptkalkylWorkspace'
import { PersonalschemaWorkspace } from '@/components/modules/restaurang/PersonalschemaWorkspace'
import { LeverantorsbestallningWorkspace } from '@/components/modules/restaurang/LeverantorsbestallningWorkspace'

registerWorkspace('restaurang', 'menyhantering', MenyhanteringWorkspace)
registerWorkspace('restaurang', 'bordsbokning', BordsbokningWorkspace)
registerWorkspace('restaurang', 'receptkalkyl', ReceptkalkylWorkspace)
registerWorkspace('restaurang', 'personalschema', PersonalschemaWorkspace)
registerWorkspace('restaurang', 'leverantorsbestallning', LeverantorsbestallningWorkspace)

// ── Hotell: Bokföring ────────────────────────────────────────
import { HotellkontoplanWorkspace } from '@/components/modules/hotell/HotellkontoplanWorkspace'
import { MomssplitBoendeTjanstWorkspace } from '@/components/modules/hotell/MomssplitBoendeTjanstWorkspace'
import { ForskottsbetalningWorkspace } from '@/components/modules/hotell/ForskottsbetalningWorkspace'
import { ProvisionshanteringWorkspace } from '@/components/modules/hotell/ProvisionshanteringWorkspace'
import { NattrevisionWorkspace } from '@/components/modules/hotell/NattrevisionWorkspace'

registerWorkspace('hotell', 'hotellkontoplan', HotellkontoplanWorkspace)
registerWorkspace('hotell', 'momssplit-boende-tjanst', MomssplitBoendeTjanstWorkspace)
registerWorkspace('hotell', 'forskottsbetalning', ForskottsbetalningWorkspace)
registerWorkspace('hotell', 'provisionshantering', ProvisionshanteringWorkspace)
registerWorkspace('hotell', 'nattrevision', NattrevisionWorkspace)

// ── Hotell: Rapport ──────────────────────────────────────────
import { RevparWorkspace } from '@/components/modules/hotell/RevparWorkspace'
import { AdrWorkspace } from '@/components/modules/hotell/AdrWorkspace'
import { BelaggningsgradWorkspace } from '@/components/modules/hotell/BelaggningsgradWorkspace'
import { KanallonsamhetWorkspace } from '@/components/modules/hotell/KanallonsamhetWorkspace'

registerWorkspace('hotell', 'revpar', RevparWorkspace)
registerWorkspace('hotell', 'adr', AdrWorkspace)
registerWorkspace('hotell', 'belaggningsgrad', BelaggningsgradWorkspace)
registerWorkspace('hotell', 'kanallonsamhet', KanallonsamhetWorkspace)

// ── Hotell: Import ───────────────────────────────────────────
import { PmsImportWorkspace } from '@/components/modules/hotell/PmsImportWorkspace'
import { ChannelManagerRapportWorkspace } from '@/components/modules/hotell/ChannelManagerRapportWorkspace'

registerWorkspace('hotell', 'pms-import', PmsImportWorkspace)
registerWorkspace('hotell', 'channel-manager-rapport', ChannelManagerRapportWorkspace)

// ── Hotell: Operativ ─────────────────────────────────────────
import { RumsbokningWorkspace } from '@/components/modules/hotell/RumsbokningWorkspace'
import { GastregisterWorkspace } from '@/components/modules/hotell/GastregisterWorkspace'
import { StadschemaWorkspace } from '@/components/modules/hotell/StadschemaWorkspace'
import { SasongsplaneringWorkspace } from '@/components/modules/hotell/SasongsplaneringWorkspace'
import { GastkommunikationWorkspace } from '@/components/modules/hotell/GastkommunikationWorkspace'

registerWorkspace('hotell', 'rumsbokning', RumsbokningWorkspace)
registerWorkspace('hotell', 'gastregister', GastregisterWorkspace)
registerWorkspace('hotell', 'stadschema', StadschemaWorkspace)
registerWorkspace('hotell', 'sasongsplanering', SasongsplaneringWorkspace)
registerWorkspace('hotell', 'gastkommunikation', GastkommunikationWorkspace)

// ── Tech: Bokföring ──────────────────────────────────────────
import { ItKontoplanWorkspace } from '@/components/modules/tech/ItKontoplanWorkspace'
import { ProjektredovisningWorkspace } from '@/components/modules/tech/ProjektredovisningWorkspace'
import { FouAvdragWorkspace } from '@/components/modules/tech/FouAvdragWorkspace'
import { LicensavskrivningWorkspace } from '@/components/modules/tech/LicensavskrivningWorkspace'
import { EuTjanstmomsWorkspace } from '@/components/modules/tech/EuTjanstmomsWorkspace'

registerWorkspace('tech', 'it-kontoplan', ItKontoplanWorkspace)
registerWorkspace('tech', 'projektredovisning', ProjektredovisningWorkspace)
registerWorkspace('tech', 'fou-avdrag', FouAvdragWorkspace)
registerWorkspace('tech', 'licensavskrivning', LicensavskrivningWorkspace)
registerWorkspace('tech', 'eu-tjanstmoms', EuTjanstmomsWorkspace)

// ── Tech: Rapport ────────────────────────────────────────────
import { DebiteringsgradWorkspace } from '@/components/modules/tech/DebiteringsgradWorkspace'
import { ProjektlonsamhetWorkspace } from '@/components/modules/tech/ProjektlonsamhetWorkspace'
import { MrrArrWorkspace } from '@/components/modules/tech/MrrArrWorkspace'

registerWorkspace('tech', 'debiteringsgrad', DebiteringsgradWorkspace)
registerWorkspace('tech', 'projektlonsamhet', ProjektlonsamhetWorkspace)
registerWorkspace('tech', 'mrr-arr', MrrArrWorkspace)

// ── Tech: Import ─────────────────────────────────────────────
import { TidrapportImportWorkspace } from '@/components/modules/tech/TidrapportImportWorkspace'

registerWorkspace('tech', 'tidrapport-import', TidrapportImportWorkspace)

// ── Tech: Operativ ───────────────────────────────────────────
import { ProjekthanteringWorkspace } from '@/components/modules/tech/ProjekthanteringWorkspace'
import { TidrapporteringWorkspace } from '@/components/modules/tech/TidrapporteringWorkspace'
import { ArendehanteringWorkspace } from '@/components/modules/tech/ArendehanteringWorkspace'
import { ResursplaneringWorkspace } from '@/components/modules/tech/ResursplaneringWorkspace'

registerWorkspace('tech', 'projekthantering', ProjekthanteringWorkspace)
registerWorkspace('tech', 'tidrapportering', TidrapporteringWorkspace)
registerWorkspace('tech', 'arendehantering', ArendehanteringWorkspace)
registerWorkspace('tech', 'resursplanering', ResursplaneringWorkspace)

// ── Bygg: Bokföring ──────────────────────────────────────────
import { ByggkontoplanWorkspace } from '@/components/modules/bygg/ByggkontoplanWorkspace'
import { OmvandSkattskyldighetByggWorkspace } from '@/components/modules/bygg/OmvandSkattskyldighetByggWorkspace'
import { RotAvdragWorkspace } from '@/components/modules/bygg/RotAvdragWorkspace'
import { SuccessivVinstavrakningWorkspace } from '@/components/modules/bygg/SuccessivVinstavrakningWorkspace'
import { UeAttesteringWorkspace } from '@/components/modules/bygg/UeAttesteringWorkspace'
import { PersonalliggareByggWorkspace } from '@/components/modules/bygg/PersonalliggareByggWorkspace'
import { AtaBokforingWorkspace } from '@/components/modules/bygg/AtaBokforingWorkspace'

registerWorkspace('bygg', 'byggkontoplan', ByggkontoplanWorkspace)
registerWorkspace('bygg', 'omvand-skattskyldighet-bygg', OmvandSkattskyldighetByggWorkspace)
registerWorkspace('bygg', 'rot-avdrag', RotAvdragWorkspace)
registerWorkspace('bygg', 'successiv-vinstavrakning', SuccessivVinstavrakningWorkspace)
registerWorkspace('bygg', 'ue-attestering', UeAttesteringWorkspace)
registerWorkspace('bygg', 'personalliggare-bygg', PersonalliggareByggWorkspace)
registerWorkspace('bygg', 'ata-bokforing', AtaBokforingWorkspace)

// ── Bygg: Rapport ────────────────────────────────────────────
import { ProjektmarginalWorkspace } from '@/components/modules/bygg/ProjektmarginalWorkspace'
import { AtaAnalysWorkspace } from '@/components/modules/bygg/AtaAnalysWorkspace'
import { LikviditetPerProjektWorkspace } from '@/components/modules/bygg/LikviditetPerProjektWorkspace'

registerWorkspace('bygg', 'projektmarginal', ProjektmarginalWorkspace)
registerWorkspace('bygg', 'ata-analys', AtaAnalysWorkspace)
registerWorkspace('bygg', 'likviditet-per-projekt', LikviditetPerProjektWorkspace)

// ── Bygg: Import ─────────────────────────────────────────────
import { UeFakturaimportWorkspace } from '@/components/modules/bygg/UeFakturaimportWorkspace'
import { MaterialkostnadsimportWorkspace } from '@/components/modules/bygg/MaterialkostnadsimportWorkspace'

registerWorkspace('bygg', 'ue-fakturaimport', UeFakturaimportWorkspace)
registerWorkspace('bygg', 'materialkostnadsimport', MaterialkostnadsimportWorkspace)

// ── Bygg: Operativ ───────────────────────────────────────────
import { ProjektkalkylWorkspace } from '@/components/modules/bygg/ProjektkalkylWorkspace'
import { AtaHanteringWorkspace } from '@/components/modules/bygg/AtaHanteringWorkspace'
import { ByggdagbokWorkspace } from '@/components/modules/bygg/ByggdagbokWorkspace'
import { RitningshanteringWorkspace } from '@/components/modules/bygg/RitningshanteringWorkspace'
import { MaterialbestallningWorkspace } from '@/components/modules/bygg/MaterialbestallningWorkspace'

registerWorkspace('bygg', 'projektkalkyl', ProjektkalkylWorkspace)
registerWorkspace('bygg', 'ata-hantering', AtaHanteringWorkspace)
registerWorkspace('bygg', 'byggdagbok', ByggdagbokWorkspace)
registerWorkspace('bygg', 'ritningshantering', RitningshanteringWorkspace)
registerWorkspace('bygg', 'materialbestallning', MaterialbestallningWorkspace)

// ── Hälsa: Bokföring ─────────────────────────────────────────
import { VardkontoplanWorkspace } from '@/components/modules/halsa/VardkontoplanWorkspace'
import { MomsfrihetSjukvardWorkspace } from '@/components/modules/halsa/MomsfrihetSjukvardWorkspace'
import { ForsakringsersattningWorkspace } from '@/components/modules/halsa/ForsakringsersattningWorkspace'
import { FrikortHogkostnadsskyddWorkspace } from '@/components/modules/halsa/FrikortHogkostnadsskyddWorkspace'

registerWorkspace('halsa', 'vardkontoplan', VardkontoplanWorkspace)
registerWorkspace('halsa', 'momsfrihet-sjukvard', MomsfrihetSjukvardWorkspace)
registerWorkspace('halsa', 'forsakringsersattning', ForsakringsersattningWorkspace)
registerWorkspace('halsa', 'frikort-hogkostnadsskydd', FrikortHogkostnadsskyddWorkspace)

// ── Hälsa: Rapport ───────────────────────────────────────────
import { IntaktPerBehandlareWorkspace } from '@/components/modules/halsa/IntaktPerBehandlareWorkspace'
import { PatientmixWorkspace } from '@/components/modules/halsa/PatientmixWorkspace'

registerWorkspace('halsa', 'intakt-per-behandlare', IntaktPerBehandlareWorkspace)
registerWorkspace('halsa', 'patientmix', PatientmixWorkspace)

// ── Hälsa: Import ────────────────────────────────────────────
import { RegionersattningsimportWorkspace } from '@/components/modules/halsa/RegionersattningsimportWorkspace'
import { ForsakringsrapportImportWorkspace } from '@/components/modules/halsa/ForsakringsrapportImportWorkspace'

registerWorkspace('halsa', 'regionersattningsimport', RegionersattningsimportWorkspace)
registerWorkspace('halsa', 'forsakringsrapport-import', ForsakringsrapportImportWorkspace)

// ── Hälsa: Operativ ──────────────────────────────────────────
import { PatientbokningWorkspace } from '@/components/modules/halsa/PatientbokningWorkspace'
import { JournalhanteringWorkspace } from '@/components/modules/halsa/JournalhanteringWorkspace'
import { RemisshanteringWorkspace } from '@/components/modules/halsa/RemisshanteringWorkspace'
import { KassasystemPatientavgifterWorkspace } from '@/components/modules/halsa/KassasystemPatientavgifterWorkspace'

registerWorkspace('halsa', 'patientbokning', PatientbokningWorkspace)
registerWorkspace('halsa', 'journalhantering', JournalhanteringWorkspace)
registerWorkspace('halsa', 'remisshantering', RemisshanteringWorkspace)
registerWorkspace('halsa', 'kassasystem-patientavgifter', KassasystemPatientavgifterWorkspace)

// ── Detaljhandel: Bokföring ──────────────────────────────────
import { DetaljhandelskontoplanWorkspace } from '@/components/modules/detaljhandel/DetaljhandelskontoplanWorkspace'
import { LagervaderingWorkspace } from '@/components/modules/detaljhandel/LagervaderingWorkspace'
import { KassaavstamningButikWorkspace } from '@/components/modules/detaljhandel/KassaavstamningButikWorkspace'
import { SvinnbokforingWorkspace } from '@/components/modules/detaljhandel/SvinnbokforingWorkspace'
import { PersonalliggareButikWorkspace } from '@/components/modules/detaljhandel/PersonalliggareButikWorkspace'

registerWorkspace('detaljhandel', 'detaljhandelskontoplan', DetaljhandelskontoplanWorkspace)
registerWorkspace('detaljhandel', 'lagervardering', LagervaderingWorkspace)
registerWorkspace('detaljhandel', 'kassaavstamning-butik', KassaavstamningButikWorkspace)
registerWorkspace('detaljhandel', 'svinnbokforing', SvinnbokforingWorkspace)
registerWorkspace('detaljhandel', 'personalliggare-butik', PersonalliggareButikWorkspace)

// ── Detaljhandel: Rapport ────────────────────────────────────
import { BruttomarginalPerVarugruppWorkspace } from '@/components/modules/detaljhandel/BruttomarginalPerVarugruppWorkspace'
import { LageromsattningshastighetWorkspace } from '@/components/modules/detaljhandel/LageromsattningshastighetWorkspace'
import { SvinnprocentWorkspace } from '@/components/modules/detaljhandel/SvinnprocentWorkspace'
import { ForsaljningPerM2Workspace } from '@/components/modules/detaljhandel/ForsaljningPerM2Workspace'

registerWorkspace('detaljhandel', 'bruttomarginal-per-varugrupp', BruttomarginalPerVarugruppWorkspace)
registerWorkspace('detaljhandel', 'lageromsattningshastighet', LageromsattningshastighetWorkspace)
registerWorkspace('detaljhandel', 'svinnprocent', SvinnprocentWorkspace)
registerWorkspace('detaljhandel', 'forsaljning-per-m2', ForsaljningPerM2Workspace)

// ── Detaljhandel: Import ─────────────────────────────────────
import { PosZrapportImportWorkspace } from '@/components/modules/detaljhandel/PosZrapportImportWorkspace'
import { InventeringsimportWorkspace } from '@/components/modules/detaljhandel/InventeringsimportWorkspace'
import { LeverantorsfakturaImportButikWorkspace } from '@/components/modules/detaljhandel/LeverantorsfakturaImportButikWorkspace'

registerWorkspace('detaljhandel', 'pos-z-rapport-import', PosZrapportImportWorkspace)
registerWorkspace('detaljhandel', 'inventeringsimport', InventeringsimportWorkspace)
registerWorkspace('detaljhandel', 'leverantorsfaktura-import-butik', LeverantorsfakturaImportButikWorkspace)

// ── Detaljhandel: Operativ ───────────────────────────────────
import { LagerhanteringWorkspace } from '@/components/modules/detaljhandel/LagerhanteringWorkspace'
import { KampanjerRabatterWorkspace } from '@/components/modules/detaljhandel/KampanjerRabatterWorkspace'
import { KundklubbWorkspace } from '@/components/modules/detaljhandel/KundklubbWorkspace'
import { PrishanteringWorkspace } from '@/components/modules/detaljhandel/PrishanteringWorkspace'
import { ButiksdriftSchemaWorkspace } from '@/components/modules/detaljhandel/ButiksdriftSchemaWorkspace'

registerWorkspace('detaljhandel', 'lagerhantering', LagerhanteringWorkspace)
registerWorkspace('detaljhandel', 'kampanjer-rabatter', KampanjerRabatterWorkspace)
registerWorkspace('detaljhandel', 'kundklubb', KundklubbWorkspace)
registerWorkspace('detaljhandel', 'prishantering', PrishanteringWorkspace)
registerWorkspace('detaljhandel', 'butiksdrift-schema', ButiksdriftSchemaWorkspace)

// ── E-handel: Bokföring ──────────────────────────────────────
import { EhandelskontoplanWorkspace } from '@/components/modules/ehandel/EhandelskontoplanWorkspace'
import { LagervaderingEhandelWorkspace } from '@/components/modules/ehandel/LagervaderingEhandelWorkspace'
import { ReturbokforingWorkspace } from '@/components/modules/ehandel/ReturbokforingWorkspace'
import { MultiCurrencyWorkspace } from '@/components/modules/ehandel/MultiCurrencyWorkspace'
import { EuMomsOssWorkspace } from '@/components/modules/ehandel/EuMomsOssWorkspace'
import { PlattformsavgifterWorkspace } from '@/components/modules/ehandel/PlattformsavgifterWorkspace'

registerWorkspace('ehandel', 'ehandelskontoplan', EhandelskontoplanWorkspace)
registerWorkspace('ehandel', 'lagervardering-ehandel', LagervaderingEhandelWorkspace)
registerWorkspace('ehandel', 'returbokforing', ReturbokforingWorkspace)
registerWorkspace('ehandel', 'multi-currency', MultiCurrencyWorkspace)
registerWorkspace('ehandel', 'eu-moms-oss', EuMomsOssWorkspace)
registerWorkspace('ehandel', 'plattformsavgifter', PlattformsavgifterWorkspace)

// ── E-handel: Rapport ────────────────────────────────────────
import { ReturprocentWorkspace } from '@/components/modules/ehandel/ReturprocentWorkspace'
import { GenomsnittligtOrdervardeWorkspace } from '@/components/modules/ehandel/GenomsnittligtOrdervardeWorkspace'
import { KanalfordelningWorkspace } from '@/components/modules/ehandel/KanalfordelningWorkspace'
import { FraktkostnadVsIntaktWorkspace } from '@/components/modules/ehandel/FraktkostnadVsIntaktWorkspace'

registerWorkspace('ehandel', 'returprocent', ReturprocentWorkspace)
registerWorkspace('ehandel', 'genomsnittligt-ordervarde', GenomsnittligtOrdervardeWorkspace)
registerWorkspace('ehandel', 'kanalfordelning', KanalfordelningWorkspace)
registerWorkspace('ehandel', 'fraktkostnad-vs-intakt', FraktkostnadVsIntaktWorkspace)

// ── E-handel: Import ─────────────────────────────────────────
import { ShopifyWooImportWorkspace } from '@/components/modules/ehandel/ShopifyWooImportWorkspace'
import { KlarnaRapportImportWorkspace } from '@/components/modules/ehandel/KlarnaRapportImportWorkspace'
import { FraktrapportImportWorkspace } from '@/components/modules/ehandel/FraktrapportImportWorkspace'

registerWorkspace('ehandel', 'shopify-woo-import', ShopifyWooImportWorkspace)
registerWorkspace('ehandel', 'klarna-rapport-import', KlarnaRapportImportWorkspace)
registerWorkspace('ehandel', 'fraktrapport-import', FraktrapportImportWorkspace)

// ── E-handel: Operativ ───────────────────────────────────────
import { OrderhanteringWorkspace } from '@/components/modules/ehandel/OrderhanteringWorkspace'
import { FrakthanteringWorkspace } from '@/components/modules/ehandel/FrakthanteringWorkspace'
import { ReturhanteringOperativWorkspace } from '@/components/modules/ehandel/ReturhanteringOperativWorkspace'
import { ProduktdatahanteringWorkspace } from '@/components/modules/ehandel/ProduktdatahanteringWorkspace'

registerWorkspace('ehandel', 'orderhantering', OrderhanteringWorkspace)
registerWorkspace('ehandel', 'frakthantering', FrakthanteringWorkspace)
registerWorkspace('ehandel', 'returhantering-operativ', ReturhanteringOperativWorkspace)
registerWorkspace('ehandel', 'produktdatahantering', ProduktdatahanteringWorkspace)

// ── Frisör: Bokföring ────────────────────────────────────────
import { SalongkontoplanWorkspace } from '@/components/modules/frisor/SalongkontoplanWorkspace'
import { ProvisionsberakningWorkspace } from '@/components/modules/frisor/ProvisionsberakningWorkspace'
import { PresentkortSomSkuldWorkspace } from '@/components/modules/frisor/PresentkortSomSkuldWorkspace'
import { KassaavstamningSalongWorkspace } from '@/components/modules/frisor/KassaavstamningSalongWorkspace'
import { PersonalliggareSalongWorkspace } from '@/components/modules/frisor/PersonalliggareSalongWorkspace'

registerWorkspace('frisor', 'salongkontoplan', SalongkontoplanWorkspace)
registerWorkspace('frisor', 'provisionsberakning', ProvisionsberakningWorkspace)
registerWorkspace('frisor', 'presentkort-som-skuld', PresentkortSomSkuldWorkspace)
registerWorkspace('frisor', 'kassaavstamning-salong', KassaavstamningSalongWorkspace)
registerWorkspace('frisor', 'personalliggare-salong', PersonalliggareSalongWorkspace)

// ── Frisör: Rapport ──────────────────────────────────────────
import { IntaktPerStolWorkspace } from '@/components/modules/frisor/IntaktPerStolWorkspace'
import { ProvisionsandelWorkspace } from '@/components/modules/frisor/ProvisionsandelWorkspace'
import { ProduktforsaljningPerBesokWorkspace } from '@/components/modules/frisor/ProduktforsaljningPerBesokWorkspace'

registerWorkspace('frisor', 'intakt-per-stol', IntaktPerStolWorkspace)
registerWorkspace('frisor', 'provisionsandel', ProvisionsandelWorkspace)
registerWorkspace('frisor', 'produktforsaljning-per-besok', ProduktforsaljningPerBesokWorkspace)

// ── Frisör: Import ───────────────────────────────────────────
import { KassarapportImportSalongWorkspace } from '@/components/modules/frisor/KassarapportImportSalongWorkspace'
import { BokningssystemImportWorkspace } from '@/components/modules/frisor/BokningssystemImportWorkspace'

registerWorkspace('frisor', 'kassarapport-import-salong', KassarapportImportSalongWorkspace)
registerWorkspace('frisor', 'bokningssystem-import', BokningssystemImportWorkspace)

// ── Frisör: Operativ ─────────────────────────────────────────
import { TidsbokningWorkspace } from '@/components/modules/frisor/TidsbokningWorkspace'
import { KundkortWorkspace } from '@/components/modules/frisor/KundkortWorkspace'
import { SmsPaminnelserWorkspace } from '@/components/modules/frisor/SmsPaminnelserWorkspace'
import { SkiftschemaSalongWorkspace } from '@/components/modules/frisor/SkiftschemaSalongWorkspace'

registerWorkspace('frisor', 'tidsbokning', TidsbokningWorkspace)
registerWorkspace('frisor', 'kundkort', KundkortWorkspace)
registerWorkspace('frisor', 'sms-paminnelser', SmsPaminnelserWorkspace)
registerWorkspace('frisor', 'skiftschema-salong', SkiftschemaSalongWorkspace)

// ── Transport: Bokföring ─────────────────────────────────────
import { TransportkontoplanWorkspace } from '@/components/modules/transport/TransportkontoplanWorkspace'
import { FordonsavskrivningWorkspace } from '@/components/modules/transport/FordonsavskrivningWorkspace'
import { LeasinghanteringWorkspace } from '@/components/modules/transport/LeasinghanteringWorkspace'
import { TrangselskattWorkspace } from '@/components/modules/transport/TrangselskattWorkspace'
import { MilersattningVsFaktiskKostnadWorkspace } from '@/components/modules/transport/MilersattningVsFaktiskKostnadWorkspace'

registerWorkspace('transport', 'transportkontoplan', TransportkontoplanWorkspace)
registerWorkspace('transport', 'fordonsavskrivning', FordonsavskrivningWorkspace)
registerWorkspace('transport', 'leasinghantering', LeasinghanteringWorkspace)
registerWorkspace('transport', 'trangselskatt', TrangselskattWorkspace)
registerWorkspace('transport', 'milersattning-vs-faktisk-kostnad', MilersattningVsFaktiskKostnadWorkspace)

// ── Transport: Rapport ───────────────────────────────────────
import { KostnadPerMilWorkspace } from '@/components/modules/transport/KostnadPerMilWorkspace'
import { IntaktPerFordonWorkspace } from '@/components/modules/transport/IntaktPerFordonWorkspace'
import { BransleeffektivitetWorkspace } from '@/components/modules/transport/BransleeffektivitetWorkspace'

registerWorkspace('transport', 'kostnad-per-mil', KostnadPerMilWorkspace)
registerWorkspace('transport', 'intakt-per-fordon', IntaktPerFordonWorkspace)
registerWorkspace('transport', 'bransleeffektivitet', BransleeffektivitetWorkspace)

// ── Transport: Import ────────────────────────────────────────
import { BranslekortImportWorkspace } from '@/components/modules/transport/BranslekortImportWorkspace'
import { VagtullsImportWorkspace } from '@/components/modules/transport/VagtullsImportWorkspace'

registerWorkspace('transport', 'branslekort-import', BranslekortImportWorkspace)
registerWorkspace('transport', 'vagtulls-import', VagtullsImportWorkspace)

// ── Transport: Operativ ──────────────────────────────────────
import { FlottahanteringWorkspace } from '@/components/modules/transport/FlottahanteringWorkspace'
import { RuttplaneringWorkspace } from '@/components/modules/transport/RuttplaneringWorkspace'
import { LeveranssparningWorkspace } from '@/components/modules/transport/LeveranssparningWorkspace'
import { FordonsunderhallWorkspace } from '@/components/modules/transport/FordonsunderhallWorkspace'
import { ChauforshanteringWorkspace } from '@/components/modules/transport/ChauforshanteringWorkspace'
import { FraktsedlarDokumentWorkspace } from '@/components/modules/transport/FraktsedlarDokumentWorkspace'

registerWorkspace('transport', 'flottahantering', FlottahanteringWorkspace)
registerWorkspace('transport', 'ruttplanering', RuttplaneringWorkspace)
registerWorkspace('transport', 'leveranssparning', LeveranssparningWorkspace)
registerWorkspace('transport', 'fordonsunderhall', FordonsunderhallWorkspace)
registerWorkspace('transport', 'chauforshantering', ChauforshanteringWorkspace)
registerWorkspace('transport', 'fraktsedlar-dokument', FraktsedlarDokumentWorkspace)

// ── Juridik: Bokföring ───────────────────────────────────────
import { JuristkontoplanWorkspace } from '@/components/modules/juridik/JuristkontoplanWorkspace'
import { KlientmedelskontoWorkspace } from '@/components/modules/juridik/KlientmedelskontoWorkspace'
import { WipVarderingWorkspace } from '@/components/modules/juridik/WipVarderingWorkspace'
import { AContoBokforingWorkspace } from '@/components/modules/juridik/AContoBokforingWorkspace'

registerWorkspace('juridik', 'juristkontoplan', JuristkontoplanWorkspace)
registerWorkspace('juridik', 'klientmedelskonto', KlientmedelskontoWorkspace)
registerWorkspace('juridik', 'wip-vardering', WipVarderingWorkspace)
registerWorkspace('juridik', 'a-conto-bokforing', AContoBokforingWorkspace)

// ── Juridik: Rapport ─────────────────────────────────────────
import { DebiteringsgradJuridikWorkspace } from '@/components/modules/juridik/DebiteringsgradJuridikWorkspace'
import { RealisationsgradWorkspace } from '@/components/modules/juridik/RealisationsgradWorkspace'
import { GenomsnittligTimintaktWorkspace } from '@/components/modules/juridik/GenomsnittligTimintaktWorkspace'
import { WipRapportWorkspace } from '@/components/modules/juridik/WipRapportWorkspace'

registerWorkspace('juridik', 'debiteringsgrad-juridik', DebiteringsgradJuridikWorkspace)
registerWorkspace('juridik', 'realisationsgrad', RealisationsgradWorkspace)
registerWorkspace('juridik', 'genomsnittlig-timintakt', GenomsnittligTimintaktWorkspace)
registerWorkspace('juridik', 'wip-rapport', WipRapportWorkspace)

// ── Juridik: Import ──────────────────────────────────────────
import { TidrapportImportJuridikWorkspace } from '@/components/modules/juridik/TidrapportImportJuridikWorkspace'

registerWorkspace('juridik', 'tidrapport-import-juridik', TidrapportImportJuridikWorkspace)

// ── Juridik: Operativ ────────────────────────────────────────
import { ArendehanteringJuridikWorkspace } from '@/components/modules/juridik/ArendehanteringJuridikWorkspace'
import { TidrapporteringJuridikWorkspace } from '@/components/modules/juridik/TidrapporteringJuridikWorkspace'
import { DokumenthanteringWorkspace } from '@/components/modules/juridik/DokumenthanteringWorkspace'
import { DeadlinebevakningWorkspace } from '@/components/modules/juridik/DeadlinebevakningWorkspace'
import { IntressekonfliktskontrollWorkspace } from '@/components/modules/juridik/IntressekonfliktskontrollWorkspace'

registerWorkspace('juridik', 'arendehantering-juridik', ArendehanteringJuridikWorkspace)
registerWorkspace('juridik', 'tidrapportering-juridik', TidrapporteringJuridikWorkspace)
registerWorkspace('juridik', 'dokumenthantering', DokumenthanteringWorkspace)
registerWorkspace('juridik', 'deadlinebevakning', DeadlinebevakningWorkspace)
registerWorkspace('juridik', 'intressekonfliktskontroll', IntressekonfliktskontrollWorkspace)

// ── Utbildning: Bokföring ────────────────────────────────────
import { UtbildningskontoplanWorkspace } from '@/components/modules/utbildning/UtbildningskontoplanWorkspace'
import { MaxtaxaFaktureringWorkspace } from '@/components/modules/utbildning/MaxtaxaFaktureringWorkspace'
import { StatsbidragsperiodiseringWorkspace } from '@/components/modules/utbildning/StatsbidragsperiodiseringWorkspace'
import { MomsfrihetUtbildningWorkspace } from '@/components/modules/utbildning/MomsfrihetUtbildningWorkspace'

registerWorkspace('utbildning', 'utbildningskontoplan', UtbildningskontoplanWorkspace)
registerWorkspace('utbildning', 'maxtaxa-fakturering', MaxtaxaFaktureringWorkspace)
registerWorkspace('utbildning', 'statsbidragsperiodisering', StatsbidragsperiodiseringWorkspace)
registerWorkspace('utbildning', 'momsfrihet-utbildning', MomsfrihetUtbildningWorkspace)

// ── Utbildning: Rapport ──────────────────────────────────────
import { KostnadPerBarnElevWorkspace } from '@/components/modules/utbildning/KostnadPerBarnElevWorkspace'
import { PersonaltathetWorkspace } from '@/components/modules/utbildning/PersonaltathetWorkspace'

registerWorkspace('utbildning', 'kostnad-per-barn-elev', KostnadPerBarnElevWorkspace)
registerWorkspace('utbildning', 'personaltathet', PersonaltathetWorkspace)

// ── Utbildning: Import ───────────────────────────────────────
import { KommunalPengImportWorkspace } from '@/components/modules/utbildning/KommunalPengImportWorkspace'

registerWorkspace('utbildning', 'kommunal-peng-import', KommunalPengImportWorkspace)

// ── Utbildning: Operativ ─────────────────────────────────────
import { SchemalagggningWorkspace } from '@/components/modules/utbildning/SchemalagggningWorkspace'
import { ElevregisterWorkspace } from '@/components/modules/utbildning/ElevregisterWorkspace'
import { NarvarohanteringWorkspace } from '@/components/modules/utbildning/NarvarohanteringWorkspace'
import { ForaldrakommunikationWorkspace } from '@/components/modules/utbildning/ForaldrakommunikationWorkspace'
import { MatsedelAllergikostWorkspace } from '@/components/modules/utbildning/MatsedelAllergikostWorkspace'
import { VikariebokningWorkspace } from '@/components/modules/utbildning/VikariebokningWorkspace'

registerWorkspace('utbildning', 'schemalaeggning', SchemalagggningWorkspace)
registerWorkspace('utbildning', 'elevregister', ElevregisterWorkspace)
registerWorkspace('utbildning', 'narvarohantering', NarvarohanteringWorkspace)
registerWorkspace('utbildning', 'foraldrakommunikation', ForaldrakommunikationWorkspace)
registerWorkspace('utbildning', 'matsedel-allergikost', MatsedelAllergikostWorkspace)
registerWorkspace('utbildning', 'vikariebokning', VikariebokningWorkspace)

// ── Jordbruk: Bokföring ──────────────────────────────────────
import { JordbrukskontoplanWorkspace } from '@/components/modules/jordbruk/JordbrukskontoplanWorkspace'
import { SkogskontoWorkspace } from '@/components/modules/jordbruk/SkogskontoWorkspace'
import { ExpansionsfondWorkspace } from '@/components/modules/jordbruk/ExpansionsfondWorkspace'
import { RantefordelningWorkspace } from '@/components/modules/jordbruk/RantefordelningWorkspace'
import { EuStodSomIntaktWorkspace } from '@/components/modules/jordbruk/EuStodSomIntaktWorkspace'
import { BiologiskaTillgangarWorkspace } from '@/components/modules/jordbruk/BiologiskaTillgangarWorkspace'
import { MomssplitLivsmedelWorkspace } from '@/components/modules/jordbruk/MomssplitLivsmedelWorkspace'

registerWorkspace('jordbruk', 'jordbrukskontoplan', JordbrukskontoplanWorkspace)
registerWorkspace('jordbruk', 'skogskonto', SkogskontoWorkspace)
registerWorkspace('jordbruk', 'expansionsfond', ExpansionsfondWorkspace)
registerWorkspace('jordbruk', 'rantefordelning', RantefordelningWorkspace)
registerWorkspace('jordbruk', 'eu-stod-som-intakt', EuStodSomIntaktWorkspace)
registerWorkspace('jordbruk', 'biologiska-tillgangar', BiologiskaTillgangarWorkspace)
registerWorkspace('jordbruk', 'momssplit-livsmedel', MomssplitLivsmedelWorkspace)

// ── Jordbruk: Rapport ────────────────────────────────────────
import { AvkastningPerHektarWorkspace } from '@/components/modules/jordbruk/AvkastningPerHektarWorkspace'
import { BidragsberoendeWorkspace } from '@/components/modules/jordbruk/BidragsberoendeWorkspace'
import { DjurkostnadPerEnhetWorkspace } from '@/components/modules/jordbruk/DjurkostnadPerEnhetWorkspace'

registerWorkspace('jordbruk', 'avkastning-per-hektar', AvkastningPerHektarWorkspace)
registerWorkspace('jordbruk', 'bidragsberoende', BidragsberoendeWorkspace)
registerWorkspace('jordbruk', 'djurkostnad-per-enhet', DjurkostnadPerEnhetWorkspace)

// ── Jordbruk: Import ─────────────────────────────────────────
import { SamUtbetalningsimportWorkspace } from '@/components/modules/jordbruk/SamUtbetalningsimportWorkspace'

registerWorkspace('jordbruk', 'sam-utbetalningsimport', SamUtbetalningsimportWorkspace)

// ── Jordbruk: Operativ ───────────────────────────────────────
import { SkordeplaneringWorkspace } from '@/components/modules/jordbruk/SkordeplaneringWorkspace'
import { DjurhallningWorkspace } from '@/components/modules/jordbruk/DjurhallningWorkspace'
import { SparbarhetWorkspace } from '@/components/modules/jordbruk/SparbarhetWorkspace'
import { MaskinloggWorkspace } from '@/components/modules/jordbruk/MaskinloggWorkspace'
import { CertifieringarWorkspace } from '@/components/modules/jordbruk/CertifieringarWorkspace'

registerWorkspace('jordbruk', 'skordeplanering', SkordeplaneringWorkspace)
registerWorkspace('jordbruk', 'djurhallning', DjurhallningWorkspace)
registerWorkspace('jordbruk', 'sparbarhet', SparbarhetWorkspace)
registerWorkspace('jordbruk', 'maskinlogg', MaskinloggWorkspace)
registerWorkspace('jordbruk', 'certifieringar', CertifieringarWorkspace)

// ── Media: Bokföring ─────────────────────────────────────────
import { MediakontoplanWorkspace } from '@/components/modules/media/MediakontoplanWorkspace'
import { ProjektredovisningMediaWorkspace } from '@/components/modules/media/ProjektredovisningMediaWorkspace'
import { FreelancerBokforingWorkspace } from '@/components/modules/media/FreelancerBokforingWorkspace'
import { KulturmomsWorkspace } from '@/components/modules/media/KulturmomsWorkspace'
import { IpTillgangarWorkspace } from '@/components/modules/media/IpTillgangarWorkspace'

registerWorkspace('media', 'mediakontoplan', MediakontoplanWorkspace)
registerWorkspace('media', 'projektredovisning-media', ProjektredovisningMediaWorkspace)
registerWorkspace('media', 'freelancer-bokforing', FreelancerBokforingWorkspace)
registerWorkspace('media', 'kulturmoms', KulturmomsWorkspace)
registerWorkspace('media', 'ip-tillgangar', IpTillgangarWorkspace)

// ── Media: Rapport ───────────────────────────────────────────
import { ProjektlonsamhetMediaWorkspace } from '@/components/modules/media/ProjektlonsamhetMediaWorkspace'
import { FreelancerandelWorkspace } from '@/components/modules/media/FreelancerandelWorkspace'
import { KundlonsamhetWorkspace } from '@/components/modules/media/KundlonsamhetWorkspace'

registerWorkspace('media', 'projektlonsamhet-media', ProjektlonsamhetMediaWorkspace)
registerWorkspace('media', 'freelancerandel', FreelancerandelWorkspace)
registerWorkspace('media', 'kundlonsamhet', KundlonsamhetWorkspace)

// ── Media: Import ────────────────────────────────────────────
import { FreelancerFakturaimportWorkspace } from '@/components/modules/media/FreelancerFakturaimportWorkspace'
import { KampanjrapportImportWorkspace } from '@/components/modules/media/KampanjrapportImportWorkspace'

registerWorkspace('media', 'freelancer-fakturaimport', FreelancerFakturaimportWorkspace)
registerWorkspace('media', 'kampanjrapport-import', KampanjrapportImportWorkspace)

// ── Media: Operativ ──────────────────────────────────────────
import { ProjekthanteringMediaWorkspace } from '@/components/modules/media/ProjekthanteringMediaWorkspace'
import { InnehallsplaneringWorkspace } from '@/components/modules/media/InnehallsplaneringWorkspace'
import { MediebankWorkspace } from '@/components/modules/media/MediebankWorkspace'
import { TidrapportDebiteringMediaWorkspace } from '@/components/modules/media/TidrapportDebiteringMediaWorkspace'

registerWorkspace('media', 'projekthantering-media', ProjekthanteringMediaWorkspace)
registerWorkspace('media', 'innehallsplanering', InnehallsplaneringWorkspace)
registerWorkspace('media', 'mediebank', MediebankWorkspace)
registerWorkspace('media', 'tidrapport-debitering-media', TidrapportDebiteringMediaWorkspace)

// ── Fitness: Bokföring ───────────────────────────────────────
import { FitnesskontoplanWorkspace } from '@/components/modules/fitness/FitnesskontoplanWorkspace'
import { MomssplitIdrottPtWorkspace } from '@/components/modules/fitness/MomssplitIdrottPtWorkspace'
import { AutogiroPeriodiseringWorkspace } from '@/components/modules/fitness/AutogiroPeriodiseringWorkspace'
import { KlippkortSomSkuldWorkspace } from '@/components/modules/fitness/KlippkortSomSkuldWorkspace'
import { FriskvardsbidragWorkspace } from '@/components/modules/fitness/FriskvardsbidragWorkspace'

registerWorkspace('fitness', 'fitnesskontoplan', FitnesskontoplanWorkspace)
registerWorkspace('fitness', 'momssplit-idrott-pt', MomssplitIdrottPtWorkspace)
registerWorkspace('fitness', 'autogiro-periodisering', AutogiroPeriodiseringWorkspace)
registerWorkspace('fitness', 'klippkort-som-skuld', KlippkortSomSkuldWorkspace)
registerWorkspace('fitness', 'friskvardsbidrag', FriskvardsbidragWorkspace)

// ── Fitness: Rapport ─────────────────────────────────────────
import { ChurnRateWorkspace } from '@/components/modules/fitness/ChurnRateWorkspace'
import { IntaktPerMedlemWorkspace } from '@/components/modules/fitness/IntaktPerMedlemWorkspace'
import { BelaggningsgradKlasserWorkspace } from '@/components/modules/fitness/BelaggningsgradKlasserWorkspace'

registerWorkspace('fitness', 'churn-rate', ChurnRateWorkspace)
registerWorkspace('fitness', 'intakt-per-medlem', IntaktPerMedlemWorkspace)
registerWorkspace('fitness', 'belaggningsgrad-klasser', BelaggningsgradKlasserWorkspace)

// ── Fitness: Import ──────────────────────────────────────────
import { AutogiroRapportImportWorkspace } from '@/components/modules/fitness/AutogiroRapportImportWorkspace'
import { KassarapportImportFitnessWorkspace } from '@/components/modules/fitness/KassarapportImportFitnessWorkspace'

registerWorkspace('fitness', 'autogiro-rapport-import', AutogiroRapportImportWorkspace)
registerWorkspace('fitness', 'kassarapport-import-fitness', KassarapportImportFitnessWorkspace)

// ── Fitness: Operativ ────────────────────────────────────────
import { MedlemshanteringWorkspace } from '@/components/modules/fitness/MedlemshanteringWorkspace'
import { KlassbokningWorkspace } from '@/components/modules/fitness/KlassbokningWorkspace'
import { PtBokningWorkspace } from '@/components/modules/fitness/PtBokningWorkspace'
import { TilltradeskontrollWorkspace } from '@/components/modules/fitness/TilltradeskontrollWorkspace'

registerWorkspace('fitness', 'medlemshantering', MedlemshanteringWorkspace)
registerWorkspace('fitness', 'klassbokning', KlassbokningWorkspace)
registerWorkspace('fitness', 'pt-bokning', PtBokningWorkspace)
registerWorkspace('fitness', 'tilltradeskontroll', TilltradeskontrollWorkspace)

// ── Fordon: Bokföring ────────────────────────────────────────
import { VerkstadskontoplanWorkspace } from '@/components/modules/fordon/VerkstadskontoplanWorkspace'
import { ArbetsorderTillFakturaWorkspace } from '@/components/modules/fordon/ArbetsorderTillFakturaWorkspace'
import { ReservdelslagerWorkspace } from '@/components/modules/fordon/ReservdelslagerWorkspace'
import { VmbBegagnadeDelarWorkspace } from '@/components/modules/fordon/VmbBegagnadeDelarWorkspace'
import { GarantiavsattningWorkspace } from '@/components/modules/fordon/GarantiavsattningWorkspace'

registerWorkspace('fordon', 'verkstadskontoplan', VerkstadskontoplanWorkspace)
registerWorkspace('fordon', 'arbetsorder-till-faktura', ArbetsorderTillFakturaWorkspace)
registerWorkspace('fordon', 'reservdelslager', ReservdelslagerWorkspace)
registerWorkspace('fordon', 'vmb-begagnade-delar', VmbBegagnadeDelarWorkspace)
registerWorkspace('fordon', 'garantiavsattning', GarantiavsattningWorkspace)

// ── Fordon: Rapport ──────────────────────────────────────────
import { GenomsnittligtOrdervardeFordonWorkspace } from '@/components/modules/fordon/GenomsnittligtOrdervardeFordonWorkspace'
import { ReservdelsmarginalWorkspace } from '@/components/modules/fordon/ReservdelsmarginalWorkspace'
import { VerkstadsbelaggningWorkspace } from '@/components/modules/fordon/VerkstadsbelaggningWorkspace'

registerWorkspace('fordon', 'genomsnittligt-ordervarde', GenomsnittligtOrdervardeFordonWorkspace)
registerWorkspace('fordon', 'reservdelsmarginal', ReservdelsmarginalWorkspace)
registerWorkspace('fordon', 'verkstadsbelaggning', VerkstadsbelaggningWorkspace)

// ── Fordon: Import ───────────────────────────────────────────
import { ReservdelsleverantorImportWorkspace } from '@/components/modules/fordon/ReservdelsleverantorImportWorkspace'

registerWorkspace('fordon', 'reservdelsleverantor-import', ReservdelsleverantorImportWorkspace)

// ── Fordon: Operativ ─────────────────────────────────────────
import { ArbetsorderWorkspace } from '@/components/modules/fordon/ArbetsorderWorkspace'
import { FordonsregisterWorkspace } from '@/components/modules/fordon/FordonsregisterWorkspace'
import { VerkstadsplaneringWorkspace } from '@/components/modules/fordon/VerkstadsplaneringWorkspace'
import { BesiktningspaminmelseWorkspace } from '@/components/modules/fordon/BesiktningspaminmelseWorkspace'

registerWorkspace('fordon', 'arbetsorder', ArbetsorderWorkspace)
registerWorkspace('fordon', 'fordonsregister', FordonsregisterWorkspace)
registerWorkspace('fordon', 'verkstadsplanering', VerkstadsplaneringWorkspace)
registerWorkspace('fordon', 'besiktningspaminnelse', BesiktningspaminmelseWorkspace)

// ── Bemanning: Bokföring ─────────────────────────────────────
import { BemanningskontoplanWorkspace } from '@/components/modules/bemanning/BemanningskontoplanWorkspace'
import { TidrapportDubbelbokforingWorkspace } from '@/components/modules/bemanning/TidrapportDubbelbokforingWorkspace'
import { ArbetsgivaravgifterPeriodiseringWorkspace } from '@/components/modules/bemanning/ArbetsgivaravgifterPeriodiseringWorkspace'
import { UeVerifieringBemanningWorkspace } from '@/components/modules/bemanning/UeVerifieringBemanningWorkspace'
import { TraktamenteVidUthyrningWorkspace } from '@/components/modules/bemanning/TraktamenteVidUthyrningWorkspace'

registerWorkspace('bemanning', 'bemanningskontoplan', BemanningskontoplanWorkspace)
registerWorkspace('bemanning', 'tidrapport-dubbelbokforing', TidrapportDubbelbokforingWorkspace)
registerWorkspace('bemanning', 'arbetsgivaravgifter-periodisering', ArbetsgivaravgifterPeriodiseringWorkspace)
registerWorkspace('bemanning', 'ue-verifiering-bemanning', UeVerifieringBemanningWorkspace)
registerWorkspace('bemanning', 'traktamente-vid-uthyrning', TraktamenteVidUthyrningWorkspace)

// ── Bemanning: Rapport ───────────────────────────────────────
import { MarginalPerKonsultWorkspace } from '@/components/modules/bemanning/MarginalPerKonsultWorkspace'
import { BelaggningsgradBemanningWorkspace } from '@/components/modules/bemanning/BelaggningsgradBemanningWorkspace'
import { FaktureratPerKonsultWorkspace } from '@/components/modules/bemanning/FaktureratPerKonsultWorkspace'

registerWorkspace('bemanning', 'marginal-per-konsult', MarginalPerKonsultWorkspace)
registerWorkspace('bemanning', 'belaggningsgrad-bemanning', BelaggningsgradBemanningWorkspace)
registerWorkspace('bemanning', 'fakturerat-per-konsult', FaktureratPerKonsultWorkspace)

// ── Bemanning: Import ────────────────────────────────────────
import { TidrapportImportBemanningWorkspace } from '@/components/modules/bemanning/TidrapportImportBemanningWorkspace'
import { LonesystemImportWorkspace } from '@/components/modules/bemanning/LonesystemImportWorkspace'

registerWorkspace('bemanning', 'tidrapport-import-bemanning', TidrapportImportBemanningWorkspace)
registerWorkspace('bemanning', 'lonesystem-import', LonesystemImportWorkspace)

// ── Bemanning: Operativ ──────────────────────────────────────
import { KandidatregisterWorkspace } from '@/components/modules/bemanning/KandidatregisterWorkspace'
import { UppdragshanteringBemanningWorkspace } from '@/components/modules/bemanning/UppdragshanteringBemanningWorkspace'
import { AvtalshanteringBemanningWorkspace } from '@/components/modules/bemanning/AvtalshanteringBemanningWorkspace'
import { KompetensregisterWorkspace } from '@/components/modules/bemanning/KompetensregisterWorkspace'
import { ComplianceBemanningWorkspace } from '@/components/modules/bemanning/ComplianceBemanningWorkspace'

registerWorkspace('bemanning', 'kandidatregister', KandidatregisterWorkspace)
registerWorkspace('bemanning', 'uppdragshantering-bemanning', UppdragshanteringBemanningWorkspace)
registerWorkspace('bemanning', 'avtalshantering-bemanning', AvtalshanteringBemanningWorkspace)
registerWorkspace('bemanning', 'kompetensregister', KompetensregisterWorkspace)
registerWorkspace('bemanning', 'compliance-bemanning', ComplianceBemanningWorkspace)

// ── Tillverkning: Bokföring ──────────────────────────────────
import { TillverkningskontoplanWorkspace } from '@/components/modules/tillverkning/TillverkningskontoplanWorkspace'
import { TrestegslagervarderingWorkspace } from '@/components/modules/tillverkning/TrestegslagervarderingWorkspace'
import { BomKalkylLagervardeWorkspace } from '@/components/modules/tillverkning/BomKalkylLagervardeWorkspace'
import { ProduktionsavvikelseWorkspace } from '@/components/modules/tillverkning/ProduktionsavvikelseWorkspace'
import { MaskinavskrivningIndustriWorkspace } from '@/components/modules/tillverkning/MaskinavskrivningIndustriWorkspace'
import { EnergiskatteavdragWorkspace } from '@/components/modules/tillverkning/EnergiskatteavdragWorkspace'

registerWorkspace('tillverkning', 'tillverkningskontoplan', TillverkningskontoplanWorkspace)
registerWorkspace('tillverkning', 'trestegslagervarderin', TrestegslagervarderingWorkspace)
registerWorkspace('tillverkning', 'bom-kalkyl-lagervarde', BomKalkylLagervardeWorkspace)
registerWorkspace('tillverkning', 'produktionsavvikelse', ProduktionsavvikelseWorkspace)
registerWorkspace('tillverkning', 'maskinavskrivning-industri', MaskinavskrivningIndustriWorkspace)
registerWorkspace('tillverkning', 'energiskatteavdrag', EnergiskatteavdragWorkspace)

// ── Tillverkning: Rapport ────────────────────────────────────
import { MaterialeffektivitetWorkspace } from '@/components/modules/tillverkning/MaterialeffektivitetWorkspace'
import { KostnadPerProduceradEnhetWorkspace } from '@/components/modules/tillverkning/KostnadPerProduceradEnhetWorkspace'
import { OeeWorkspace } from '@/components/modules/tillverkning/OeeWorkspace'

registerWorkspace('tillverkning', 'materialeffektivitet', MaterialeffektivitetWorkspace)
registerWorkspace('tillverkning', 'kostnad-per-producerad-enhet', KostnadPerProduceradEnhetWorkspace)
registerWorkspace('tillverkning', 'oee', OeeWorkspace)

// ── Tillverkning: Import ─────────────────────────────────────
import { ProduktionsrapportImportWorkspace } from '@/components/modules/tillverkning/ProduktionsrapportImportWorkspace'
import { LagerexportImportWorkspace } from '@/components/modules/tillverkning/LagerexportImportWorkspace'

registerWorkspace('tillverkning', 'produktionsrapport-import', ProduktionsrapportImportWorkspace)
registerWorkspace('tillverkning', 'lagerexport-import', LagerexportImportWorkspace)

// ── Tillverkning: Operativ ───────────────────────────────────
import { ProduktionsplaneringWorkspace } from '@/components/modules/tillverkning/ProduktionsplaneringWorkspace'
import { StrukturlistaBomWorkspace } from '@/components/modules/tillverkning/StrukturlistaBomWorkspace'
import { KvalitetskontrollWorkspace } from '@/components/modules/tillverkning/KvalitetskontrollWorkspace'
import { MaskinunderhallWorkspace } from '@/components/modules/tillverkning/MaskinunderhallWorkspace'
import { SparbarhetBatchWorkspace } from '@/components/modules/tillverkning/SparbarhetBatchWorkspace'

registerWorkspace('tillverkning', 'produktionsplanering', ProduktionsplaneringWorkspace)
registerWorkspace('tillverkning', 'strukturlista-bom', StrukturlistaBomWorkspace)
registerWorkspace('tillverkning', 'kvalitetskontroll', KvalitetskontrollWorkspace)
registerWorkspace('tillverkning', 'maskinunderhall', MaskinunderhallWorkspace)
registerWorkspace('tillverkning', 'sparbarhet-batch', SparbarhetBatchWorkspace)

// ── Konsult: Bokföring ───────────────────────────────────────
import { KonsultkontoplanWorkspace } from '@/components/modules/konsult/KonsultkontoplanWorkspace'
import { TraktamenteWorkspace } from '@/components/modules/konsult/TraktamenteWorkspace'
import { HemmakontorAvdragWorkspace } from '@/components/modules/konsult/HemmakontorAvdragWorkspace'
import { WipBevakningKonsultWorkspace } from '@/components/modules/konsult/WipBevakningKonsultWorkspace'

registerWorkspace('konsult', 'konsultkontoplan', KonsultkontoplanWorkspace)
registerWorkspace('konsult', 'traktamente', TraktamenteWorkspace)
registerWorkspace('konsult', 'hemmakontor-avdrag', HemmakontorAvdragWorkspace)
registerWorkspace('konsult', 'wip-bevakning-konsult', WipBevakningKonsultWorkspace)

// ── Konsult: Rapport ─────────────────────────────────────────
import { DebiteringsgradKonsultWorkspace } from '@/components/modules/konsult/DebiteringsgradKonsultWorkspace'
import { IntaktPerKonsultWorkspace } from '@/components/modules/konsult/IntaktPerKonsultWorkspace'

registerWorkspace('konsult', 'debiteringsgrad-konsult', DebiteringsgradKonsultWorkspace)
registerWorkspace('konsult', 'intakt-per-konsult', IntaktPerKonsultWorkspace)

// ── Konsult: Import ──────────────────────────────────────────
import { TidrapportImportKonsultWorkspace } from '@/components/modules/konsult/TidrapportImportKonsultWorkspace'

registerWorkspace('konsult', 'tidrapport-import-konsult', TidrapportImportKonsultWorkspace)

// ── Konsult: Operativ ────────────────────────────────────────
import { UppdragshanteringKonsultWorkspace } from '@/components/modules/konsult/UppdragshanteringKonsultWorkspace'
import { TidrapporteringKonsultWorkspace } from '@/components/modules/konsult/TidrapporteringKonsultWorkspace'
import { OffertAvtalWorkspace } from '@/components/modules/konsult/OffertAvtalWorkspace'

registerWorkspace('konsult', 'uppdragshantering-konsult', UppdragshanteringKonsultWorkspace)
registerWorkspace('konsult', 'tidrapportering-konsult', TidrapporteringKonsultWorkspace)
registerWorkspace('konsult', 'offert-avtal', OffertAvtalWorkspace)

// ── Event: Bokföring ─────────────────────────────────────────
import { EventkontoplanWorkspace } from '@/components/modules/event/EventkontoplanWorkspace'
import { BiljettintaktSomForskottWorkspace } from '@/components/modules/event/BiljettintaktSomForskottWorkspace'
import { KulturmomsEventWorkspace } from '@/components/modules/event/KulturmomsEventWorkspace'
import { ArtistskattSinkWorkspace } from '@/components/modules/event/ArtistskattSinkWorkspace'
import { SponsorintaktsbokforingWorkspace } from '@/components/modules/event/SponsorintaktsbokforingWorkspace'

registerWorkspace('event', 'eventkontoplan', EventkontoplanWorkspace)
registerWorkspace('event', 'biljettintakt-som-forskott', BiljettintaktSomForskottWorkspace)
registerWorkspace('event', 'kulturmoms-event', KulturmomsEventWorkspace)
registerWorkspace('event', 'artistskatt-sink', ArtistskattSinkWorkspace)
registerWorkspace('event', 'sponsorintaktsbokforing', SponsorintaktsbokforingWorkspace)

// ── Event: Rapport ───────────────────────────────────────────
import { IntaktPerBesokareWorkspace } from '@/components/modules/event/IntaktPerBesokareWorkspace'
import { BudgetVsUtfallWorkspace } from '@/components/modules/event/BudgetVsUtfallWorkspace'
import { SponsorandelWorkspace } from '@/components/modules/event/SponsorandelWorkspace'

registerWorkspace('event', 'intakt-per-besokare', IntaktPerBesokareWorkspace)
registerWorkspace('event', 'budget-vs-utfall', BudgetVsUtfallWorkspace)
registerWorkspace('event', 'sponsorandel', SponsorandelWorkspace)

// ── Event: Import ────────────────────────────────────────────
import { BiljettsystemImportWorkspace } from '@/components/modules/event/BiljettsystemImportWorkspace'
import { PosRapportImportEventWorkspace } from '@/components/modules/event/PosRapportImportEventWorkspace'

registerWorkspace('event', 'biljettsystem-import', BiljettsystemImportWorkspace)
registerWorkspace('event', 'pos-rapport-import-event', PosRapportImportEventWorkspace)

// ── Event: Operativ ──────────────────────────────────────────
import { EvenemangsplaneringWorkspace } from '@/components/modules/event/EvenemangsplaneringWorkspace'
import { BiljettforsaljningWorkspace } from '@/components/modules/event/BiljettforsaljningWorkspace'
import { ArtistTalangbokningWorkspace } from '@/components/modules/event/ArtistTalangbokningWorkspace'
import { SponsorhanteringWorkspace } from '@/components/modules/event/SponsorhanteringWorkspace'
import { VolontarhanteringWorkspace } from '@/components/modules/event/VolontarhanteringWorkspace'

registerWorkspace('event', 'evenemangsplanering', EvenemangsplaneringWorkspace)
registerWorkspace('event', 'biljettforsaljning', BiljettforsaljningWorkspace)
registerWorkspace('event', 'artist-talangbokning', ArtistTalangbokningWorkspace)
registerWorkspace('event', 'sponsorhantering', SponsorhanteringWorkspace)
registerWorkspace('event', 'volontarhantering', VolontarhanteringWorkspace)

// ── Fastighet: Bokföring ─────────────────────────────────────
import { FastighetskontoplanWorkspace } from '@/components/modules/fastighet/FastighetskontoplanWorkspace'
import { HyresintaktPeriodiseringWorkspace } from '@/components/modules/fastighet/HyresintaktPeriodiseringWorkspace'
import { FastighetsskattWorkspace } from '@/components/modules/fastighet/FastighetsskattWorkspace'
import { FastighetsavskrivningWorkspace } from '@/components/modules/fastighet/FastighetsavskrivningWorkspace'
import { UnderhallsfondWorkspace } from '@/components/modules/fastighet/UnderhallsfondWorkspace'
import { RotVidRenoveringWorkspace } from '@/components/modules/fastighet/RotVidRenoveringWorkspace'
import { IndexupprakningWorkspace } from '@/components/modules/fastighet/IndexupprakningWorkspace'

registerWorkspace('fastighet', 'fastighetskontoplan', FastighetskontoplanWorkspace)
registerWorkspace('fastighet', 'hyresintakt-periodisering', HyresintaktPeriodiseringWorkspace)
registerWorkspace('fastighet', 'fastighetsskatt', FastighetsskattWorkspace)
registerWorkspace('fastighet', 'fastighetsavskrivning', FastighetsavskrivningWorkspace)
registerWorkspace('fastighet', 'underhallsfond', UnderhallsfondWorkspace)
registerWorkspace('fastighet', 'rot-vid-renovering', RotVidRenoveringWorkspace)
registerWorkspace('fastighet', 'indexupprakning', IndexupprakningWorkspace)

// ── Fastighet: Rapport ───────────────────────────────────────
import { DriftnettoPerFastighetWorkspace } from '@/components/modules/fastighet/DriftnettoPerFastighetWorkspace'
import { VakansgradWorkspace } from '@/components/modules/fastighet/VakansgradWorkspace'
import { UnderhallskostnadPerM2Workspace } from '@/components/modules/fastighet/UnderhallskostnadPerM2Workspace'

registerWorkspace('fastighet', 'driftnetto-per-fastighet', DriftnettoPerFastighetWorkspace)
registerWorkspace('fastighet', 'vakansgrad', VakansgradWorkspace)
registerWorkspace('fastighet', 'underhallskostnad-per-m2', UnderhallskostnadPerM2Workspace)

// ── Fastighet: Import ────────────────────────────────────────
import { HyresreskontraImportWorkspace } from '@/components/modules/fastighet/HyresreskontraImportWorkspace'
import { EnergirapportImportWorkspace } from '@/components/modules/fastighet/EnergirapportImportWorkspace'

registerWorkspace('fastighet', 'hyresreskontra-import', HyresreskontraImportWorkspace)
registerWorkspace('fastighet', 'energirapport-import', EnergirapportImportWorkspace)

// ── Fastighet: Operativ ──────────────────────────────────────
import { ObjektregisterWorkspace } from '@/components/modules/fastighet/ObjektregisterWorkspace'
import { HyresgasthanteringWorkspace } from '@/components/modules/fastighet/HyresgasthanteringWorkspace'
import { HyresavierWorkspace } from '@/components/modules/fastighet/HyresavierWorkspace'
import { FelanmalanWorkspace } from '@/components/modules/fastighet/FelanmalanWorkspace'
import { UnderhallsplaneringWorkspace } from '@/components/modules/fastighet/UnderhallsplaneringWorkspace'
import { BesiktningRonderingWorkspace } from '@/components/modules/fastighet/BesiktningRonderingWorkspace'
import { EnergiovervaningWorkspace } from '@/components/modules/fastighet/EnergiovervaningWorkspace'

registerWorkspace('fastighet', 'objektregister', ObjektregisterWorkspace)
registerWorkspace('fastighet', 'hyresgasthantering', HyresgasthanteringWorkspace)
registerWorkspace('fastighet', 'hyresavier', HyresavierWorkspace)
registerWorkspace('fastighet', 'felanmalan', FelanmalanWorkspace)
registerWorkspace('fastighet', 'underhallsplanering', UnderhallsplaneringWorkspace)
registerWorkspace('fastighet', 'besiktning-rondering', BesiktningRonderingWorkspace)
registerWorkspace('fastighet', 'energiovervakning', EnergiovervaningWorkspace)
