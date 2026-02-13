# Förtydligad feedback med tolkningar

## 1. Onboarding-flöde

**Influencer Business → Influencer Assistant**
- "Influencer Business" står troligen som appnamn/rubrik i onboarding-flödet
- Ska ersättas med "Influencer Assistant" överallt där det förekommer
- Förmodligen i header, sidtitel och eventuellt metadata

**Localhost redirect problem vid auth genom mail**
- Magic link-autentisering redirectar till `localhost:3000` istället för produktions-URL
- Environment variable för NEXT_PUBLIC_SITE_URL är förmodligen inte satt korrekt i Supabase

**Ta bort alla detaljer kring EF/AB**
- Nuvarande onboarding har förklarande text typ "Enklare bokföring, lägre egenavgifter" vid bolagsformsval
- Ska bli en ren dropdown med endast "Enskild firma", "Aktiebolag", "Inget bolag ännu (frilans)"
- Ingen pedagogisk text, bara valet

**Lägg till "Inget bolag ännu (frilans)"**
- Tredje alternativ för creators som tar sina första samarbeten men inte formaliserat verksamheten än
- Låter dem använda appen för att spåra inkomster innan de registrerar bolag
- Förmodligen med begränsad funktionalitet (ingen bokföring, bara spårning)

**Verksamhetsnamn lägg till (Eller ditt namn vid EF)**
- Labeln "Verksamhetsnamn" ska ha suffix-text "(Eller ditt namn vid EF)"
- Placeholder bör vara "Alices Influencer-verksamhet" eller "Alice Andersson"
- Gör det tydligt att EF-användare kan använda personnamn

**Org nummer förklara att det är ens personnummer vid EF**
- Placeholder-text: "ÅÅMMDD-XXXX (ditt personnummer vid EF)"
- Eller hjälptext under fältet: "Vid enskild firma är orgnummer samma som ditt personnummer"
- Görs obligatoriskt för EF/AB (ta bort "frivilligt")

**Ta bort frivilligt för EF**
- Orgnummer är obligatoriskt för både EF och AB
- Required-validering ska gälla

**Ändra till brun färg där det är grönt**
- Primärfärg i appen är troligen grön idag
- Ska bytas till brun enligt brand guidelines
- Gäller knappar, accenter, aktiva tillstånd

**Bankkonto ta bort? Eller direkt till Enable Banking?**
- Nuvarande flöde: manuellt IBAN-fält i onboarding
- Ska ersättas med Enable Banking-integration direkt
- Dvs. istället för textfält → knapp "Koppla bankkonto" som öppnar Enable Banking
- Hoppar över manuell input helt? Eller?

**Fixa knapp så att den går direkt vid klick på bank och inte två steg**
- Nuvarande: Klicka på en bank , sedan ändå behöva scrolla ner och klicka "autentisera till X" knapp.

---

## 2. Dashboard (första sidan)

**"Godmorgon Alice, idag ska du göra X" eller "Allt är som det ska"**
- Personaliserad hero-sektion högst upp på dashboarden
- "Godmorgon Alice, idag ska du: Skicka faktura till H&M (förfaller om 3 dagar), Betala moms (deadline 12 feb)"
- Om inga pending items: "Godmorgon Alice, allt är som det ska"
- Hämtar från kommande kalenderhändelser + fakturor nära förfall + obetalda fakturor

**Pengarna under**
- "Pengarna under" = summan pengar som finns under/kvar efter att preliminärskatt dragits av
- Visar nettoresultat efter beräknad skatt
- Dashboard ska visa: Bruttoinkomst, Beräknad skatt, Kvar att ta ut
- "Kvar att ta ut: 45 000 kr" typ

**Undersök skatteberäkning?**

**Intäkter / Kostnader också 0, undersök**
- Dashboard visar 0 kr för både intäkter och kostnader, undersök detta om det stämmer

**Ny kampanj → Nytt samarbete**
- CTA-knapp eller sektionshuvud säger "Ny kampanj"
- Ska vara "Nytt samarbete" eller "+ Skapa samarbete"
- Matchar creators mentala modell bättre

**Spåra leverabler svårt ord**
- "Leverabler" är projektledarjargong, inte creator-språk
- Ska vara "Spåra innehåll" eller "Håll koll på publiceringar"
- Mindre formellt, mer intuitivt

**Ta bort logga körning från första sidan**
- Det finns en sektion/knapp för mileage tracking på dashboarden
- Ska tas bort helt (inte relevant för målgruppen)
- Creators kör sällan tjänsteresor, prioritera inte detta

