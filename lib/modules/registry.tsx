import type { ComponentType } from 'react'
import dynamic from 'next/dynamic'
import type { ModuleItem } from '@/lib/modules-data'
import { ModuleLoadingSkeleton } from '@/components/modules/shared/ModuleLoadingSkeleton'

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
registerWorkspace('restaurang', 'restaurangkontoplan',
  dynamic(() => import('@/components/modules/restaurang/RestaurangkontoplanWorkspace').then(m => m.RestaurangkontoplanWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('restaurang', 'momssplit-mat-dryck',
  dynamic(() => import('@/components/modules/restaurang/MomssplitWorkspace').then(m => m.MomssplitWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('restaurang', 'dagskassaavstamning',
  dynamic(() => import('@/components/modules/restaurang/DagskassaavstamningWorkspace').then(m => m.DagskassaavstamningWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('restaurang', 'tipsbokforing',
  dynamic(() => import('@/components/modules/restaurang/TipsbokforingWorkspace').then(m => m.TipsbokforingWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('restaurang', 'personalliggare',
  dynamic(() => import('@/components/modules/restaurang/PersonalliggareWorkspace').then(m => m.PersonalliggareWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('restaurang', 'alkoholpunktskatt',
  dynamic(() => import('@/components/modules/restaurang/AlkoholpunktskattWorkspace').then(m => m.AlkoholpunktskattWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('restaurang', 'representationsbokforing',
  dynamic(() => import('@/components/modules/restaurang/RepresentationsbokforingWorkspace').then(m => m.RepresentationsbokforingWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Restaurang: Rapport ──────────────────────────────────────
registerWorkspace('restaurang', 'matkostnad',
  dynamic(() => import('@/components/modules/restaurang/MatkostnadWorkspace').then(m => m.MatkostnadWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('restaurang', 'personalkostnad-vs-omsattning',
  dynamic(() => import('@/components/modules/restaurang/PersonalkostnadWorkspace').then(m => m.PersonalkostnadWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('restaurang', 'svinnrapport',
  dynamic(() => import('@/components/modules/restaurang/SvinnrapportWorkspace').then(m => m.SvinnrapportWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('restaurang', 'revpash',
  dynamic(() => import('@/components/modules/restaurang/RevpashWorkspace').then(m => m.RevpashWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Restaurang: Import ───────────────────────────────────────
registerWorkspace('restaurang', 'z-rapport-import',
  dynamic(() => import('@/components/modules/restaurang/ZrapportImportWorkspace').then(m => m.ZrapportImportWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('restaurang', 'leverantorsfaktura-import',
  dynamic(() => import('@/components/modules/restaurang/LeverantorsfakturaImportWorkspace').then(m => m.LeverantorsfakturaImportWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Restaurang: Operativ ─────────────────────────────────────
registerWorkspace('restaurang', 'menyhantering',
  dynamic(() => import('@/components/modules/restaurang/MenyhanteringWorkspace').then(m => m.MenyhanteringWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('restaurang', 'bordsbokning',
  dynamic(() => import('@/components/modules/restaurang/BordsbokningWorkspace').then(m => m.BordsbokningWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('restaurang', 'receptkalkyl',
  dynamic(() => import('@/components/modules/restaurang/ReceptkalkylWorkspace').then(m => m.ReceptkalkylWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('restaurang', 'personalschema',
  dynamic(() => import('@/components/modules/restaurang/PersonalschemaWorkspace').then(m => m.PersonalschemaWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('restaurang', 'leverantorsbestallning',
  dynamic(() => import('@/components/modules/restaurang/LeverantorsbestallningWorkspace').then(m => m.LeverantorsbestallningWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Hotell: Bokföring ────────────────────────────────────────
registerWorkspace('hotell', 'hotellkontoplan',
  dynamic(() => import('@/components/modules/hotell/HotellkontoplanWorkspace').then(m => m.HotellkontoplanWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('hotell', 'momssplit-boende-tjanst',
  dynamic(() => import('@/components/modules/hotell/MomssplitBoendeTjanstWorkspace').then(m => m.MomssplitBoendeTjanstWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('hotell', 'forskottsbetalning',
  dynamic(() => import('@/components/modules/hotell/ForskottsbetalningWorkspace').then(m => m.ForskottsbetalningWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('hotell', 'provisionshantering',
  dynamic(() => import('@/components/modules/hotell/ProvisionshanteringWorkspace').then(m => m.ProvisionshanteringWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('hotell', 'nattrevision',
  dynamic(() => import('@/components/modules/hotell/NattrevisionWorkspace').then(m => m.NattrevisionWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Hotell: Rapport ──────────────────────────────────────────
registerWorkspace('hotell', 'revpar',
  dynamic(() => import('@/components/modules/hotell/RevparWorkspace').then(m => m.RevparWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('hotell', 'adr',
  dynamic(() => import('@/components/modules/hotell/AdrWorkspace').then(m => m.AdrWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('hotell', 'belaggningsgrad',
  dynamic(() => import('@/components/modules/hotell/BelaggningsgradWorkspace').then(m => m.BelaggningsgradWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('hotell', 'kanallonsamhet',
  dynamic(() => import('@/components/modules/hotell/KanallonsamhetWorkspace').then(m => m.KanallonsamhetWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Hotell: Import ───────────────────────────────────────────
registerWorkspace('hotell', 'pms-import',
  dynamic(() => import('@/components/modules/hotell/PmsImportWorkspace').then(m => m.PmsImportWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('hotell', 'channel-manager-rapport',
  dynamic(() => import('@/components/modules/hotell/ChannelManagerRapportWorkspace').then(m => m.ChannelManagerRapportWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Hotell: Operativ ─────────────────────────────────────────
registerWorkspace('hotell', 'rumsbokning',
  dynamic(() => import('@/components/modules/hotell/RumsbokningWorkspace').then(m => m.RumsbokningWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('hotell', 'gastregister',
  dynamic(() => import('@/components/modules/hotell/GastregisterWorkspace').then(m => m.GastregisterWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('hotell', 'stadschema',
  dynamic(() => import('@/components/modules/hotell/StadschemaWorkspace').then(m => m.StadschemaWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('hotell', 'sasongsplanering',
  dynamic(() => import('@/components/modules/hotell/SasongsplaneringWorkspace').then(m => m.SasongsplaneringWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('hotell', 'gastkommunikation',
  dynamic(() => import('@/components/modules/hotell/GastkommunikationWorkspace').then(m => m.GastkommunikationWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Tech: Bokföring ──────────────────────────────────────────
registerWorkspace('tech', 'it-kontoplan',
  dynamic(() => import('@/components/modules/tech/ItKontoplanWorkspace').then(m => m.ItKontoplanWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('tech', 'projektredovisning',
  dynamic(() => import('@/components/modules/tech/ProjektredovisningWorkspace').then(m => m.ProjektredovisningWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('tech', 'fou-avdrag',
  dynamic(() => import('@/components/modules/tech/FouAvdragWorkspace').then(m => m.FouAvdragWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('tech', 'licensavskrivning',
  dynamic(() => import('@/components/modules/tech/LicensavskrivningWorkspace').then(m => m.LicensavskrivningWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('tech', 'eu-tjanstmoms',
  dynamic(() => import('@/components/modules/tech/EuTjanstmomsWorkspace').then(m => m.EuTjanstmomsWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Tech: Rapport ────────────────────────────────────────────
registerWorkspace('tech', 'debiteringsgrad',
  dynamic(() => import('@/components/modules/tech/DebiteringsgradWorkspace').then(m => m.DebiteringsgradWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('tech', 'projektlonsamhet',
  dynamic(() => import('@/components/modules/tech/ProjektlonsamhetWorkspace').then(m => m.ProjektlonsamhetWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('tech', 'mrr-arr',
  dynamic(() => import('@/components/modules/tech/MrrArrWorkspace').then(m => m.MrrArrWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Tech: Import ─────────────────────────────────────────────
registerWorkspace('tech', 'tidrapport-import',
  dynamic(() => import('@/components/modules/tech/TidrapportImportWorkspace').then(m => m.TidrapportImportWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Tech: Operativ ───────────────────────────────────────────
registerWorkspace('tech', 'projekthantering',
  dynamic(() => import('@/components/modules/tech/ProjekthanteringWorkspace').then(m => m.ProjekthanteringWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('tech', 'tidrapportering',
  dynamic(() => import('@/components/modules/tech/TidrapporteringWorkspace').then(m => m.TidrapporteringWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('tech', 'arendehantering',
  dynamic(() => import('@/components/modules/tech/ArendehanteringWorkspace').then(m => m.ArendehanteringWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('tech', 'resursplanering',
  dynamic(() => import('@/components/modules/tech/ResursplaneringWorkspace').then(m => m.ResursplaneringWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Bygg: Bokföring ──────────────────────────────────────────
registerWorkspace('bygg', 'byggkontoplan',
  dynamic(() => import('@/components/modules/bygg/ByggkontoplanWorkspace').then(m => m.ByggkontoplanWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('bygg', 'omvand-skattskyldighet-bygg',
  dynamic(() => import('@/components/modules/bygg/OmvandSkattskyldighetByggWorkspace').then(m => m.OmvandSkattskyldighetByggWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('bygg', 'rot-avdrag',
  dynamic(() => import('@/components/modules/bygg/RotAvdragWorkspace').then(m => m.RotAvdragWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('bygg', 'successiv-vinstavrakning',
  dynamic(() => import('@/components/modules/bygg/SuccessivVinstavrakningWorkspace').then(m => m.SuccessivVinstavrakningWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('bygg', 'ue-attestering',
  dynamic(() => import('@/components/modules/bygg/UeAttesteringWorkspace').then(m => m.UeAttesteringWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('bygg', 'personalliggare-bygg',
  dynamic(() => import('@/components/modules/bygg/PersonalliggareByggWorkspace').then(m => m.PersonalliggareByggWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('bygg', 'ata-bokforing',
  dynamic(() => import('@/components/modules/bygg/AtaBokforingWorkspace').then(m => m.AtaBokforingWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Bygg: Rapport ────────────────────────────────────────────
registerWorkspace('bygg', 'projektmarginal',
  dynamic(() => import('@/components/modules/bygg/ProjektmarginalWorkspace').then(m => m.ProjektmarginalWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('bygg', 'ata-analys',
  dynamic(() => import('@/components/modules/bygg/AtaAnalysWorkspace').then(m => m.AtaAnalysWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('bygg', 'likviditet-per-projekt',
  dynamic(() => import('@/components/modules/bygg/LikviditetPerProjektWorkspace').then(m => m.LikviditetPerProjektWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Bygg: Import ─────────────────────────────────────────────
registerWorkspace('bygg', 'ue-fakturaimport',
  dynamic(() => import('@/components/modules/bygg/UeFakturaimportWorkspace').then(m => m.UeFakturaimportWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('bygg', 'materialkostnadsimport',
  dynamic(() => import('@/components/modules/bygg/MaterialkostnadsimportWorkspace').then(m => m.MaterialkostnadsimportWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Bygg: Operativ ───────────────────────────────────────────
registerWorkspace('bygg', 'projektkalkyl',
  dynamic(() => import('@/components/modules/bygg/ProjektkalkylWorkspace').then(m => m.ProjektkalkylWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('bygg', 'ata-hantering',
  dynamic(() => import('@/components/modules/bygg/AtaHanteringWorkspace').then(m => m.AtaHanteringWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('bygg', 'byggdagbok',
  dynamic(() => import('@/components/modules/bygg/ByggdagbokWorkspace').then(m => m.ByggdagbokWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('bygg', 'ritningshantering',
  dynamic(() => import('@/components/modules/bygg/RitningshanteringWorkspace').then(m => m.RitningshanteringWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('bygg', 'materialbestallning',
  dynamic(() => import('@/components/modules/bygg/MaterialbestallningWorkspace').then(m => m.MaterialbestallningWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Hälsa: Bokföring ─────────────────────────────────────────
registerWorkspace('halsa', 'vardkontoplan',
  dynamic(() => import('@/components/modules/halsa/VardkontoplanWorkspace').then(m => m.VardkontoplanWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('halsa', 'momsfrihet-sjukvard',
  dynamic(() => import('@/components/modules/halsa/MomsfrihetSjukvardWorkspace').then(m => m.MomsfrihetSjukvardWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('halsa', 'forsakringsersattning',
  dynamic(() => import('@/components/modules/halsa/ForsakringsersattningWorkspace').then(m => m.ForsakringsersattningWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('halsa', 'frikort-hogkostnadsskydd',
  dynamic(() => import('@/components/modules/halsa/FrikortHogkostnadsskyddWorkspace').then(m => m.FrikortHogkostnadsskyddWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Hälsa: Rapport ───────────────────────────────────────────
registerWorkspace('halsa', 'intakt-per-behandlare',
  dynamic(() => import('@/components/modules/halsa/IntaktPerBehandlareWorkspace').then(m => m.IntaktPerBehandlareWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('halsa', 'patientmix',
  dynamic(() => import('@/components/modules/halsa/PatientmixWorkspace').then(m => m.PatientmixWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Hälsa: Import ────────────────────────────────────────────
registerWorkspace('halsa', 'regionersattningsimport',
  dynamic(() => import('@/components/modules/halsa/RegionersattningsimportWorkspace').then(m => m.RegionersattningsimportWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('halsa', 'forsakringsrapport-import',
  dynamic(() => import('@/components/modules/halsa/ForsakringsrapportImportWorkspace').then(m => m.ForsakringsrapportImportWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Hälsa: Operativ ──────────────────────────────────────────
registerWorkspace('halsa', 'patientbokning',
  dynamic(() => import('@/components/modules/halsa/PatientbokningWorkspace').then(m => m.PatientbokningWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('halsa', 'journalhantering',
  dynamic(() => import('@/components/modules/halsa/JournalhanteringWorkspace').then(m => m.JournalhanteringWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('halsa', 'remisshantering',
  dynamic(() => import('@/components/modules/halsa/RemisshanteringWorkspace').then(m => m.RemisshanteringWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('halsa', 'kassasystem-patientavgifter',
  dynamic(() => import('@/components/modules/halsa/KassasystemPatientavgifterWorkspace').then(m => m.KassasystemPatientavgifterWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Detaljhandel: Bokföring ──────────────────────────────────
registerWorkspace('detaljhandel', 'detaljhandelskontoplan',
  dynamic(() => import('@/components/modules/detaljhandel/DetaljhandelskontoplanWorkspace').then(m => m.DetaljhandelskontoplanWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('detaljhandel', 'lagervardering',
  dynamic(() => import('@/components/modules/detaljhandel/LagervaderingWorkspace').then(m => m.LagervaderingWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('detaljhandel', 'kassaavstamning-butik',
  dynamic(() => import('@/components/modules/detaljhandel/KassaavstamningButikWorkspace').then(m => m.KassaavstamningButikWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('detaljhandel', 'svinnbokforing',
  dynamic(() => import('@/components/modules/detaljhandel/SvinnbokforingWorkspace').then(m => m.SvinnbokforingWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('detaljhandel', 'personalliggare-butik',
  dynamic(() => import('@/components/modules/detaljhandel/PersonalliggareButikWorkspace').then(m => m.PersonalliggareButikWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Detaljhandel: Rapport ────────────────────────────────────
registerWorkspace('detaljhandel', 'bruttomarginal-per-varugrupp',
  dynamic(() => import('@/components/modules/detaljhandel/BruttomarginalPerVarugruppWorkspace').then(m => m.BruttomarginalPerVarugruppWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('detaljhandel', 'lageromsattningshastighet',
  dynamic(() => import('@/components/modules/detaljhandel/LageromsattningshastighetWorkspace').then(m => m.LageromsattningshastighetWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('detaljhandel', 'svinnprocent',
  dynamic(() => import('@/components/modules/detaljhandel/SvinnprocentWorkspace').then(m => m.SvinnprocentWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('detaljhandel', 'forsaljning-per-m2',
  dynamic(() => import('@/components/modules/detaljhandel/ForsaljningPerM2Workspace').then(m => m.ForsaljningPerM2Workspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Detaljhandel: Import ─────────────────────────────────────
registerWorkspace('detaljhandel', 'pos-z-rapport-import',
  dynamic(() => import('@/components/modules/detaljhandel/PosZrapportImportWorkspace').then(m => m.PosZrapportImportWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('detaljhandel', 'inventeringsimport',
  dynamic(() => import('@/components/modules/detaljhandel/InventeringsimportWorkspace').then(m => m.InventeringsimportWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('detaljhandel', 'leverantorsfaktura-import-butik',
  dynamic(() => import('@/components/modules/detaljhandel/LeverantorsfakturaImportButikWorkspace').then(m => m.LeverantorsfakturaImportButikWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Detaljhandel: Operativ ───────────────────────────────────
registerWorkspace('detaljhandel', 'lagerhantering',
  dynamic(() => import('@/components/modules/detaljhandel/LagerhanteringWorkspace').then(m => m.LagerhanteringWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('detaljhandel', 'kampanjer-rabatter',
  dynamic(() => import('@/components/modules/detaljhandel/KampanjerRabatterWorkspace').then(m => m.KampanjerRabatterWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('detaljhandel', 'kundklubb',
  dynamic(() => import('@/components/modules/detaljhandel/KundklubbWorkspace').then(m => m.KundklubbWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('detaljhandel', 'prishantering',
  dynamic(() => import('@/components/modules/detaljhandel/PrishanteringWorkspace').then(m => m.PrishanteringWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('detaljhandel', 'butiksdrift-schema',
  dynamic(() => import('@/components/modules/detaljhandel/ButiksdriftSchemaWorkspace').then(m => m.ButiksdriftSchemaWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── E-handel: Bokföring ──────────────────────────────────────
registerWorkspace('ehandel', 'ehandelskontoplan',
  dynamic(() => import('@/components/modules/ehandel/EhandelskontoplanWorkspace').then(m => m.EhandelskontoplanWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('ehandel', 'lagervardering-ehandel',
  dynamic(() => import('@/components/modules/ehandel/LagervaderingEhandelWorkspace').then(m => m.LagervaderingEhandelWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('ehandel', 'returbokforing',
  dynamic(() => import('@/components/modules/ehandel/ReturbokforingWorkspace').then(m => m.ReturbokforingWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('ehandel', 'multi-currency',
  dynamic(() => import('@/components/modules/ehandel/MultiCurrencyWorkspace').then(m => m.MultiCurrencyWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('ehandel', 'eu-moms-oss',
  dynamic(() => import('@/components/modules/ehandel/EuMomsOssWorkspace').then(m => m.EuMomsOssWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('ehandel', 'plattformsavgifter',
  dynamic(() => import('@/components/modules/ehandel/PlattformsavgifterWorkspace').then(m => m.PlattformsavgifterWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── E-handel: Rapport ────────────────────────────────────────
registerWorkspace('ehandel', 'returprocent',
  dynamic(() => import('@/components/modules/ehandel/ReturprocentWorkspace').then(m => m.ReturprocentWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('ehandel', 'genomsnittligt-ordervarde',
  dynamic(() => import('@/components/modules/ehandel/GenomsnittligtOrdervardeWorkspace').then(m => m.GenomsnittligtOrdervardeWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('ehandel', 'kanalfordelning',
  dynamic(() => import('@/components/modules/ehandel/KanalfordelningWorkspace').then(m => m.KanalfordelningWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('ehandel', 'fraktkostnad-vs-intakt',
  dynamic(() => import('@/components/modules/ehandel/FraktkostnadVsIntaktWorkspace').then(m => m.FraktkostnadVsIntaktWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── E-handel: Import ─────────────────────────────────────────
registerWorkspace('ehandel', 'shopify-woo-import',
  dynamic(() => import('@/components/modules/ehandel/ShopifyWooImportWorkspace').then(m => m.ShopifyWooImportWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('ehandel', 'klarna-rapport-import',
  dynamic(() => import('@/components/modules/ehandel/KlarnaRapportImportWorkspace').then(m => m.KlarnaRapportImportWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('ehandel', 'fraktrapport-import',
  dynamic(() => import('@/components/modules/ehandel/FraktrapportImportWorkspace').then(m => m.FraktrapportImportWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── E-handel: Operativ ───────────────────────────────────────
registerWorkspace('ehandel', 'orderhantering',
  dynamic(() => import('@/components/modules/ehandel/OrderhanteringWorkspace').then(m => m.OrderhanteringWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('ehandel', 'frakthantering',
  dynamic(() => import('@/components/modules/ehandel/FrakthanteringWorkspace').then(m => m.FrakthanteringWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('ehandel', 'returhantering-operativ',
  dynamic(() => import('@/components/modules/ehandel/ReturhanteringOperativWorkspace').then(m => m.ReturhanteringOperativWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('ehandel', 'produktdatahantering',
  dynamic(() => import('@/components/modules/ehandel/ProduktdatahanteringWorkspace').then(m => m.ProduktdatahanteringWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Frisör: Bokföring ────────────────────────────────────────
registerWorkspace('frisor', 'salongkontoplan',
  dynamic(() => import('@/components/modules/frisor/SalongkontoplanWorkspace').then(m => m.SalongkontoplanWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('frisor', 'provisionsberakning',
  dynamic(() => import('@/components/modules/frisor/ProvisionsberakningWorkspace').then(m => m.ProvisionsberakningWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('frisor', 'presentkort-som-skuld',
  dynamic(() => import('@/components/modules/frisor/PresentkortSomSkuldWorkspace').then(m => m.PresentkortSomSkuldWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('frisor', 'kassaavstamning-salong',
  dynamic(() => import('@/components/modules/frisor/KassaavstamningSalongWorkspace').then(m => m.KassaavstamningSalongWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('frisor', 'personalliggare-salong',
  dynamic(() => import('@/components/modules/frisor/PersonalliggareSalongWorkspace').then(m => m.PersonalliggareSalongWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Frisör: Rapport ──────────────────────────────────────────
registerWorkspace('frisor', 'intakt-per-stol',
  dynamic(() => import('@/components/modules/frisor/IntaktPerStolWorkspace').then(m => m.IntaktPerStolWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('frisor', 'provisionsandel',
  dynamic(() => import('@/components/modules/frisor/ProvisionsandelWorkspace').then(m => m.ProvisionsandelWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('frisor', 'produktforsaljning-per-besok',
  dynamic(() => import('@/components/modules/frisor/ProduktforsaljningPerBesokWorkspace').then(m => m.ProduktforsaljningPerBesokWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Frisör: Import ───────────────────────────────────────────
registerWorkspace('frisor', 'kassarapport-import-salong',
  dynamic(() => import('@/components/modules/frisor/KassarapportImportSalongWorkspace').then(m => m.KassarapportImportSalongWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('frisor', 'bokningssystem-import',
  dynamic(() => import('@/components/modules/frisor/BokningssystemImportWorkspace').then(m => m.BokningssystemImportWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Frisör: Operativ ─────────────────────────────────────────
registerWorkspace('frisor', 'tidsbokning',
  dynamic(() => import('@/components/modules/frisor/TidsbokningWorkspace').then(m => m.TidsbokningWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('frisor', 'kundkort',
  dynamic(() => import('@/components/modules/frisor/KundkortWorkspace').then(m => m.KundkortWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('frisor', 'sms-paminnelser',
  dynamic(() => import('@/components/modules/frisor/SmsPaminnelserWorkspace').then(m => m.SmsPaminnelserWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('frisor', 'skiftschema-salong',
  dynamic(() => import('@/components/modules/frisor/SkiftschemaSalongWorkspace').then(m => m.SkiftschemaSalongWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Transport: Bokföring ─────────────────────────────────────
registerWorkspace('transport', 'transportkontoplan',
  dynamic(() => import('@/components/modules/transport/TransportkontoplanWorkspace').then(m => m.TransportkontoplanWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('transport', 'fordonsavskrivning',
  dynamic(() => import('@/components/modules/transport/FordonsavskrivningWorkspace').then(m => m.FordonsavskrivningWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('transport', 'leasinghantering',
  dynamic(() => import('@/components/modules/transport/LeasinghanteringWorkspace').then(m => m.LeasinghanteringWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('transport', 'trangselskatt',
  dynamic(() => import('@/components/modules/transport/TrangselskattWorkspace').then(m => m.TrangselskattWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('transport', 'milersattning-vs-faktisk-kostnad',
  dynamic(() => import('@/components/modules/transport/MilersattningVsFaktiskKostnadWorkspace').then(m => m.MilersattningVsFaktiskKostnadWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Transport: Rapport ───────────────────────────────────────
registerWorkspace('transport', 'kostnad-per-mil',
  dynamic(() => import('@/components/modules/transport/KostnadPerMilWorkspace').then(m => m.KostnadPerMilWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('transport', 'intakt-per-fordon',
  dynamic(() => import('@/components/modules/transport/IntaktPerFordonWorkspace').then(m => m.IntaktPerFordonWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('transport', 'bransleeffektivitet',
  dynamic(() => import('@/components/modules/transport/BransleeffektivitetWorkspace').then(m => m.BransleeffektivitetWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Transport: Import ────────────────────────────────────────
registerWorkspace('transport', 'branslekort-import',
  dynamic(() => import('@/components/modules/transport/BranslekortImportWorkspace').then(m => m.BranslekortImportWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('transport', 'vagtulls-import',
  dynamic(() => import('@/components/modules/transport/VagtullsImportWorkspace').then(m => m.VagtullsImportWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Transport: Operativ ──────────────────────────────────────
registerWorkspace('transport', 'flottahantering',
  dynamic(() => import('@/components/modules/transport/FlottahanteringWorkspace').then(m => m.FlottahanteringWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('transport', 'ruttplanering',
  dynamic(() => import('@/components/modules/transport/RuttplaneringWorkspace').then(m => m.RuttplaneringWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('transport', 'leveranssparning',
  dynamic(() => import('@/components/modules/transport/LeveranssparningWorkspace').then(m => m.LeveranssparningWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('transport', 'fordonsunderhall',
  dynamic(() => import('@/components/modules/transport/FordonsunderhallWorkspace').then(m => m.FordonsunderhallWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('transport', 'chauforshantering',
  dynamic(() => import('@/components/modules/transport/ChauforshanteringWorkspace').then(m => m.ChauforshanteringWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('transport', 'fraktsedlar-dokument',
  dynamic(() => import('@/components/modules/transport/FraktsedlarDokumentWorkspace').then(m => m.FraktsedlarDokumentWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Juridik: Bokföring ───────────────────────────────────────
registerWorkspace('juridik', 'juristkontoplan',
  dynamic(() => import('@/components/modules/juridik/JuristkontoplanWorkspace').then(m => m.JuristkontoplanWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('juridik', 'klientmedelskonto',
  dynamic(() => import('@/components/modules/juridik/KlientmedelskontoWorkspace').then(m => m.KlientmedelskontoWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('juridik', 'wip-vardering',
  dynamic(() => import('@/components/modules/juridik/WipVarderingWorkspace').then(m => m.WipVarderingWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('juridik', 'a-conto-bokforing',
  dynamic(() => import('@/components/modules/juridik/AContoBokforingWorkspace').then(m => m.AContoBokforingWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Juridik: Rapport ─────────────────────────────────────────
registerWorkspace('juridik', 'debiteringsgrad-juridik',
  dynamic(() => import('@/components/modules/juridik/DebiteringsgradJuridikWorkspace').then(m => m.DebiteringsgradJuridikWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('juridik', 'realisationsgrad',
  dynamic(() => import('@/components/modules/juridik/RealisationsgradWorkspace').then(m => m.RealisationsgradWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('juridik', 'genomsnittlig-timintakt',
  dynamic(() => import('@/components/modules/juridik/GenomsnittligTimintaktWorkspace').then(m => m.GenomsnittligTimintaktWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('juridik', 'wip-rapport',
  dynamic(() => import('@/components/modules/juridik/WipRapportWorkspace').then(m => m.WipRapportWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Juridik: Import ──────────────────────────────────────────
registerWorkspace('juridik', 'tidrapport-import-juridik',
  dynamic(() => import('@/components/modules/juridik/TidrapportImportJuridikWorkspace').then(m => m.TidrapportImportJuridikWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Juridik: Operativ ────────────────────────────────────────
registerWorkspace('juridik', 'arendehantering-juridik',
  dynamic(() => import('@/components/modules/juridik/ArendehanteringJuridikWorkspace').then(m => m.ArendehanteringJuridikWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('juridik', 'tidrapportering-juridik',
  dynamic(() => import('@/components/modules/juridik/TidrapporteringJuridikWorkspace').then(m => m.TidrapporteringJuridikWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('juridik', 'dokumenthantering',
  dynamic(() => import('@/components/modules/juridik/DokumenthanteringWorkspace').then(m => m.DokumenthanteringWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('juridik', 'deadlinebevakning',
  dynamic(() => import('@/components/modules/juridik/DeadlinebevakningWorkspace').then(m => m.DeadlinebevakningWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('juridik', 'intressekonfliktskontroll',
  dynamic(() => import('@/components/modules/juridik/IntressekonfliktskontrollWorkspace').then(m => m.IntressekonfliktskontrollWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Utbildning: Bokföring ────────────────────────────────────
registerWorkspace('utbildning', 'utbildningskontoplan',
  dynamic(() => import('@/components/modules/utbildning/UtbildningskontoplanWorkspace').then(m => m.UtbildningskontoplanWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('utbildning', 'maxtaxa-fakturering',
  dynamic(() => import('@/components/modules/utbildning/MaxtaxaFaktureringWorkspace').then(m => m.MaxtaxaFaktureringWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('utbildning', 'statsbidragsperiodisering',
  dynamic(() => import('@/components/modules/utbildning/StatsbidragsperiodiseringWorkspace').then(m => m.StatsbidragsperiodiseringWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('utbildning', 'momsfrihet-utbildning',
  dynamic(() => import('@/components/modules/utbildning/MomsfrihetUtbildningWorkspace').then(m => m.MomsfrihetUtbildningWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Utbildning: Rapport ──────────────────────────────────────
registerWorkspace('utbildning', 'kostnad-per-barn-elev',
  dynamic(() => import('@/components/modules/utbildning/KostnadPerBarnElevWorkspace').then(m => m.KostnadPerBarnElevWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('utbildning', 'personaltathet',
  dynamic(() => import('@/components/modules/utbildning/PersonaltathetWorkspace').then(m => m.PersonaltathetWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Utbildning: Import ───────────────────────────────────────
registerWorkspace('utbildning', 'kommunal-peng-import',
  dynamic(() => import('@/components/modules/utbildning/KommunalPengImportWorkspace').then(m => m.KommunalPengImportWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Utbildning: Operativ ─────────────────────────────────────
registerWorkspace('utbildning', 'schemalaeggning',
  dynamic(() => import('@/components/modules/utbildning/SchemalagggningWorkspace').then(m => m.SchemalagggningWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('utbildning', 'elevregister',
  dynamic(() => import('@/components/modules/utbildning/ElevregisterWorkspace').then(m => m.ElevregisterWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('utbildning', 'narvarohantering',
  dynamic(() => import('@/components/modules/utbildning/NarvarohanteringWorkspace').then(m => m.NarvarohanteringWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('utbildning', 'foraldrakommunikation',
  dynamic(() => import('@/components/modules/utbildning/ForaldrakommunikationWorkspace').then(m => m.ForaldrakommunikationWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('utbildning', 'matsedel-allergikost',
  dynamic(() => import('@/components/modules/utbildning/MatsedelAllergikostWorkspace').then(m => m.MatsedelAllergikostWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('utbildning', 'vikariebokning',
  dynamic(() => import('@/components/modules/utbildning/VikariebokningWorkspace').then(m => m.VikariebokningWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Jordbruk: Bokföring ──────────────────────────────────────
registerWorkspace('jordbruk', 'jordbrukskontoplan',
  dynamic(() => import('@/components/modules/jordbruk/JordbrukskontoplanWorkspace').then(m => m.JordbrukskontoplanWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('jordbruk', 'skogskonto',
  dynamic(() => import('@/components/modules/jordbruk/SkogskontoWorkspace').then(m => m.SkogskontoWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('jordbruk', 'expansionsfond',
  dynamic(() => import('@/components/modules/jordbruk/ExpansionsfondWorkspace').then(m => m.ExpansionsfondWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('jordbruk', 'rantefordelning',
  dynamic(() => import('@/components/modules/jordbruk/RantefordelningWorkspace').then(m => m.RantefordelningWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('jordbruk', 'eu-stod-som-intakt',
  dynamic(() => import('@/components/modules/jordbruk/EuStodSomIntaktWorkspace').then(m => m.EuStodSomIntaktWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('jordbruk', 'biologiska-tillgangar',
  dynamic(() => import('@/components/modules/jordbruk/BiologiskaTillgangarWorkspace').then(m => m.BiologiskaTillgangarWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('jordbruk', 'momssplit-livsmedel',
  dynamic(() => import('@/components/modules/jordbruk/MomssplitLivsmedelWorkspace').then(m => m.MomssplitLivsmedelWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Jordbruk: Rapport ────────────────────────────────────────
registerWorkspace('jordbruk', 'avkastning-per-hektar',
  dynamic(() => import('@/components/modules/jordbruk/AvkastningPerHektarWorkspace').then(m => m.AvkastningPerHektarWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('jordbruk', 'bidragsberoende',
  dynamic(() => import('@/components/modules/jordbruk/BidragsberoendeWorkspace').then(m => m.BidragsberoendeWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('jordbruk', 'djurkostnad-per-enhet',
  dynamic(() => import('@/components/modules/jordbruk/DjurkostnadPerEnhetWorkspace').then(m => m.DjurkostnadPerEnhetWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Jordbruk: Import ─────────────────────────────────────────
registerWorkspace('jordbruk', 'sam-utbetalningsimport',
  dynamic(() => import('@/components/modules/jordbruk/SamUtbetalningsimportWorkspace').then(m => m.SamUtbetalningsimportWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Jordbruk: Operativ ───────────────────────────────────────
registerWorkspace('jordbruk', 'skordeplanering',
  dynamic(() => import('@/components/modules/jordbruk/SkordeplaneringWorkspace').then(m => m.SkordeplaneringWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('jordbruk', 'djurhallning',
  dynamic(() => import('@/components/modules/jordbruk/DjurhallningWorkspace').then(m => m.DjurhallningWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('jordbruk', 'sparbarhet',
  dynamic(() => import('@/components/modules/jordbruk/SparbarhetWorkspace').then(m => m.SparbarhetWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('jordbruk', 'maskinlogg',
  dynamic(() => import('@/components/modules/jordbruk/MaskinloggWorkspace').then(m => m.MaskinloggWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('jordbruk', 'certifieringar',
  dynamic(() => import('@/components/modules/jordbruk/CertifieringarWorkspace').then(m => m.CertifieringarWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Media: Bokföring ─────────────────────────────────────────
registerWorkspace('media', 'mediakontoplan',
  dynamic(() => import('@/components/modules/media/MediakontoplanWorkspace').then(m => m.MediakontoplanWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('media', 'projektredovisning-media',
  dynamic(() => import('@/components/modules/media/ProjektredovisningMediaWorkspace').then(m => m.ProjektredovisningMediaWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('media', 'freelancer-bokforing',
  dynamic(() => import('@/components/modules/media/FreelancerBokforingWorkspace').then(m => m.FreelancerBokforingWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('media', 'kulturmoms',
  dynamic(() => import('@/components/modules/media/KulturmomsWorkspace').then(m => m.KulturmomsWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('media', 'ip-tillgangar',
  dynamic(() => import('@/components/modules/media/IpTillgangarWorkspace').then(m => m.IpTillgangarWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Media: Rapport ───────────────────────────────────────────
registerWorkspace('media', 'projektlonsamhet-media',
  dynamic(() => import('@/components/modules/media/ProjektlonsamhetMediaWorkspace').then(m => m.ProjektlonsamhetMediaWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('media', 'freelancerandel',
  dynamic(() => import('@/components/modules/media/FreelancerandelWorkspace').then(m => m.FreelancerandelWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('media', 'kundlonsamhet',
  dynamic(() => import('@/components/modules/media/KundlonsamhetWorkspace').then(m => m.KundlonsamhetWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Media: Import ────────────────────────────────────────────
registerWorkspace('media', 'freelancer-fakturaimport',
  dynamic(() => import('@/components/modules/media/FreelancerFakturaimportWorkspace').then(m => m.FreelancerFakturaimportWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('media', 'kampanjrapport-import',
  dynamic(() => import('@/components/modules/media/KampanjrapportImportWorkspace').then(m => m.KampanjrapportImportWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Media: Operativ ──────────────────────────────────────────
registerWorkspace('media', 'projekthantering-media',
  dynamic(() => import('@/components/modules/media/ProjekthanteringMediaWorkspace').then(m => m.ProjekthanteringMediaWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('media', 'innehallsplanering',
  dynamic(() => import('@/components/modules/media/InnehallsplaneringWorkspace').then(m => m.InnehallsplaneringWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('media', 'mediebank',
  dynamic(() => import('@/components/modules/media/MediebankWorkspace').then(m => m.MediebankWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('media', 'tidrapport-debitering-media',
  dynamic(() => import('@/components/modules/media/TidrapportDebiteringMediaWorkspace').then(m => m.TidrapportDebiteringMediaWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Fitness: Bokföring ───────────────────────────────────────
registerWorkspace('fitness', 'fitnesskontoplan',
  dynamic(() => import('@/components/modules/fitness/FitnesskontoplanWorkspace').then(m => m.FitnesskontoplanWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('fitness', 'momssplit-idrott-pt',
  dynamic(() => import('@/components/modules/fitness/MomssplitIdrottPtWorkspace').then(m => m.MomssplitIdrottPtWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('fitness', 'autogiro-periodisering',
  dynamic(() => import('@/components/modules/fitness/AutogiroPeriodiseringWorkspace').then(m => m.AutogiroPeriodiseringWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('fitness', 'klippkort-som-skuld',
  dynamic(() => import('@/components/modules/fitness/KlippkortSomSkuldWorkspace').then(m => m.KlippkortSomSkuldWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('fitness', 'friskvardsbidrag',
  dynamic(() => import('@/components/modules/fitness/FriskvardsbidragWorkspace').then(m => m.FriskvardsbidragWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Fitness: Rapport ─────────────────────────────────────────
registerWorkspace('fitness', 'churn-rate',
  dynamic(() => import('@/components/modules/fitness/ChurnRateWorkspace').then(m => m.ChurnRateWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('fitness', 'intakt-per-medlem',
  dynamic(() => import('@/components/modules/fitness/IntaktPerMedlemWorkspace').then(m => m.IntaktPerMedlemWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('fitness', 'belaggningsgrad-klasser',
  dynamic(() => import('@/components/modules/fitness/BelaggningsgradKlasserWorkspace').then(m => m.BelaggningsgradKlasserWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Fitness: Import ──────────────────────────────────────────
registerWorkspace('fitness', 'autogiro-rapport-import',
  dynamic(() => import('@/components/modules/fitness/AutogiroRapportImportWorkspace').then(m => m.AutogiroRapportImportWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('fitness', 'kassarapport-import-fitness',
  dynamic(() => import('@/components/modules/fitness/KassarapportImportFitnessWorkspace').then(m => m.KassarapportImportFitnessWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Fitness: Operativ ────────────────────────────────────────
registerWorkspace('fitness', 'medlemshantering',
  dynamic(() => import('@/components/modules/fitness/MedlemshanteringWorkspace').then(m => m.MedlemshanteringWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('fitness', 'klassbokning',
  dynamic(() => import('@/components/modules/fitness/KlassbokningWorkspace').then(m => m.KlassbokningWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('fitness', 'pt-bokning',
  dynamic(() => import('@/components/modules/fitness/PtBokningWorkspace').then(m => m.PtBokningWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('fitness', 'tilltradeskontroll',
  dynamic(() => import('@/components/modules/fitness/TilltradeskontrollWorkspace').then(m => m.TilltradeskontrollWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Fordon: Bokföring ────────────────────────────────────────
registerWorkspace('fordon', 'verkstadskontoplan',
  dynamic(() => import('@/components/modules/fordon/VerkstadskontoplanWorkspace').then(m => m.VerkstadskontoplanWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('fordon', 'arbetsorder-till-faktura',
  dynamic(() => import('@/components/modules/fordon/ArbetsorderTillFakturaWorkspace').then(m => m.ArbetsorderTillFakturaWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('fordon', 'reservdelslager',
  dynamic(() => import('@/components/modules/fordon/ReservdelslagerWorkspace').then(m => m.ReservdelslagerWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('fordon', 'vmb-begagnade-delar',
  dynamic(() => import('@/components/modules/fordon/VmbBegagnadeDelarWorkspace').then(m => m.VmbBegagnadeDelarWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('fordon', 'garantiavsattning',
  dynamic(() => import('@/components/modules/fordon/GarantiavsattningWorkspace').then(m => m.GarantiavsattningWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Fordon: Rapport ──────────────────────────────────────────
registerWorkspace('fordon', 'genomsnittligt-ordervarde',
  dynamic(() => import('@/components/modules/fordon/GenomsnittligtOrdervardeFordonWorkspace').then(m => m.GenomsnittligtOrdervardeFordonWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('fordon', 'reservdelsmarginal',
  dynamic(() => import('@/components/modules/fordon/ReservdelsmarginalWorkspace').then(m => m.ReservdelsmarginalWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('fordon', 'verkstadsbelaggning',
  dynamic(() => import('@/components/modules/fordon/VerkstadsbelaggningWorkspace').then(m => m.VerkstadsbelaggningWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Fordon: Import ───────────────────────────────────────────
registerWorkspace('fordon', 'reservdelsleverantor-import',
  dynamic(() => import('@/components/modules/fordon/ReservdelsleverantorImportWorkspace').then(m => m.ReservdelsleverantorImportWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Fordon: Operativ ─────────────────────────────────────────
registerWorkspace('fordon', 'arbetsorder',
  dynamic(() => import('@/components/modules/fordon/ArbetsorderWorkspace').then(m => m.ArbetsorderWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('fordon', 'fordonsregister',
  dynamic(() => import('@/components/modules/fordon/FordonsregisterWorkspace').then(m => m.FordonsregisterWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('fordon', 'verkstadsplanering',
  dynamic(() => import('@/components/modules/fordon/VerkstadsplaneringWorkspace').then(m => m.VerkstadsplaneringWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('fordon', 'besiktningspaminnelse',
  dynamic(() => import('@/components/modules/fordon/BesiktningspaminmelseWorkspace').then(m => m.BesiktningspaminmelseWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Bemanning: Bokföring ─────────────────────────────────────
registerWorkspace('bemanning', 'bemanningskontoplan',
  dynamic(() => import('@/components/modules/bemanning/BemanningskontoplanWorkspace').then(m => m.BemanningskontoplanWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('bemanning', 'tidrapport-dubbelbokforing',
  dynamic(() => import('@/components/modules/bemanning/TidrapportDubbelbokforingWorkspace').then(m => m.TidrapportDubbelbokforingWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('bemanning', 'arbetsgivaravgifter-periodisering',
  dynamic(() => import('@/components/modules/bemanning/ArbetsgivaravgifterPeriodiseringWorkspace').then(m => m.ArbetsgivaravgifterPeriodiseringWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('bemanning', 'ue-verifiering-bemanning',
  dynamic(() => import('@/components/modules/bemanning/UeVerifieringBemanningWorkspace').then(m => m.UeVerifieringBemanningWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('bemanning', 'traktamente-vid-uthyrning',
  dynamic(() => import('@/components/modules/bemanning/TraktamenteVidUthyrningWorkspace').then(m => m.TraktamenteVidUthyrningWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Bemanning: Rapport ───────────────────────────────────────
registerWorkspace('bemanning', 'marginal-per-konsult',
  dynamic(() => import('@/components/modules/bemanning/MarginalPerKonsultWorkspace').then(m => m.MarginalPerKonsultWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('bemanning', 'belaggningsgrad-bemanning',
  dynamic(() => import('@/components/modules/bemanning/BelaggningsgradBemanningWorkspace').then(m => m.BelaggningsgradBemanningWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('bemanning', 'fakturerat-per-konsult',
  dynamic(() => import('@/components/modules/bemanning/FaktureratPerKonsultWorkspace').then(m => m.FaktureratPerKonsultWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Bemanning: Import ────────────────────────────────────────
registerWorkspace('bemanning', 'tidrapport-import-bemanning',
  dynamic(() => import('@/components/modules/bemanning/TidrapportImportBemanningWorkspace').then(m => m.TidrapportImportBemanningWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('bemanning', 'lonesystem-import',
  dynamic(() => import('@/components/modules/bemanning/LonesystemImportWorkspace').then(m => m.LonesystemImportWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Bemanning: Operativ ──────────────────────────────────────
registerWorkspace('bemanning', 'kandidatregister',
  dynamic(() => import('@/components/modules/bemanning/KandidatregisterWorkspace').then(m => m.KandidatregisterWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('bemanning', 'uppdragshantering-bemanning',
  dynamic(() => import('@/components/modules/bemanning/UppdragshanteringBemanningWorkspace').then(m => m.UppdragshanteringBemanningWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('bemanning', 'avtalshantering-bemanning',
  dynamic(() => import('@/components/modules/bemanning/AvtalshanteringBemanningWorkspace').then(m => m.AvtalshanteringBemanningWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('bemanning', 'kompetensregister',
  dynamic(() => import('@/components/modules/bemanning/KompetensregisterWorkspace').then(m => m.KompetensregisterWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('bemanning', 'compliance-bemanning',
  dynamic(() => import('@/components/modules/bemanning/ComplianceBemanningWorkspace').then(m => m.ComplianceBemanningWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Tillverkning: Bokföring ──────────────────────────────────
registerWorkspace('tillverkning', 'tillverkningskontoplan',
  dynamic(() => import('@/components/modules/tillverkning/TillverkningskontoplanWorkspace').then(m => m.TillverkningskontoplanWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('tillverkning', 'trestegslagervarderin',
  dynamic(() => import('@/components/modules/tillverkning/TrestegslagervarderingWorkspace').then(m => m.TrestegslagervarderingWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('tillverkning', 'bom-kalkyl-lagervarde',
  dynamic(() => import('@/components/modules/tillverkning/BomKalkylLagervardeWorkspace').then(m => m.BomKalkylLagervardeWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('tillverkning', 'produktionsavvikelse',
  dynamic(() => import('@/components/modules/tillverkning/ProduktionsavvikelseWorkspace').then(m => m.ProduktionsavvikelseWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('tillverkning', 'maskinavskrivning-industri',
  dynamic(() => import('@/components/modules/tillverkning/MaskinavskrivningIndustriWorkspace').then(m => m.MaskinavskrivningIndustriWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('tillverkning', 'energiskatteavdrag',
  dynamic(() => import('@/components/modules/tillverkning/EnergiskatteavdragWorkspace').then(m => m.EnergiskatteavdragWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Tillverkning: Rapport ────────────────────────────────────
registerWorkspace('tillverkning', 'materialeffektivitet',
  dynamic(() => import('@/components/modules/tillverkning/MaterialeffektivitetWorkspace').then(m => m.MaterialeffektivitetWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('tillverkning', 'kostnad-per-producerad-enhet',
  dynamic(() => import('@/components/modules/tillverkning/KostnadPerProduceradEnhetWorkspace').then(m => m.KostnadPerProduceradEnhetWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('tillverkning', 'oee',
  dynamic(() => import('@/components/modules/tillverkning/OeeWorkspace').then(m => m.OeeWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Tillverkning: Import ─────────────────────────────────────
registerWorkspace('tillverkning', 'produktionsrapport-import',
  dynamic(() => import('@/components/modules/tillverkning/ProduktionsrapportImportWorkspace').then(m => m.ProduktionsrapportImportWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('tillverkning', 'lagerexport-import',
  dynamic(() => import('@/components/modules/tillverkning/LagerexportImportWorkspace').then(m => m.LagerexportImportWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Tillverkning: Operativ ───────────────────────────────────
registerWorkspace('tillverkning', 'produktionsplanering',
  dynamic(() => import('@/components/modules/tillverkning/ProduktionsplaneringWorkspace').then(m => m.ProduktionsplaneringWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('tillverkning', 'strukturlista-bom',
  dynamic(() => import('@/components/modules/tillverkning/StrukturlistaBomWorkspace').then(m => m.StrukturlistaBomWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('tillverkning', 'kvalitetskontroll',
  dynamic(() => import('@/components/modules/tillverkning/KvalitetskontrollWorkspace').then(m => m.KvalitetskontrollWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('tillverkning', 'maskinunderhall',
  dynamic(() => import('@/components/modules/tillverkning/MaskinunderhallWorkspace').then(m => m.MaskinunderhallWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('tillverkning', 'sparbarhet-batch',
  dynamic(() => import('@/components/modules/tillverkning/SparbarhetBatchWorkspace').then(m => m.SparbarhetBatchWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Konsult: Bokföring ───────────────────────────────────────
registerWorkspace('konsult', 'konsultkontoplan',
  dynamic(() => import('@/components/modules/konsult/KonsultkontoplanWorkspace').then(m => m.KonsultkontoplanWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('konsult', 'traktamente',
  dynamic(() => import('@/components/modules/konsult/TraktamenteWorkspace').then(m => m.TraktamenteWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('konsult', 'hemmakontor-avdrag',
  dynamic(() => import('@/components/modules/konsult/HemmakontorAvdragWorkspace').then(m => m.HemmakontorAvdragWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('konsult', 'wip-bevakning-konsult',
  dynamic(() => import('@/components/modules/konsult/WipBevakningKonsultWorkspace').then(m => m.WipBevakningKonsultWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Konsult: Rapport ─────────────────────────────────────────
registerWorkspace('konsult', 'debiteringsgrad-konsult',
  dynamic(() => import('@/components/modules/konsult/DebiteringsgradKonsultWorkspace').then(m => m.DebiteringsgradKonsultWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('konsult', 'intakt-per-konsult',
  dynamic(() => import('@/components/modules/konsult/IntaktPerKonsultWorkspace').then(m => m.IntaktPerKonsultWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Konsult: Import ──────────────────────────────────────────
registerWorkspace('konsult', 'tidrapport-import-konsult',
  dynamic(() => import('@/components/modules/konsult/TidrapportImportKonsultWorkspace').then(m => m.TidrapportImportKonsultWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Konsult: Operativ ────────────────────────────────────────
registerWorkspace('konsult', 'uppdragshantering-konsult',
  dynamic(() => import('@/components/modules/konsult/UppdragshanteringKonsultWorkspace').then(m => m.UppdragshanteringKonsultWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('konsult', 'tidrapportering-konsult',
  dynamic(() => import('@/components/modules/konsult/TidrapporteringKonsultWorkspace').then(m => m.TidrapporteringKonsultWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('konsult', 'offert-avtal',
  dynamic(() => import('@/components/modules/konsult/OffertAvtalWorkspace').then(m => m.OffertAvtalWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Event: Bokföring ─────────────────────────────────────────
registerWorkspace('event', 'eventkontoplan',
  dynamic(() => import('@/components/modules/event/EventkontoplanWorkspace').then(m => m.EventkontoplanWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('event', 'biljettintakt-som-forskott',
  dynamic(() => import('@/components/modules/event/BiljettintaktSomForskottWorkspace').then(m => m.BiljettintaktSomForskottWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('event', 'kulturmoms-event',
  dynamic(() => import('@/components/modules/event/KulturmomsEventWorkspace').then(m => m.KulturmomsEventWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('event', 'artistskatt-sink',
  dynamic(() => import('@/components/modules/event/ArtistskattSinkWorkspace').then(m => m.ArtistskattSinkWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('event', 'sponsorintaktsbokforing',
  dynamic(() => import('@/components/modules/event/SponsorintaktsbokforingWorkspace').then(m => m.SponsorintaktsbokforingWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Event: Rapport ───────────────────────────────────────────
registerWorkspace('event', 'intakt-per-besokare',
  dynamic(() => import('@/components/modules/event/IntaktPerBesokareWorkspace').then(m => m.IntaktPerBesokareWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('event', 'budget-vs-utfall',
  dynamic(() => import('@/components/modules/event/BudgetVsUtfallWorkspace').then(m => m.BudgetVsUtfallWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('event', 'sponsorandel',
  dynamic(() => import('@/components/modules/event/SponsorandelWorkspace').then(m => m.SponsorandelWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Event: Import ────────────────────────────────────────────
registerWorkspace('event', 'biljettsystem-import',
  dynamic(() => import('@/components/modules/event/BiljettsystemImportWorkspace').then(m => m.BiljettsystemImportWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('event', 'pos-rapport-import-event',
  dynamic(() => import('@/components/modules/event/PosRapportImportEventWorkspace').then(m => m.PosRapportImportEventWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Event: Operativ ──────────────────────────────────────────
registerWorkspace('event', 'evenemangsplanering',
  dynamic(() => import('@/components/modules/event/EvenemangsplaneringWorkspace').then(m => m.EvenemangsplaneringWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('event', 'biljettforsaljning',
  dynamic(() => import('@/components/modules/event/BiljettforsaljningWorkspace').then(m => m.BiljettforsaljningWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('event', 'artist-talangbokning',
  dynamic(() => import('@/components/modules/event/ArtistTalangbokningWorkspace').then(m => m.ArtistTalangbokningWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('event', 'sponsorhantering',
  dynamic(() => import('@/components/modules/event/SponsorhanteringWorkspace').then(m => m.SponsorhanteringWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('event', 'volontarhantering',
  dynamic(() => import('@/components/modules/event/VolontarhanteringWorkspace').then(m => m.VolontarhanteringWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Fastighet: Bokföring ─────────────────────────────────────
registerWorkspace('fastighet', 'fastighetskontoplan',
  dynamic(() => import('@/components/modules/fastighet/FastighetskontoplanWorkspace').then(m => m.FastighetskontoplanWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('fastighet', 'hyresintakt-periodisering',
  dynamic(() => import('@/components/modules/fastighet/HyresintaktPeriodiseringWorkspace').then(m => m.HyresintaktPeriodiseringWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('fastighet', 'fastighetsskatt',
  dynamic(() => import('@/components/modules/fastighet/FastighetsskattWorkspace').then(m => m.FastighetsskattWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('fastighet', 'fastighetsavskrivning',
  dynamic(() => import('@/components/modules/fastighet/FastighetsavskrivningWorkspace').then(m => m.FastighetsavskrivningWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('fastighet', 'underhallsfond',
  dynamic(() => import('@/components/modules/fastighet/UnderhallsfondWorkspace').then(m => m.UnderhallsfondWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('fastighet', 'rot-vid-renovering',
  dynamic(() => import('@/components/modules/fastighet/RotVidRenoveringWorkspace').then(m => m.RotVidRenoveringWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('fastighet', 'indexupprakning',
  dynamic(() => import('@/components/modules/fastighet/IndexupprakningWorkspace').then(m => m.IndexupprakningWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Fastighet: Rapport ───────────────────────────────────────
registerWorkspace('fastighet', 'driftnetto-per-fastighet',
  dynamic(() => import('@/components/modules/fastighet/DriftnettoPerFastighetWorkspace').then(m => m.DriftnettoPerFastighetWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('fastighet', 'vakansgrad',
  dynamic(() => import('@/components/modules/fastighet/VakansgradWorkspace').then(m => m.VakansgradWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('fastighet', 'underhallskostnad-per-m2',
  dynamic(() => import('@/components/modules/fastighet/UnderhallskostnadPerM2Workspace').then(m => m.UnderhallskostnadPerM2Workspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Fastighet: Import ────────────────────────────────────────
registerWorkspace('fastighet', 'hyresreskontra-import',
  dynamic(() => import('@/components/modules/fastighet/HyresreskontraImportWorkspace').then(m => m.HyresreskontraImportWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('fastighet', 'energirapport-import',
  dynamic(() => import('@/components/modules/fastighet/EnergirapportImportWorkspace').then(m => m.EnergirapportImportWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)

// ── Fastighet: Operativ ──────────────────────────────────────
registerWorkspace('fastighet', 'objektregister',
  dynamic(() => import('@/components/modules/fastighet/ObjektregisterWorkspace').then(m => m.ObjektregisterWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('fastighet', 'hyresgasthantering',
  dynamic(() => import('@/components/modules/fastighet/HyresgasthanteringWorkspace').then(m => m.HyresgasthanteringWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('fastighet', 'hyresavier',
  dynamic(() => import('@/components/modules/fastighet/HyresavierWorkspace').then(m => m.HyresavierWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('fastighet', 'felanmalan',
  dynamic(() => import('@/components/modules/fastighet/FelanmalanWorkspace').then(m => m.FelanmalanWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('fastighet', 'underhallsplanering',
  dynamic(() => import('@/components/modules/fastighet/UnderhallsplaneringWorkspace').then(m => m.UnderhallsplaneringWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('fastighet', 'besiktning-rondering',
  dynamic(() => import('@/components/modules/fastighet/BesiktningRonderingWorkspace').then(m => m.BesiktningRonderingWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
registerWorkspace('fastighet', 'energiovervakning',
  dynamic(() => import('@/components/modules/fastighet/EnergiovervaningWorkspace').then(m => m.EnergiovervaningWorkspace), { loading: () => <ModuleLoadingSkeleton /> })
)
