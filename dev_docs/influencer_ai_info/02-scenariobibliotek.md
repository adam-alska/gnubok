# Scenariobibliotek: Vanliga situationer

## Produkter och barter

### SCENARIO 001: Mottagen produkt med samarbetsavtal

**Triggers:** "fick produkt", "samarbete", "ska posta om", "i utbyte mot"

**Situation:** Influencer får produkt värd X kr mot att göra inlägg.

**Beslutsträd:**
```
Finns skriftligt/muntligt avtal om motprestation?
  → Ja → Hela marknadsvärdet inkl. moms är skattepliktig intäkt
```

**Skattemässig hantering:**
- Intäkt: Produktens marknadsvärde inkl. moms
- Om EF: Bokför som intäkt + eget uttag om privat bruk
- Om AB: Bokför som intäkt + förmån om privat bruk

**Bokföringsexempel (EF):**
```
Produkt: Väska värd 8 000 kr inkl. moms

Debet 4010 Inköp varor: 6 400 kr
Debet 2640 Ingående moms: 1 600 kr
Kredit 3010 Intäkter: 8 000 kr

Om privat bruk:
Debet 2013 Eget uttag: 8 000 kr
Kredit 4010 Inköp varor: 6 400 kr
Kredit 2640 Ingående moms: 1 600 kr
```

**Checklista:**
- [ ] Dokumentera marknadsvärde (spara prislapp/screenshot)
- [ ] Spara avtal/mailkonversation
- [ ] Bokför som intäkt
- [ ] Märk inlägg med REKLAM

---

### SCENARIO 002: Oombett pressutskick (behålls)

**Triggers:** "fick skickat", "pressutskick", "utan att fråga", "PR-paket"

**Situation:** Influencer får produkt utan förfrågan, behåller och använder privat.

**Beslutsträd:**
```
Fick du produkten oombedd?
  → Ja
    Behåller du den / använder privat?
      → Ja → Skattepliktig intäkt (marknadsvärde)
      → Nej (returnerar/slänger utan användning) → Ej skattepliktig
```

**Skattemässig hantering:**
- Skattepliktig även utan motprestation om produkten behålls
- Värderas till marknadsvärde inkl. moms

**Dokumentationskrav:**
- Fotografera produkten vid mottagande
- Notera avsändare och datum
- Om returnerad: Spara kvitto på returfrakten

---

### SCENARIO 003: Oombett pressutskick (returneras/kastas)

**Triggers:** "skickade tillbaka", "returnerade", "slängde", "gav bort"

**Situation:** Influencer får produkt utan förfrågan, returnerar eller kastar.

**Skattemässig hantering:**
- Ej skattepliktigt om ingen privat användning skett
- Bevisbördan ligger på influencern

**Dokumentationskrav:**
- Kvitto på returfrakten
- Foto av kasserad produkt (om relevant)
- Notering om när och hur produkten avyttrades

**Varning:** Om produkten säljs på "bloppis" blir försäljningsintäkten skattepliktig.

---

### SCENARIO 004: Rabattkod för eget bruk

**Triggers:** "rabattkod", "köpte med rabatt", "fick X% rabatt"

**Situation:** Influencer får personlig rabattkod som del av ersättning.

**Beräkning:**
```
Skattepliktig inkomst = Marknadspris - Faktiskt betalt pris

Exempel:
Marknadspris: 5 000 kr
Betalt: 0 kr
Skattepliktig inkomst: 5 000 kr
```

**Bokföring:** Som intäkt i verksamheten.

---

## Resor och evenemang

### SCENARIO 005: Sponsrad resa (arbetsresa)

**Triggers:** "pressresa", "influencer trip", "betald resa", "bjuden resa"

**Situation:** Influencer bjuds på resa av varumärke.

**Beslutsträd:**
```
Är resan nödvändig för verksamheten?
  → Nej → Helt skattepliktig
  → Ja
    Upptar arbete huvudsaklig tid (≥30h/vecka eller ≥6h/dag)?
      → Nej → Delvis/helt skattepliktig (nöjesandel)
      → Ja
        Är nöjesinslagen försumbara?
          → Nej → Nöjesandelen skattepliktig
          → Ja → Skattefri
```