**Skita i personlig kortkoppling, arbeta endast med företagskort**
- Endast företagskort via Enable Banking
- Kategorisera alla transaktioner från företagskonto
- Enklare modell, färre edge cases

**Ta bort sammanfattning månadsvis kalendervy**
- Kalendervyn har förmodligen en rad per månad som aggregerar events
- Tar onödigt utrymme och är inte så användbar
- Visa bara enskilda events i kronologisk ordning

**Kalender större och mer tilltalande**
- Nuvarande kalender är förmodligen en liten widget eller sidomodul
- Ska ta mer plats (förmodligen halva skärmbredden eller större)
- Kanske full-width på mobil
- Mer visuellt prominent, då det är core feature

**Ta bort "Håll koll på betalningar och deadlines"**
- Beskrivande text under kalendersektion
- Är överflödig/upprepande
- Ta bort, låt kalendern tala för sig själv

---

## 3. Samarbeten (f.d. kampanjer)

**Kampanjer → Samarbete**
- Överallt där "Kampanj" används som term

**Flytta upp så att det är "+ Skapa samarbete" och "Importera avtal" där uppe istället**
- Nuvarande: CTA-knappar längre ner på sidan eller i subnavigation
- Ska vara: Primary actions i toppen av sidan (header-nivå)

**Start och slutdatum för samarbete ändras när man ändrar publiceringsdatum**
- Bugg: När användaren ändrar publiceringsdatum, ändras även start/slutdatum automatiskt
- Ska inte hända - olika fält, oberoende av varandra
- Eller: Ta bort start/slutdatum helt (se nästa punkt)

**Start och slutdatum irrelevant**
- Start/slutdatum är inte viktiga för creators
- Relevant är: Publiceringsdatum (när contentet går live) och Utkastdeadline (när drafts ska skickas)
- Ta bort Start/Slutdatum-fält helt, ersätt med:
  - "Publiceringsdatum" (datum)
  - "Utkastdeadline" (datum, optional)

**Att det ska stå varumärke / direktkund men inte lägga in som kund**
- Fält för "Varumärke" (t.ex. "H&M") - fritextfält
- Fält för "Byrå" (t.ex. "Swim Communication") - dropdown/autocomplete som skapar Customer-post
- Endast byrå ska finnas i Customers-tabellen
- Varumärke är metadata på samarbetet, inte en relation

**Endast byrå ska läggas in som kund**
- Customer-tabellen innehåller bara byråer (de som faktiskt betalar)
- Varumärken är bara en textsträng på samarbetet
- Fakturan går till byrån, inte varumärket

**Slutkund är ibland varumärke, ibland byrå**
- "Slutkund" = den entitet som ska synas på fakturan och i kommunikation
- Om direktkund (inget mellanled): slutkund = varumärke
- Om via byrå: slutkund = byrå
- Automatisk logik: Om byrå finns → byrå är slutkund. Annars → varumärke är slutkund

**"Skapa ny kund" knapp inte helt intuitiv i ladda upp avtal flödet**

**Byt ut leverabler (svårt ord), extraheras kan också beskrivas lättare**
- "Leverabler" → "Innehåll" eller "Publiceringar"
- "Extraheras" → "Hittades i avtalet" eller "AI fyllde i automatiskt"
- Enklare språk, mindre jargong

**Exklusivitet inte extraherat korrekt (competing brands i x veckor)**
- AI-extrahering hittar inte exklusivitetsklausuler korrekt
- Exempel: "No competing brands for 4 weeks" ska extraheras till "4 veckor"
- Förbättra prompt eller lägg till specifik parsing för exklusivitet

**Lägg till funktion att man kan lägga in exklusivitet själv**
- Om AI missar exklusivitet, ska användaren kunna lägga till manuellt (även där det står "ingen exklusivitet hittades")
- Fält: "Exklusivitet (valfritt)" med dropdown för antal veckor och fritextfält för competing brands
- Eller: Edit-knapp vid extraherad exklusivitet

**Textinnehåll sammanfatta på briefing med AI**
-"Klistra in mailetråd" 
- Användaren klistrar in hela mejlkonversationen eller annan text. 
- AI extraherar och sammanfattar till strukturerad briefing

**Från kampanj till faktura: populera automatiskt**
- När användaren skapar faktura från ett samarbete
- Auto-populera: Kund (byrå), Belopp (från samarbetsavtalet), Beskrivning (samarbetsnamn), Förfallodatum (publiceringsdatum + 30 dagar)
- Knapp i samarbetsdetaljer: "Skapa faktura" som öppnar fakturaformulär med förifyllda fält

