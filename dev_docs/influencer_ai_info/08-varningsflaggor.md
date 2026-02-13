# Varningsflaggor

## 1. Bokföringsvarningar

### 1.1 Sammanblandning av entiteter

**Flagga:** Transaktion verkar bokförd i fel företag

**Triggers:**
- Samma fakturanummer i både EF och AB
- Kostnad bokförd i AB men betald från EF-konto
- Intäkt från plattform bokförd i båda entiteterna

**AI-åtgärd:**
```
VARNING: Denna transaktion kan vara bokförd i fel entitet.
Kontrollera:
- Vilken entitet har avtalet med kunden?
- Från vilket konto gjordes betalningen?
- Har samma transaktion bokförts i den andra entiteten?
```

---

### 1.2 Privata kostnader i verksamheten

**Flagga:** Misstänkt privat kostnad bokförd som företagskostnad

**Triggers:**
- Klädinköp (ej uniformer/rekvisita)
- Smink och skönhetsprodukter
- Gym/träningskort (i EF)
- Restaurangbesök utan dokumenterad affärsanledning
- Resor utan arbetssyfte

**AI-åtgärd:**
```
VARNING: Denna kostnad kan vara privat och ej avdragsgill.
[Typ av kostnad] kräver:
- Dokumentation av affärssyfte
- Kan endast dras av om [specifika villkor]
Vill du fortsätta bokföra detta som företagskostnad?
```

---

### 1.3 Saknad verifikation

**Flagga:** Transaktion utan tillräckligt underlag

**Triggers:**
- Inbetalning utan faktura/avtal
- Barter-produkt utan värderingsunderlag
- Resa utan syftesdokumentation

**AI-åtgärd:**
```
VARNING: Verifikation saknas eller är ofullständig.
För att bokföra behövs:
- [Lista på kravd dokumentation]
Vill du skapa ett eget underlag?
```

---

### 1.4 Orimliga belopp

**Flagga:** Belopp avviker kraftigt från normalt

**Triggers:**
- Enskilt inköp >50,000 kr utan förklaring
- Negativ intäkt (rättelse?)
- Valutakurs utanför rimligt intervall

**AI-åtgärd:**
```
VARNING: Beloppet verkar ovanligt.
- Bokfört belopp: [X] kr
- Normalt intervall: [Y-Z] kr
Kontrollera att beloppet är korrekt.
```

---

## 2. Momsvarningar

### 2.1 Periodisk sammanställning saknas

**Flagga:** EU-försäljning utan periodisk sammanställning

**Triggers:**
- Försäljning bokförd i Ruta 39
- Ingen periodisk sammanställning inlämnad för perioden
- Periodisk sammanställning ≠ Ruta 39

**AI-åtgärd:**
```
VARNING: Periodisk sammanställning krävs.
Du har bokfört [X] kr i EU-försäljning under [kvartal].
Deadline för periodisk sammanställning: [datum]
Förseningsavgift vid miss: 1,250 kr

Kunder att rapportera:
- [Företag 1]: [VAT-nummer], [belopp]
- [Företag 2]: [VAT-nummer], [belopp]
```

---

### 2.2 Felaktig momshantering

**Flagga:** Moms hanterad inkonsekvent med kundtyp

**Triggers:**
- Svensk moms debiterad till EU-företag med VAT-nummer
- Ingen moms debiterad till svensk kund
- Export-moms på EU-försäljning

**AI-åtgärd:**
```
VARNING: Momshanteringen verkar felaktig.
Kund: [Kundnamn]
Kundens säte: [Land]
VAT-nummer: [Om finns]

Korrekt momshantering:
- [Regel som borde gälla]
- Ruta i momsdeklaration: [X]

Vill du korrigera?
```

---

### 2.3 OSS-tröskel överskriden

**Flagga:** EU-privatpersonförsäljning överstiger 99,680 kr

**Triggers:**
- Summa B2C EU-försäljning >99,680 kr under året
- Fortsatt svensk moms efter överskridande

**AI-åtgärd:**
```
VARNING: OSS-tröskel överskriden.
Total EU-privatpersonsförsäljning: [X] kr
Tröskel: 99,680 kr

Konsekvens:
- Obligatoriskt att debitera mottagarlandets moms
- Registrera för OSS hos Skatteverket
- Lämna kvartalsvis OSS-deklaration

Tidigare försäljning under året kan behöva korrigeras.
```

---

### 2.4 Ogiltigt VAT-nummer

**Flagga:** VAT-nummer kunde inte verifieras

**Triggers:**
- VAT-nummer angivet men validering misslyckades
- Format stämmer ej med landskod

**AI-åtgärd:**
```
VARNING: VAT-nummer kunde inte verifieras.
Angivet nummer: [VAT-nummer]
Land: [Landkod]

Verifiera på VIES: https://ec.europa.eu/taxation_customs/vies/

Om ogiltigt:
- Kunden behandlas som privatperson
- Svensk moms eller OSS gäller
```

---

## 3. SGI-varningar