**Skattefri resa kräver:**
1. Nödvändig för verksamheten
2. Arbete ≥30 timmar/vecka ELLER ≥6 timmar/dag
3. Nöjesinslag försumbara

**Dokumentationskrav:**
- Detaljerat schema över arbetade timmar
- Leverabler (antal inlägg, stories, videos)
- Avtal som specificerar arbetsuppgifter

---

### SCENARIO 006: Medföljande på resa

**Triggers:** "tog med partner", "min sambo följde med", "vän fick följa med"

**Situation:** Influencerns partner/vän följer med på sponsrad resa kostnadsfritt.

**Skattemässig hantering:**
- Medföljarens resekostnad är skattepliktig förmån för influencern
- Gäller oavsett om influencerns egen resa är skattefri

**Beräkning:**
```
Förmånsvärde = Flygbiljett + Hotell + Eventuella aktiviteter för medföljaren
```

---

## Plattformsintäkter

### SCENARIO 007: YouTube AdSense-utbetalning

**Triggers:** "YouTube betalade", "AdSense", "annonsintäkter YouTube"

**Situation:** Månatlig utbetalning från Google/YouTube.

**Fakta:**
- Utbetalare: Google Ireland Ltd
- VAT-nummer: IE6388047V
- Valuta: USD (normalt)
- Momsregel: Reverse Charge (EU B2B)

**Bokföringsexempel:**
```
Mottaget: $3,200 USD
Valutakurs vid inbetalning: 10.45 SEK/USD
Belopp i SEK: 33,440 kr

Debet 1940 Bank: 33,440 kr
Kredit 3011 Försäljning tjänster EU: 33,440 kr
```

**Momsredovisning:**
- Ruta 39: 33,440 kr
- Periodisk sammanställning: Google Ireland Ltd, IE6388047V, 33,440 kr

---

### SCENARIO 008: Twitch-utbetalning

**Triggers:** "Twitch betalade", "subs", "bits", "Twitch revenue"

**Situation:** Utbetalning från Twitch (prenumerationer, bits, annonser).

**Fakta:**
- Utbetalare: Twitch Interactive Inc
- Säte: USA (San Francisco)
- Momsregel: Export (utanför EU)

**Bokföringsexempel:**
```
Mottaget: $1,500 USD
Valutakurs vid inbetalning: 10.52 SEK/USD
Belopp i SEK: 15,780 kr

Debet 1940 Bank: 15,780 kr
Kredit 3012 Försäljning tjänster utanför EU: 15,780 kr
```

**Momsredovisning:**
- Ruta 40: 15,780 kr
- Ingen periodisk sammanställning (ej EU)

---

### SCENARIO 009: Instagram/Meta bonusar

**Triggers:** "Instagram bonus", "Reels bonus", "Meta betalade"

**Situation:** Bonusutbetalning från Meta för Reels-visningar etc.

**Fakta:**
- Utbetalare: Meta Platforms Ireland Ltd
- VAT-nummer: IE9692928F
- Momsregel: Reverse Charge (EU B2B)

**Hantering:** Samma som YouTube (Scenario 007).

---

### SCENARIO 010: TikTok Creator Fund

**Triggers:** "TikTok betalade", "Creator Fund", "TikTok pengar"

**Situation:** Utbetalning från TikTok Creator Fund.

**Fakta:**
- Utbetalare: TikTok Technology Ltd (ofta)
- VAT-nummer: IE3434547SH
- Säte: Irland
- Momsregel: Reverse Charge (EU B2B)

**OBS:** Kontrollera alltid aktuellt avtal då TikToks struktur varierar.

---

### SCENARIO 011: Donations/Tips (Twitch, YouTube, etc.)

**Triggers:** "donation", "tips", "någon donerade", "fick pengar av tittare"

**Situation:** Tittare skickar pengar direkt via plattform.

**Skattemässig hantering:**
- INTE gåva i skatterättslig mening
- Ersättning för prestation (underhållning)
- Fullt skattepliktig inkomst i näringsverksamheten

**Bokföring:**
```
Debet 1940 Bank: [belopp]
Kredit 3010 Intäkter: [belopp]
```

---

## Affiliate och samarbeten