**Fixa UI kundsida**
- Kundsidan (kund-detaljer) har dålig layout/design
- Behöver omarbetas: bättre typografi, spacing, färgschema enligt brand
- Förmodligen legacy-design som inte uppdaterats efter rebrand

---

## 4. Transaktioner & Kategorisering

**Automatiskt fetcha banktransaktioner**
- Enable Banking är redan integrerat men transaktioner hämtas inte automatiskt
- Implementera: Cron job eller webhook som hämtar transaktioner dagligen
- Supabase Edge Function + scheduled trigger för att synka transactions

**Kategorisera logiken lägger av efter 3/6 transaktioner**
- AI-kategorisering fungerar för de första transaktionerna
- Efter 3-6 transaktioner slutar den kategorisera (returnerar null eller default-kategori)
- Förmodligen: Rate limit, token limit, eller bugg i loop-logiken
- Fix: Batch-processa i chunks, kolla error handling

**Undersök balans/resultat??**
- Rapporterad balans/resultat matchar inte faktiskt banksaldo eller förväntad vinst (kanske)
- Förmodligen: Kategoriseringsbuggen ovan gör att många transaktioner blir okategoriserade
- Eller: Dubbelbokföring, felaktig summering
- Fix: Debugga query som beräknar balans, verifiera mot banksaldo

**Gör om swipe funktionen till att man swipear till rätt kostnadskonto istället**
- De mest troliga kostnadskonton visas på skärmen, alternativ för fler om det inte stämmer. 

**Lägga till fler alternativ för varje kostnad (ex bankkostnad är inte med)**
- Nuvarande kategorilista är ofullständig
- "Bankkostnad" saknas (avgifter från banken)
- Lägg till: Bankkostnad, Kortavgifter, Valutaväxling, eventuellt fler
- Förmodligen hårdkodad enum, utöka listan

**Faktura ska mappas till transaktioner**
- När en faktura betalas, ska den kopplas till motsvarande banktransaktion
- Auto-matching baserat på: Belopp (±1%), Datum (±7 dagar), Kund-referens
- UI: Ikon som visar "Kopplad till faktura #123" på transaktionen
- Underlättar reconciliation
- Detta kan vara en del av kategoriserings swipe funktionen. 

---

## 5. Kalender & Deadlines

**Lägg in så att prel skatte inbetalningsdatum ligger i kalendern**
- Preliminärskatt ska visas som återkommande events i kalendern
- Månatlig (om stor omsättning), kvartalsvis (standard), eller årlig (låg omsättning)
- Automatisk beräkning baserat på ackumulerad vinst
- Event: "Preliminärskatt 12 500 kr" med datum och länk till betalning

**Månadsvis/kvartal/år**
- Intervall för prelskatt beror på förväntad omsättning:
  - Månad: >1M kr/år
  - Kvartal: 100k-1M kr/år (default)
  - År: <100k kr/år
- Automatisk detektering baserat på faktiska intäkter
- Eller: Användarinställning om de vet sin skatteklass

---

## 6. Intäktstyper

**Lägg till "Podcast" som sätt att man får betalt**
- Nuvarande intäktstyper: Instagram, TikTok, YouTube, Sponsrad post, etc.
- Lägg till: "Podcast" (brandintegration i podcast-episoder)
- Ska vara eget val i dropdown "Typ av samarbete" eller "Plattform"
- Samma hantering som andra samarbetstyper: fakturering, kategorisering, momsklassificering

ISSUES:
## Error Type
Runtime SyntaxError

## Error Message
Unexpected token '<'

Next.js version: 16.1.5 (Turbopack)


Fixa så att det är tre cards istället: EF, AB, Frilans (coming soon)

Blir inte automatiskt redirectad till nästa steg efter bank connect:

 POST /api/banking/connect 200 in 988ms (compile: 37ms, render: 951ms)
 GET /api/banking/callback?state=acdf00c6-82a1-4068-ac07-7510ee41667d&code=061d67b7-81d7-4996-8bb5-9cd731651108 307 in 2.0s (compile: 35ms, render: 2.0s)
 GET /onboarding 200 in 167ms (compile: 5ms, proxy.ts: 127ms, render: 35ms)
 GET /onboarding 200 in 315ms (compile: 5ms, proxy.ts: 276ms, render: 33ms)

Dessa är på fel ställe och är inkorrekta:

