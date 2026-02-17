import Link from 'next/link'
import {
  UtensilsCrossed,
  BedDouble,
  Monitor,
  HardHat,
  HeartPulse,
  Store,
  ShoppingCart,
  Scissors,
  Truck,
  Scale,
  GraduationCap,
  Wheat,
  Film,
  Dumbbell,
  Wrench,
  UserPlus,
  Factory,
  Briefcase,
  PartyPopper,
  Building,
  Layers,
  ChevronRight,
} from 'lucide-react'

const sectors = [
  { name: 'Restaurang & Café', slug: 'restaurang', icon: UtensilsCrossed, description: 'Menyhantering, bordsbokning & kassa' },
  { name: 'Hotell & Boende', slug: 'hotell', icon: BedDouble, description: 'Rumsbokning, gäster & städschema' },
  { name: 'Tech & IT', slug: 'tech', icon: Monitor, description: 'Projekthantering, tid & SLA' },
  { name: 'Bygg & Entreprenad', slug: 'bygg', icon: HardHat, description: 'Projektkalkyler, underentreprenörer' },
  { name: 'Hälsa & Sjukvård', slug: 'halsa', icon: HeartPulse, description: 'Patientbokning, journal & recept' },
  { name: 'Detaljhandel', slug: 'detaljhandel', icon: Store, description: 'Lager, kassa & leverantörer' },
  { name: 'E-handel', slug: 'ehandel', icon: ShoppingCart, description: 'Ordrar, frakt & returer' },
  { name: 'Frisör & Skönhet', slug: 'frisor', icon: Scissors, description: 'Tidsbokning, kunder & produkter' },
  { name: 'Transport & Logistik', slug: 'transport', icon: Truck, description: 'Flotta, rutter & leveranser' },
  { name: 'Juridik & Redovisning', slug: 'juridik', icon: Scale, description: 'Ärenden, tidrapport & klienter' },
  { name: 'Utbildning & Förskola', slug: 'utbildning', icon: GraduationCap, description: 'Schema, elever & närvaro' },
  { name: 'Jordbruk & Livsmedel', slug: 'jordbruk', icon: Wheat, description: 'Skörd, djurhållning & spårbarhet' },
  { name: 'Media & Kommunikation', slug: 'media', icon: Film, description: 'Projekt, innehåll & publicering' },
  { name: 'Fitness & Sport', slug: 'fitness', icon: Dumbbell, description: 'Medlemskap, klasser & pass' },
  { name: 'Fordon & Verkstad', slug: 'fordon', icon: Wrench, description: 'Arbetsorder, delar & fordon' },
  { name: 'Bemanning & HR', slug: 'bemanning', icon: UserPlus, description: 'Kandidater, uppdrag & timmar' },
  { name: 'Tillverkning & Industri', slug: 'tillverkning', icon: Factory, description: 'Produktion, lager & kvalitet' },
  { name: 'Konsult & Rådgivning', slug: 'konsult', icon: Briefcase, description: 'Uppdrag, tid & debitering' },
  { name: 'Event & Underhållning', slug: 'event', icon: PartyPopper, description: 'Evenemang, biljetter & artister' },
  { name: 'Fastighetsförvaltning', slug: 'fastighet', icon: Building, description: 'Objekt, hyresgäster & underhåll' },
] as const

export default function ModulesPage() {
  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Företagsmoduler
        </h1>
        <p className="text-muted-foreground mt-1">
          Välj din bransch för att se anpassade moduler och funktioner.
        </p>
      </div>

      {/* Visa alla — inline as first item in the grid */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8 gap-1">
        {/* Visa alla tile */}
        <Link
          href="/modules/alla"
          className="group flex flex-col items-center gap-2 rounded-xl px-2 py-4 transition-all duration-200 hover:bg-accent/10"
        >
          <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-accent/12 text-accent transition-all duration-200 group-hover:bg-accent/20 group-hover:scale-110">
            <Layers className="h-5 w-5" strokeWidth={1.5} />
          </div>
          <span className="text-[11px] font-medium text-accent text-center leading-tight">
            Visa alla
          </span>
        </Link>

        {/* Sector tiles */}
        {sectors.map((sector) => {
          const Icon = sector.icon
          return (
            <Link
              key={sector.slug}
              href={`/modules/${sector.slug}`}
              className="group relative flex flex-col items-center gap-2 rounded-xl px-2 py-4 transition-all duration-200 hover:bg-secondary/60"
            >
              <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-muted/60 text-muted-foreground transition-all duration-200 group-hover:bg-primary/10 group-hover:text-primary group-hover:scale-110">
                <Icon className="h-5 w-5" strokeWidth={1.5} />
              </div>
              <span className="text-[11px] font-medium text-muted-foreground text-center leading-tight transition-colors duration-200 group-hover:text-foreground">
                {sector.name}
              </span>

              {/* Hover tooltip with description */}
              <div className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10">
                <div className="whitespace-nowrap rounded-md bg-foreground px-2.5 py-1 text-[10px] text-background shadow-lg">
                  {sector.description}
                </div>
              </div>
            </Link>
          )
        })}
      </div>

      {/* Compact list below for scanning */}
      <div>
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Alla branscher
        </p>
        <div className="columns-1 sm:columns-2 lg:columns-3 gap-0">
          {sectors.map((sector) => {
            const Icon = sector.icon
            return (
              <Link
                key={sector.slug}
                href={`/modules/${sector.slug}`}
                className="group flex items-center gap-2.5 py-2 px-2 -mx-2 rounded-lg transition-colors duration-150 hover:bg-secondary/50 break-inside-avoid"
              >
                <Icon className="h-3.5 w-3.5 text-muted-foreground/60 flex-shrink-0 transition-colors duration-150 group-hover:text-primary" strokeWidth={1.5} />
                <span className="text-sm text-muted-foreground transition-colors duration-150 group-hover:text-foreground truncate">
                  {sector.name}
                </span>
                <span className="hidden sm:inline text-xs text-muted-foreground/50 truncate transition-colors duration-150 group-hover:text-muted-foreground">
                  {sector.description}
                </span>
                <ChevronRight className="h-3 w-3 text-muted-foreground/30 ml-auto flex-shrink-0 opacity-0 transition-all duration-150 group-hover:opacity-100" />
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