### 3.1 Låg SGI-grund

**Flagga:** SGI-grundande inkomst under rekommenderad nivå

**Triggers:**
- EF: Överskott <200,000 kr/år
- AB: Lön <200,000 kr/år
- Total SGI-grund <400,000 kr/år

**AI-åtgärd:**
```
VARNING: Lågt socialförsäkringsskydd.
Din SGI-grund: [X] kr/år
Rekommenderad miniminivå: 400,000 kr/år

Vid sjukdom:
- Nuvarande sjukpenning: ~[Y] kr/dag
- Med rekommenderad SGI: ~[Z] kr/dag

Vid föräldraledighet (390 dagar):
- Nu: [A] kr totalt
- Rekommenderat: [B] kr totalt
- Skillnad: [C] kr

Överväg att:
- EF: Minska avdrag / öka överskott
- AB: Höja löneuttag
```

---

### 3.2 Hög utdelning, låg lön (AB)

**Flagga:** Obalans mellan lön och utdelning

**Triggers:**
- Utdelning >3x lön
- Lön under 300,000 kr med vinst >500,000 kr
- SGI-konsekvens ej beaktad

**AI-åtgärd:**
```
VARNING: Skatteoptimering påverkar ditt sociala skydd.
Uttagen lön: [X] kr
Planerad utdelning: [Y] kr
Din SGI: [X] kr (endast lön räknas)

Konsekvens:
- Sjukpenning baseras på [X] kr
- Föräldrapenning baseras på [X] kr
- Utdelning [Y] kr ger INGET socialt skydd

Rekommendation: Balansera lön och utdelning utifrån ditt behov av trygghet.
```

---

### 3.3 Planerad föräldraledighet

**Flagga:** Användare nämner barn/föräldraledighet med låg SGI

**Triggers:**
- Nyckelord: "gravid", "barn", "föräldraledigt", "VAB"
- Kombinerat med låg SGI-grund

**AI-åtgärd:**
```
VIKTIGT: Föräldrapenning baseras på din SGI.
Nuvarande SGI-grund: [X] kr

Om barn planeras inom 12 månader:
- SGI fastställs vid barnets födelse
- Varje månad med högre inkomst höjer SGI

Åtgärd NU:
- EF: Redovisa högre överskott
- AB: Höj månadslönen
- Sikta på SGI ≥599,250 kr för maximal föräldrapenning
```

---

## 4. Strukturvarningar (dubbel struktur)

### 4.1 Internprissättning avviker

**Flagga:** Pris mellan EF och AB verkar icke-marknadsmässigt

**Triggers:**
- Timpris <300 kr eller >2,000 kr
- Avvikelse >20% från jämförbar extern prissättning
- Pris utan dokumenterad grund

**AI-åtgärd:**
```
VARNING: Internprissättningen kan ifrågasättas.
Transaktion: [Beskrivning]
Pris: [X] kr
Marknadsmässigt intervall: [Y-Z] kr

Skatteverket kräver armlängdspris.
Vid avvikelse:
- Risk för omklassificering
- Förtäckt lön/utdelning beskattas hårdare

Rekommendation: Dokumentera varför priset är marknadsmässigt.
```

---

### 4.2 Avtal saknas för interntransaktion

**Flagga:** Faktura mellan EF och AB utan avtal

**Triggers:**
- Internfaktura bokförd
- Inget avtal registrerat i systemet

**AI-åtgärd:**
```
VARNING: Avtal saknas för interntransaktion.
Transaktion: [Beskrivning]
Belopp: [X] kr

Krav för godkänd interntransaktion:
1. Skriftligt avtal
2. Marknadsmässig prissättning
3. Verklig tjänst/vara levererad
4. Affärsmässig motivering

Upprätta avtal FÖRE fakturering.
```

---

### 4.3 Alla kostnader i ett företag, alla intäkter i annat

**Flagga:** Misstänkt resultatförflyttning

**Triggers:**
- EF har endast kostnader (förlust)
- AB har endast intäkter (hög vinst)
- Eller vice versa

**AI-åtgärd:**
```
VARNING: Obalanserad resultatfördelning.
EF resultat: [X] kr
AB resultat: [Y] kr

Detta mönster kan tyda på:
- Felaktig allokering av kostnader
- Resultatförflyttning (ej tillåtet utan affärsmässig grund)

Kontrollera:
- Är kostnaderna bokförda i rätt entitet?
- Har rätt entitet fakturerat kunderna?
- Finns underlag för fördelningen?
```

---

## 5. Juridiska varningar

### 5.1 Reklammarkering saknas

**Flagga:** Betalt samarbete utan tydlig reklammarkering

**Triggers:**
- Inkomst från varumärke/plattform
- Ingen notering om reklammarkering
- Samarbetsavtal registrerat