Välkommen till din översikt!
Steg 1 av 5

Stäng guide
Här ser du hela din ekonomiska situation på ett ställe. Låt oss gå igenom de viktigaste delarna.

Fixa namn / bolagsnamn efter God kväll på main page.

Trippla lägg till samarbetsknappar på https://marguerite-nonhieratical-becki.ngrok-free.dev/campaigns

Får ## Error Type
Runtime SyntaxError

## Error Message
Unexpected token '<'

Next.js version: 16.1.5 (Turbopack)
 när jag försöker ta bort exklusivitetsmärke från AI extraheringen.


Och detta när jag förösker lägga till exklusivitet manuellt:
## Error Type
Runtime TypeError

## Error Message
Cannot read properties of undefined (reading 'length')


    at Step5Exclusivity (components/contracts/ContractImportWizard.tsx:1169:50)
    at renderStepContent (components/contracts/ContractImportWizard.tsx:324:16)
    at ContractImportWizard (components/contracts/ContractImportWizard.tsx:403:10)
    at CampaignImportPage (app/(dashboard)/campaigns/import/page.tsx:37:7)

## Code Frame
  1167 |           </div>
  1168 |
> 1169 |           {extraction.exclusivity.excludedBrands.length > 0 && (
       |                                                  ^
  1170 |             <div>
  1171 |               <Label className="mb-2 block">Uteslutna varumärken</Label>
  1172 |               <div className="flex flex-wrap gap-2">

Next.js version: 16.1.5 (Turbopack)

"Kunde inte kategorisera. Tryck "Hoppa över" för att gå vidare." när jag förösker välja bankkostnader / kortkostnader

 POST /api/transactions/d100f6a5-5512-464f-a500-1f63f561e72b/categorize 200 in 1440ms (compile: 474ms, render: 966ms)
Failed to update transaction: {
  code: '23514',
  details: null,
  hint: null,
  message: 'new row for relation "transactions" violates check constraint "transactions_category_check"'
}
 POST /api/transactions/5d926784-7acb-483c-8859-e34ff29bdd49/categorize 500 in 1045ms (compile: 10ms, render: 1035ms)
Failed to update transaction: {
  code: '23514',
  details: null,
  hint: null,
  message: 'new row for relation "transactions" violates check constraint "transactions_category_check"'
}
 POST /api/transactions/5d926784-7acb-483c-8859-e34ff29bdd49/categorize 500 in 799ms (compile: 6ms, render: 793ms)
 POST /api/transactions/c81e8863-0085-465a-a96b-f3647f28551f/categorize 200 in 1055ms (compile: 6ms, render: 1049ms)
 POST /api/transactions/7001bd21-c4e0-46a2-b069-fbb6dc16cd43/categorize 200 in 848ms (compile: 7ms, render: 842ms)
 POST /api/transactions/f7dc202a-0938-4614-99cc-254c43e63144/categorize 200 in 902ms (compile: 6ms, render: 896ms)
 POST /api/transactions/batch-match-invoices 200 in 425ms (compile: 3ms, render: 422ms)
 POST /api/transactions/suggest-categories 200 in 291ms (compile: 1823µs, render: 289ms)
 POST /api/transactions/2ebaeaa7-b452-437c-94d3-3716d45085d4/categorize 200 in 836ms (compile: 3ms, render: 833ms)
 POST /api/transactions/9bc5e6bb-0dec-4ce0-8732-e6540f44e229/categorize 200 in 860ms (compile: 6ms, render: 853ms)
 POST /api/transactions/batch-match-invoices 200 in 124ms (compile: 5ms, render: 119ms)
 POST /api/transactions/suggest-categories 200 in 235ms (compile: 2ms, render: 233ms)
Failed to update transaction: {
  code: '23514',
  details: null,
  hint: null,
  message: 'new row for relation "transactions" violates check constraint "transactions_category_check"'
}
 POST /api/transactions/5d926784-7acb-483c-8859-e34ff29bdd49/categorize 500 in 920ms (compile: 6ms, render: 914ms)

Fixa transaktionslogiken allmänt. Ta bort privatvalet helt. 

Undersök om alla intäkter ska vara 3900 övriga rörelseintäkter

Gör en TODO (tex "två passerade deadlines" är direkt under God kväll)

Fixa så titel på samarbete syns.

Värde -> Arvode

Se över bankuppgifter i faktura. Och fakturanr, IBAN, EU momsnmr. 

Ta bort skatte "ditt att spendera"