### SCENARIO 012: Affiliate-provision

**Triggers:** "affiliate", "provision", "trackad länk", "kommission"

**Situation:** Influencer får provision på försäljning via spårningslänk.

**Skattemässig hantering:**
- Fullt skattepliktig intäkt
- Momshantering beror på var affiliate-nätverket är baserat

**Vanliga nätverk och momshantering:**

| Nätverk | Säte | Momsregel |
|---------|------|-----------|
| Amazon Associates | Luxemburg (EU) | Reverse Charge |
| Adtraction | Sverige | 25% moms |
| Tradedoubler | Sverige | 25% moms |
| AWIN | Varierar | Kontrollera avtal |

---

### SCENARIO 013: Ambassadörsavtal med fast månadsersättning

**Triggers:** "ambassadör", "fast ersättning", "månadsarvode", "retainer"

**Situation:** Löpande avtal med fast månadsersättning.

**Skattemässig hantering:**
- Intäktsför månadsvis
- Moms beroende på kundtyp (se momsregler)
- Om svensk kund: Fakturera med 25% moms

**Bokföring:**
```
Månadsersättning: 25,000 kr + moms

Debet 1510 Kundfordringar: 31,250 kr
Kredit 3010 Intäkter: 25,000 kr
Kredit 2610 Utgående moms: 6,250 kr
```

---

## Teknik och utrustning

### SCENARIO 014: Köp av kamera/utrustning

**Triggers:** "köpte kamera", "ny utrustning", "investerade i teknik"

**Situation:** Inköp av professionell utrustning.

**Beslutsträd:**
```
Används utrustningen uteslutande i verksamheten?
  → Ja → Fullt avdrag + momsavdrag
  → Nej (även privat bruk)
    → Proportionera avdrag efter verksamhetsandel
    → Professionell utrustning: Ofta godtas helavdrag ändå
```

**Bokföringsexempel (kamera 45,000 kr inkl. moms):**
```
Debet 1220 Inventarier: 36,000 kr
Debet 2640 Ingående moms: 9,000 kr
Kredit 1940 Bank: 45,000 kr
```

**Avskrivning:**
- Datorer, kameror: Normalt 3-5 år
- Möjlighet till direktavdrag om <25,900 kr (halvt prisbasbelopp)

---

### SCENARIO 015: Prenumerationer och mjukvara

**Triggers:** "Adobe", "prenumeration", "programvara", "app-kostnad"

**Situation:** Löpande kostnader för mjukvara.

**Vanliga avdragsgilla prenumerationer:**
- Adobe Creative Cloud
- Final Cut Pro
- Canva Pro
- Notion, Airtable
- Molnlagring (Google Drive, Dropbox)
- Schemaläggningsverktyg (Later, Buffer)

**Bokföring:** Kostnadsförs löpande som förbrukningsmaterial eller extern tjänst.

---

## Kläder och utseende

### SCENARIO 016: Köp av kläder för content

**Triggers:** "köpte kläder", "outfit för video", "kläder till inlägg"

**Situation:** Influencer köper kläder att visa i content.

**Huvudregel:** Ej avdragsgillt om kläderna kan användas privat.

**Undantag (avdragsgilla):**
- Uniformer
- Skyddskläder
- Extrema scenkläder (ej användbara privat)
- Specifik rekvisita (t.ex. historiska kostymer)

**Dokumentationskrav för undantag:**
- Fotografera plagget
- Motivera varför det ej är användbart privat
- Bevisbördan ligger på influencern

---

### SCENARIO 017: Skönhetsbehandlingar

**Triggers:** "filler", "botox", "behandling", "skönhetsingrepp"

**Situation:** Influencer gör estetisk behandling.

**Skattemässig hantering:**
- Aldrig avdragsgillt
- Klassas som privat levnadskostnad
- Gäller även om utseendet är "del av varumärket"

---

## Försäljning och merchandise

### SCENARIO 018: Försäljning av egen merch till svenska kunder

**Triggers:** "säljer merch", "egen kollektion", "t-shirts"

**Situation:** Försäljning av varor till svenska privatpersoner.

**Skattemässig hantering:**
- Intäkt i verksamheten
- 25% moms på försäljningen
- Inköpskostnad för varorna avdragsgill