**AI-åtgärd:**
```
PÅMINNELSE: Kontrollera reklammarkering.
Samarbete med: [Företag]
Ersättning: [X] kr

Krav enligt Marknadsföringslagen:
- "REKLAM" eller "ANNONS" överst i inlägg
- Tydlig och omedelbart synlig
- I video: Muntligt OCH/ELLER textgrafik

Underlåtenhet kan leda till:
- Varning från Konsumentverket
- Förbud vid vite
- Marknadsstörningsavgift
```

---

### 5.2 Upphovsrättskänsligt material

**Flagga:** Risk för upphovsrättsintrång

**Triggers:**
- Video/musik-content i kommersiellt sammanhang
- Ingen licensdokumentation
- Känd låt/artist nämnd

**AI-åtgärd:**
```
VARNING: Kontrollera upphovsrätt.
Om du använder musik/bilder/video:
- Har du licens?
- Är materialet royalty-free?

Utan licens:
- Risk för skadestånd (referens: ABBA-fallet 200,000 kr)
- Innehåll kan tas ner
- Plattformskonto kan stängas

Säkra alternativ:
- Epidemic Sound
- Artlist
- Creative Commons
```

---

## 6. Administrativa varningar

### 6.1 Deadline närmar sig

**Flagga:** Viktig deadline inom 7 dagar

**Triggers:**
- Momsdeklaration oinlämnad
- Periodisk sammanställning oinlämnad
- F-skatt obetald
- Inkomstdeklaration oinlämnad

**AI-åtgärd:**
```
DEADLINE-VARNING: [Uppgift]
Deadline: [Datum] ([X] dagar kvar)

Status: [Ej påbörjad / Påbörjad / Klar]

Förseningsavgift vid miss: [Belopp] kr

[Länk/instruktion för att slutföra]
```

---

### 6.2 Saknad kontrolluppgift

**Flagga:** Inkomst utan motsvarande kontrolluppgift

**Triggers:**
- Intäkt bokförd från svenskt företag
- Ingen kontrolluppgift i förväg
- Deklarationsperiod närmar sig

**AI-åtgärd:**
```
VARNING: Kontrolluppgift kan saknas.
Inkomst från: [Företag]
Belopp: [X] kr
Period: [År/Månad]

Kontrollera:
- Fick du kontrolluppgift?
- Om nej, kontakta [Företag]

Kontrolluppgifter ska finnas i e-tjänsten senast [datum].
```

---

### 6.3 Valutakurs ej dokumenterad

**Flagga:** Utländsk transaktion utan kursdokumentation

**Triggers:**
- Belopp i USD/EUR/annan valuta
- Ingen valutakurs angiven
- Stor skillnad mellan möjliga kurser

**AI-åtgärd:**
```
VARNING: Valutakurs behöver dokumenteras.
Transaktion: [Beskrivning]
Belopp: [Valuta] [Originalbelopp]
Datum: [Inbetalningsdatum]

Ange valutakurs eller hämta automatiskt:
- Riksbankens kurs [datum]: [X.XX]
- Beräknat SEK-belopp: [Y] kr

Kursen ska vara den som gällde vid inbetalningsdatum.
```

---

## 7. Automatiska kontroller

### 7.1 Periodiska avstämningar

```
MÅNATLIG KONTROLL:
□ Summa intäkter plattformar = Summa bokförda intäkter?
□ Banksaldo = Bokfört saldo?
□ Ingående moms rimlig i förhållande till kostnader?
□ Utgående moms rimlig i förhållande till intäkter?

KVARTALSVIS KONTROLL:
□ Periodisk sammanställning = Ruta 39?
□ SGI-grund tillräcklig?
□ Internfakturor avstämda mellan EF och AB?

ÅRSVIS KONTROLL:
□ Alla kontrolluppgifter mottagna?
□ Preliminärskatt vs faktisk skatt?
□ Periodiseringsfonder inom gränser?
□ 3:12-gränsbelopp beräknat?
```

---

### 7.2 Flaggningströsklar

| Kontroll | Flagga om |
|----------|-----------|
| SGI-grund | <200,000 kr/år |
| Lön vs utdelning (AB) | Utdelning >3x lön |
| Internpris | Avviker >20% från marknad |
| Periodisk sammanställning | Saknas vid EU-försäljning |
| Momsavvikelse | >5% differens |
| Kostnad utan verifikation | Alltid |
| Privat kostnad i företag | Alltid |
| Deadline | <7 dagar kvar |

---

## 8. Eskaleringsregler

### När ska AI rekommendera extern rådgivning?

```
REKOMMENDERA REVISOR/REDOVISNINGSKONSULT:
- Omsättning >3 MSEK/år
- Komplex dubbel struktur
- Internationella transaktioner med osäker momshantering
- Skatteverket har skickat förfrågan

REKOMMENDERA JURIST:
- Upphovsrättskrav
- Avtalsförhandling med stort värde (>100,000 kr)
- Tvist med uppdragsgivare
- Marknadsföringsrättslig varning

REKOMMENDERA FÖRSÄKRINGSKASSAN:
- SGI-relaterade frågor
- Uppbyggnadsskede-bedömning
- Omprövning av beslut
```
