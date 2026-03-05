import type { Metadata } from 'next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Personuppgiftsbitradesavtal - Gnubok',
}

export default function DPAPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white py-12 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Personuppgiftsbitradesavtal (DPA)
          </h1>
          <p className="text-muted-foreground">
            Enligt GDPR Art. 28 | Senast uppdaterad: 2026-03-05
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>1. Roller</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <p>
              Detta personuppgiftsbitradesavtal (&quot;DPA&quot;) ingar mellan:
            </p>
            <ul>
              <li><strong>Personuppgiftsansvarig (&quot;den Ansvarige&quot;):</strong> Du som anvandare av Gnubok,
                i egenskap av ansvarig for de personuppgifter du registrerar i tjansten
                (kunder, leverantorer, anstallda m.fl.).</li>
              <li><strong>Personuppgiftsbitrade (&quot;Bitradet&quot;):</strong> Arcim, som tillhandahaller
                Gnubok-tjansten och behandlar personuppgifter pa dina vagar.</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2. Behandlingens syfte och omfattning</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <p>Bitradet behandlar personuppgifter for foljande andamal:</p>
            <ul>
              <li>Tillhandahallande av bokforings- och redovisningstjanster</li>
              <li>Lagring och arkivering av bokforingsmaterial</li>
              <li>Fakturering och betalningshantering</li>
              <li>Bankkontosynkronisering (PSD2)</li>
              <li>AI-assisterad kategorisering och kvittohantering (efter separat samtycke)</li>
            </ul>
            <p>Kategorier av registrerade vars uppgifter behandlas:</p>
            <ul>
              <li>Den Ansvariges kunder (namn, kontaktuppgifter, organisationsnummer)</li>
              <li>Den Ansvariges leverantorer (namn, kontaktuppgifter, bankuppgifter)</li>
              <li>Den Ansvarige sjalv (kontouppgifter, foretagsinformation)</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>3. Tekniska och organisatoriska atgarder</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <p>Bitradet vidtar foljande atgarder for att skydda personuppgifterna:</p>
            <ul>
              <li><strong>Kryptering:</strong> All data krypteras i transit (TLS 1.3) och i vila (AES-256)</li>
              <li><strong>Atkomstkontroll:</strong> Row Level Security (RLS) sakerstaller att varje anvandare
                enbart kan komma at sina egna uppgifter</li>
              <li><strong>Autentisering:</strong> Sakra inloggningsmetoder (magic link, inga losenord lagrade)</li>
              <li><strong>Integritetskontroll:</strong> SHA-256 checksummor for alla dokument, med
                regelbunden verifiering</li>
              <li><strong>Revisionslogg:</strong> Alla andringshandelser loggas automatiskt av databasen
                (ej redigerbara)</li>
              <li><strong>Oforanderlig bokforing:</strong> Bokforda verifikationer kan inte andras eller
                raderas (databasutlosare)</li>
              <li><strong>Sakerhetskopior:</strong> Kontinuerliga databaskopior med point-in-time-recovery</li>
              <li><strong>EU-lagring:</strong> All primar datalagring sker i EU (eu-central-1)</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>4. Underbitraden</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <p>
              Bitradet anvander underbitraden for att tillhandahalla tjansten. En fullstandig
              forteckning over underbitraden, inklusive syfte och geografisk plats, finns i
              var{' '}
              <Link href="/privacy" className="text-primary underline underline-offset-4">
                integritetspolicy
              </Link>.
            </p>
            <p>
              Bitradet kommer att informera den Ansvarige minst 30 dagar i forvag innan
              en ny underbitrade anlitas, sa att den Ansvarige har mojlighet att invanda.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>5. Dataintrangsnotifiering</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <p>
              Vid en personuppgiftsincident ska Bitradet utan ondodigt drojsmal, och senast
              inom 72 timmar fran det att incidenten upptacktes, meddela den Ansvarige.
              Meddelandet ska innehalla:
            </p>
            <ul>
              <li>Typ av personuppgiftsincident</li>
              <li>Kategorier och ungefirligt antal registrerade som berorts</li>
              <li>Sannolika konsekvenser av incidenten</li>
              <li>Atgarder som vidtagits eller foreslas for att hantera incidenten</li>
            </ul>
            <p>
              Bitradet ska bistå den Ansvarige med den information som behovs for att den
              Ansvarige ska kunna uppfylla sin anmalningsplikt till IMY (Integritetsskyddsmyndigheten).
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>6. Revisionsratt</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <p>
              Den Ansvarige har ratt att, direkt eller genom en oberoende revisor, utfora
              revisioner och inspektioner for att sakerst alla att Bitradet uppfyller sina
              atagarder enligt detta avtal. Bitradet ska tillhandahalla all nodvandig
              information och medverka till revisioner.
            </p>
            <p>
              Revisioner ska ske med rimligt varsel (minst 30 dagar) och under ordinarie
              kontorstider. Bitradet kan erbjuda alternativ i form av tredjepartsgranskningar
              eller certifieringar.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>7. Radering vid avslut</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <p>
              Vid uppsagning av tjansten ska Bitradet, enligt den Ansvariges val:
            </p>
            <ul>
              <li>
                <strong>Aterlamna:</strong> Exportera alla personuppgifter i maskinlasbart format
                (SIE4, JSON, CSV) via tjansens exportfunktioner.
              </li>
              <li>
                <strong>Radera:</strong> Radera alla personuppgifter inom 30 dagar fran
                anvandarens begaran, med undantag for uppgifter som maste bevaras enligt lag.
              </li>
            </ul>
            <p>
              <strong>Undantag:</strong> Bokforingsmaterial som omfattas av Bokforingslagen (BFL)
              7 kap. 2 § (7 ars arkiveringskrav) raderas forst nar lagringsfristen lopt ut.
              Under denna period ar materialet skyddat mot obehorig atkomst och andring.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground text-center">
              Detta personuppgiftsbitradesavtal trader i kraft nar du skapar ett konto pa
              Gnubok och galler sa lange du anvander tjansten. For fragor, kontakta oss
              pa privacy@gnubok.se.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