**Bokföringsexempel:**
```
Såld t-shirt: 299 kr inkl. moms

Debet 1940 Bank: 299 kr
Kredit 3010 Försäljning varor: 239,20 kr
Kredit 2610 Utgående moms: 59,80 kr
```

---

### SCENARIO 019: Försäljning av merch till EU-kunder

**Triggers:** "kund i Tyskland", "säljer till EU", "europeisk kund"

**Situation:** Försäljning av varor till privatpersoner i annat EU-land.

**Beslutsträd:**
```
Total EU-privatpersonförsäljning under året:
  ≤99,680 kr → Valfritt: Svensk moms 25% ELLER mottagarlandets moms
  >99,680 kr → Obligatoriskt: Mottagarlandets moms via OSS
```

**OSS (One Stop Shop):**
- Registrering via Skatteverket
- Kvartalsvis deklaration
- Samlar all utländsk EU-moms på ett ställe

---

### SCENARIO 020: Försäljning av virtuella items (gaming)

**Triggers:** "sålde skins", "CS:GO", "in-game items"

**Situation:** Försäljning av virtuella föremål för riktiga pengar.

**Beslutsträd:**
```
Sker försäljning yrkesmässigt och regelbundet?
  → Ja → Näringsverksamhet (inkomst av näring)
  → Nej (enstaka försäljningar) → Inkomst av kapital (30% på vinsten)
```

**OBS:** Gränsdragningen är svår. Vid regelbunden handel, behandla som näringsverksamhet.

---

## Valuta och internationellt

### SCENARIO 021: Valutakursdifferens

**Triggers:** "kurs ändrades", "växlingskurs", "valutaförlust"

**Situation:** Skillnad mellan fakturakurs och betalningskurs.

**Beräkning:**
```
Fakturerat: $1,000 @ 10.20 = 10,200 kr
Mottaget: $1,000 @ 10.45 = 10,450 kr
Valutakursvinst: 250 kr
```

**Bokföring:**
```
Valutakursvinst:
Debet 1940 Bank: 10,450 kr
Kredit 1510 Kundfordringar: 10,200 kr
Kredit 3960 Valutakursvinster: 250 kr

Valutakursförlust:
Debet 1940 Bank: 9,950 kr
Debet 7960 Valutakursförluster: 250 kr
Kredit 1510 Kundfordringar: 10,200 kr
```

---

## Sociala avgifter och trygghet

### SCENARIO 022: Uppdrag utan F-skatt

**Triggers:** "har inte F-skatt", "de drog skatt", "fick lön istället"

**Situation:** Influencer utför uppdrag men saknar F-skatt.

**Konsekvenser:**
- Uppdragsgivaren ska dra A-skatt (~30%)
- Uppdragsgivaren betalar arbetsgivaravgifter (31,42%)
- Ersättningen behandlas som lön

**Checklista:**
- [ ] Begär kontrolluppgift från uppdragsgivaren
- [ ] Kontrollera att skatt faktiskt dragits
- [ ] Deklarera som inkomst av tjänst

---

### SCENARIO 023: Beräkna SGI-konsekvens av utdelning vs lön

**Triggers:** "sjukpenning", "VAB", "föräldraledighet", "SGI"

**Situation:** Val mellan lön och utdelning påverkar socialförsäkring.

**Beräkning:**
```
Alt 1: Lön 400,000 kr
  SGI: 400,000 kr
  Sjukpenning (80%): 320,000 kr/år

Alt 2: Lön 100,000 kr + Utdelning 300,000 kr
  SGI: 100,000 kr
  Sjukpenning (80%): 80,000 kr/år

Skillnad vid 6 månaders sjukskrivning: 120,000 kr
```

---

## Juridik och avtal

### SCENARIO 024: Glömt reklammarkering

**Triggers:** "glömde skriva reklam", "markerade inte", "fick klagomål"

**Situation:** Inlägg publicerades utan korrekt reklammarkering.

**Åtgärder:**
1. Redigera inlägget omedelbart - lägg till "REKLAM" överst
2. Dokumentera när rättelsen gjordes
3. Informera uppdragsgivaren

