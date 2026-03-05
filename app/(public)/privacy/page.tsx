import type { Metadata } from 'next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const metadata: Metadata = {
  title: 'Integritetspolicy - Gnubok',
}

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white py-12 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Integritetspolicy
          </h1>
          <p className="text-muted-foreground">
            Senast uppdaterad: 2026-03-05
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>1. Personuppgiftsansvarig</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <p>
              Arcim (&quot;vi&quot;, &quot;oss&quot;) ar personuppgiftsansvarig for behandlingen av dina
              personuppgifter i samband med anvandningen av Gnubok. Vi behandlar dina uppgifter i
              enlighet med EU:s dataskyddsforordning (GDPR) och svensk dataskyddslagstiftning.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2. Vilka uppgifter vi behandlar</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <p>Vi behandlar foljande kategorier av personuppgifter:</p>
            <ul>
              <li><strong>Kontouppgifter:</strong> E-postadress (for inloggning via magic link)</li>
              <li><strong>Foretagsuppgifter:</strong> Foretagsnamn, organisationsnummer, adress, kontaktuppgifter</li>
              <li><strong>Bokforingsdata:</strong> Verifikationer, fakturor, kvitton, transaktioner, kontoplaner</li>
              <li><strong>Bankdata:</strong> Kontosaldon och transaktioner (via PSD2-koppling)</li>
              <li><strong>Dokument:</strong> Uppladdade kvitton, fakturor och andra bokforingsunderlag</li>
              <li><strong>Tekniska uppgifter:</strong> IP-adress, enhetstyp, anvandningsstatistik</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>3. Rattslig grund (GDPR Art. 6)</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <ul>
              <li>
                <strong>Avtal (Art. 6.1b):</strong> Behandling som ar nodvandig for att fullgora vara
                tjanster enligt anvandaravtalet.
              </li>
              <li>
                <strong>Rattslig forpliktelse (Art. 6.1c):</strong> Bokforingslagens (BFL) krav pa
                7 ars arkivering av raknenskapsmaterial.
              </li>
              <li>
                <strong>Berattigat intresse (Art. 6.1f):</strong> Produktforbattringar, sakerhet och
                bedrageriforbud.
              </li>
              <li>
                <strong>Samtycke (Art. 6.1a):</strong> For AI-baserade funktioner som skickar data
                till tredjepartstjanster (se separat samtycke vid aktivering).
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>4. Underbitraden</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <p>
              Vi anvander foljande underbitraden for att tillhandahalla tjansten. Uppgifterna nedan anger
              vilka uppgifter som delas med respektive underbitrade, syftet samt var behandlingen sker
              (GDPR Art. 13).
            </p>

            <div className="overflow-x-auto mt-4">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4 font-semibold">Underbitrade</th>
                    <th className="text-left py-2 pr-4 font-semibold">Syfte</th>
                    <th className="text-left py-2 pr-4 font-semibold">Plats</th>
                    <th className="text-left py-2 font-semibold">Skyddsmekanism</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="py-2 pr-4 font-medium">Supabase</td>
                    <td className="py-2 pr-4">Databas, autentisering, fillagring</td>
                    <td className="py-2 pr-4">EU (eu-central-1)</td>
                    <td className="py-2">EU-baserad lagring</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 pr-4 font-medium">Vercel</td>
                    <td className="py-2 pr-4">Applikationshosting</td>
                    <td className="py-2 pr-4">Globalt CDN (EU-regioner tillgangliga)</td>
                    <td className="py-2">EU Data Residency</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 pr-4 font-medium">Anthropic</td>
                    <td className="py-2 pr-4">
                      Kvitto-OCR (receipt-ocr), transaktionskategorisering (ai-categorization),
                      AI-chattassistent (ai-chat)
                    </td>
                    <td className="py-2 pr-4">USA</td>
                    <td className="py-2">SCCs (standardavtalsklausuler)</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 pr-4 font-medium">OpenAI</td>
                    <td className="py-2 pr-4">
                      Embedding-generering for likhetssokning (transaktionsmallar, kunskapsbas)
                    </td>
                    <td className="py-2 pr-4">USA</td>
                    <td className="py-2">SCCs (standardavtalsklausuler)</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 pr-4 font-medium">Enable Banking</td>
                    <td className="py-2 pr-4">PSD2-bankkontouppkoppling</td>
                    <td className="py-2 pr-4">EU</td>
                    <td className="py-2">EU-baserad</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 pr-4 font-medium">Resend</td>
                    <td className="py-2 pr-4">Transaktionell e-postleverans</td>
                    <td className="py-2 pr-4">USA</td>
                    <td className="py-2">SCCs (standardavtalsklausuler)</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 pr-4 font-medium">Recapt</td>
                    <td className="py-2 pr-4">Produktanalys och anvanderfeedback</td>
                    <td className="py-2 pr-4">EU</td>
                    <td className="py-2">EU-baserad</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="mt-4 text-sm text-muted-foreground">
              AI-funktioner (Anthropic, OpenAI) kraver separat samtycke fore aktivering.
              Data skickas forst nar du aktivt godkanner anvandningen.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>5. Tredjelandsoverforing</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <p>
              Vissa underbitraden ar baserade i USA. For dessa overforing anvands EU-kommissionens
              standardavtalsklausuler (SCCs) som skyddsmekanism i enlighet med GDPR kapitel V.
              All primaer datalagring (databas, filer) sker inom EU via Supabase (eu-central-1).
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>6. Lagringstid</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <ul>
              <li>
                <strong>Bokforingsmaterial:</strong> 7 ar fran rakenskapsarets slut, i enlighet
                med Bokforingslagen (BFL) 7 kap. 2 §. Systemet hindrar radering av material
                kopplat till bokforda verifikationer under denna period.
              </li>
              <li>
                <strong>Kontouppgifter:</strong> Sa lange kontot ar aktivt, plus 30 dagar efter
                begaran om radering (for att hantera pagaende bokforingsplikter).
              </li>
              <li>
                <strong>Tekniska loggar:</strong> Maximalt 90 dagar.
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>7. Dina rattigheter</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <p>Du har foljande rattigheter enligt GDPR:</p>
            <ul>
              <li><strong>Tillgang (Art. 15):</strong> Du kan begara en kopia av alla dina personuppgifter.</li>
              <li><strong>Rattelse (Art. 16):</strong> Du kan begara rattelse av felaktiga uppgifter.</li>
              <li><strong>Radering (Art. 17):</strong> Du kan begara radering, med undantag for uppgifter som
                omfattas av lagstadgade arkiveringskrav (BFL 7 ar).</li>
              <li><strong>Begransning (Art. 18):</strong> Du kan begara begransning av behandlingen.</li>
              <li><strong>Dataportabilitet (Art. 20):</strong> Du kan exportera dina uppgifter i
                maskinlasbart format (SIE4, JSON, CSV) via exportfunktionerna i appen.</li>
              <li><strong>Invandning (Art. 21):</strong> Du kan invanda mot behandling baserad pa
                berattigat intresse.</li>
            </ul>
            <p>
              For att utova dina rattigheter, kontakta oss pa adressen nedan. Vi besvarar alla
              forfragar inom 30 dagar.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>8. Kontaktuppgifter</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <p>
              For fragor om behandlingen av dina personuppgifter, kontakta oss:
            </p>
            <ul>
              <li><strong>Foretag:</strong> Arcim</li>
              <li><strong>E-post:</strong> privacy@gnubok.se</li>
            </ul>
            <p>
              Du har aven ratt att lamna klagomal till Integritetsskyddsmyndigheten (IMY),
              www.imy.se.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