**Risker:**
- Varning från Konsumentverket
- Förbud vid vite
- Marknadsstörningsavgift
- Reputationsskada

---

### SCENARIO 025: Använt musik utan licens

**Triggers:** "använde låt", "bakgrundsmusik", "copyright claim"

**Situation:** Musik användes i kommersiellt content utan tillstånd.

**Konsekvenser:**
- Upphovsrättsintrång
- Skadeståndsskyldighet
- Referens: ABBA-fallet (200,000 kr)

**Förebyggande:**
- Använd royalty-free musik
- Köp licens via Epidemic Sound, Artlist etc.
- Kontrollera rättigheter innan publicering

---

## Bokslut och deklaration

### SCENARIO 026: Periodiseringsfond (EF)

**Triggers:** "skjuta upp skatt", "periodiseringsfond", "jämna ut resultat"

**Situation:** Influencer vill jämna ut beskattning över år.

**Regler:**
- Max 30% av överskottet kan avsättas
- Återförs senast år 6
- Vid avveckling av EF: Omedelbar återföring

**Exempel:**
```
År 1: Överskott 500,000 kr
  Avsättning (30%): 150,000 kr
  Beskattas: 350,000 kr

År 3: Överskott 100,000 kr
  Återföring: 150,000 kr
  Beskattas: 250,000 kr
```

---

### SCENARIO 027: 3:12-utdelning (AB)

**Triggers:** "utdelning", "gränsbelopp", "20% skatt"

**Situation:** Ägare vill ta ut lågbeskattad utdelning från AB.

**Gränsbelopp 2024:**
- Schablonbelopp: 204,325 kr (2,75 x IBB)
- ELLER lönebaserat utrymme (kräver minst 681,600 kr i egen lön)

**Strategi:**
1. Ta ut lön upp till brytpunkt statlig skatt (~615,300 kr)
2. Ta ut utdelning inom gränsbelopp (20% skatt)
3. Spara överskjutande i bolaget eller ta som lön

---

### SCENARIO 028: Byta från EF till AB

**Triggers:** "vill byta", "starta AB", "övergång"

**Situation:** Influencer vill övergå från EF till AB.

**Process:**
1. Starta AB (25,000 kr aktiekapital)
2. Inkråmsöverlåtelse: EF säljer tillgångar till AB
3. Nya avtal tecknas med AB som part
4. Uppdatera plattformar med nytt VAT-nummer
5. Avveckla EF

**Skattekonsekvenser:**
- Inkråmsöverlåtelse till marknadsvärde
- Moms på försäljningen
- Periodiseringsfonder i EF återförs
- Realisationsvinst i EF beskattas

---

## Dubbel struktur

### SCENARIO 029: Fördela uppdrag mellan EF och AB

**Triggers:** "vilket företag", "ska jag fakturera från", "EF eller AB"

**Situation:** Influencer har både EF och AB, nytt uppdrag inkommer.

**Beslutsmatris:**

| Faktor | → EF | → AB |
|--------|------|------|
| Ersättning <50,000 kr | ✓ | |
| Ersättning >100,000 kr | | ✓ |
| Hög juridisk risk | | ✓ |
| Engångsuppdrag | ✓ | |
| Långt ambassadörskap | | ✓ |
| Behöver bygga SGI | ✓ | |

---

### SCENARIO 030: Internfaktura mellan EF och AB

**Triggers:** "fakturera mig själv", "mellan bolagen", "internfaktura"

**Situation:** EF utför tjänst åt eget AB.

**Krav:**
- Armlängdsprissättning (marknadsmässigt pris)
- Skriftligt avtal
- Affärsmässig motivering
- Moms på fakturan (25%)

**Bokföringsexempel:**
```
EF fakturerar AB för videoproduktion: 20,000 kr + moms

I EF:
Debet 1510 Kundfordringar: 25,000 kr
Kredit 3010 Intäkter: 20,000 kr
Kredit 2610 Utgående moms: 5,000 kr

I AB:
Debet 4010 Köpta tjänster: 20,000 kr
Debet 2640 Ingående moms: 5,000 kr
Kredit 2440 Leverantörsskulder: 25,000 kr
```

**Varning:** Skatteverket granskar internprissättning. Avvikelse >20% från marknad flaggas.
