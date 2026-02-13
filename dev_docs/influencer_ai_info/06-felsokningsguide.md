# Felsökningsguide

## 1. Momsproblem

### 1.1 Momsen stämmer inte

**Symptom:** Momsdeklarationen balanserar inte eller Skatteverket ifrågasätter.

**Kontrollpunkter:**

```
□ Har du separerat inhemsk/EU/export-försäljning korrekt?
  → Inhemsk (25%): Ruta 05-08
  → EU B2B (0%): Ruta 39
  → Export (0%): Ruta 40

□ Matchar periodisk sammanställning Ruta 39?
  → Summorna MÅSTE vara identiska
  → Kontrollera att alla EU-kunder finns med

□ Har du bokfört barter-produkter med moms?
  → Marknadsvärde INKL moms som intäkt
  → Momsandel ska redovisas

□ Finns valutakursdifferenser som påverkar?
  → Kursen vid fakturering vs betalning
  → Differenser bokförs separat

□ Har du blandat B2B och B2C inom EU?
  → B2B: Reverse Charge
  → B2C: OSS eller svensk moms
```

**Åtgärder:**
1. Exportera alla försäljningsfakturor
2. Kategorisera per momstyp
3. Summera per kategori
4. Jämför med momsdeklaration
5. Korrigera differenser

---

### 1.2 Periodisk sammanställning saknas eller är fel

**Symptom:** Förseningsavgift eller ifrågasättande från Skatteverket.

**Kontrollpunkter:**

```
□ Har du sålt tjänster till EU-företag under perioden?
  → Om ja, periodisk sammanställning obligatorisk

□ Har du kundens korrekta VAT-nummer?
  → Verifiera på VIES: https://ec.europa.eu/taxation_customs/vies/

□ Har du lämnat sammanställningen i tid?
  → Deadline: 20:e i månaden efter kvartalets slut
  → Q1: 20 april
  → Q2: 20 juli
  → Q3: 20 oktober
  → Q4: 20 januari

□ Stämmer beloppen med Ruta 39?
  → Summorna MÅSTE matcha exakt
```

**Åtgärder vid miss:**
1. Lämna in försenad sammanställning omedelbart
2. Betala förseningsavgift (1,250 kr)
3. Korrigera momsdeklaration om nödvändigt

---

### 1.3 Osäker på vilken momsregel som gäller

**Frågor att ställa:**

```
1. Vem är kunden?
   □ Företag → Var är de registrerade?
   □ Privatperson → Var bor de?

2. Är det en vara eller tjänst?
   □ Vara → Leveransplats avgör
   □ Tjänst → Kundens säte avgör (B2B)

3. Har kunden VAT-nummer?
   □ Ja → Verifiera det
   □ Nej → Behandla som privatperson
```

---

## 2. Bokföringsproblem

### 2.1 Blandade privata och företagstransaktioner

**Symptom:** Oklara verifikationer, sammanblandade konton.

**Kontrollpunkter:**

```
□ Har du separata bankkonton?
  → Privat
  → EF (om tillämpligt)
  → AB (om tillämpligt)

□ Har privata inköp betalats från företagskontot?
  → Bokför som eget uttag (EF) eller lån till ägare (AB)

□ Har företagsinköp betalats privat?
  → Bokför som insättning eget kapital (EF) eller lån från ägare (AB)
```

**Åtgärder:**
1. Gå igenom alla kontoutdrag
2. Markera alla transaktioner som företag/privat
3. Bokför korrigeringar för felaktiga
4. Upprätta rutin för framtiden

---

### 2.2 Saknar verifikationer

**Symptom:** Transaktioner utan underlag.

**Kontrollpunkter:**

```
□ Vilken typ av transaktion?
  → Plattformsintäkt: Ladda ner från plattformen
  → Inköp: Kontakta leverantör för kopia
  → Barter: Upprätta eget underlag

□ Kan du rekonstruera underlaget?
  → Screenshot av beställning
  → E-postbekräftelse
  → Bankutdrag som stöd
```

**Barter-underlag som du själv upprättar:**
```
VERIFIKATION - MOTTAGEN PRODUKT

Datum: [mottagningsdatum]
Produkt: [beskrivning]
Avsändare: [företag/person]
Marknadsvärde inkl. moms: [belopp] kr
Källa för värdering: [prislapp/webbshop/etc.]
Motprestation: [beskrivning av inlägg/samarbete]

Undertecknad av: [influencerns namn]
```

---

### 2.3 Valutaomräkning stämmer inte

**Symptom:** Differenser mellan faktura och betalning.

**Kontrollpunkter:**

```
□ Vilken kurs använde du vid fakturering?
  → Ska vara kurs vid fakturadatum

□ Vilken kurs gällde vid betalning?
  → Kontrollera Riksbankens officiella kurs

□ Har du bokfört kursdifferensen separat?
  → Vinst: Konto 3960
  → Förlust: Konto 7960
```

**Beräkningsexempel:**
```
Faktura: €1,000 @ 11.50 = 11,500 kr
Betalning: €1,000 @ 11.35 = 11,350 kr
Kursförlust: 150 kr

Bokföring:
Debet 1940 Bank: 11,350
Debet 7960 Valutakursförluster: 150
Kredit 1510 Kundfordringar: 11,500
```

---

## 3. Skattedeklarationsproblem

### 3.1 Saknar F-skatt men har fakturerat

**Symptom:** Uppdragsgivare har inte dragit skatt, eller faktura utställd utan F-skatt.

**Kontrollpunkter:**

```
□ Hade du F-skatt när fakturan ställdes ut?
  → Om nej: Uppdragsgivaren ska ha dragit A-skatt

□ Drog uppdragsgivaren skatt?
  → Kontrollera lönespecifikation/kontrolluppgift

□ Betalade uppdragsgivaren arbetsgivaravgifter?
  → Ska synas på kontrolluppgift
```

**Åtgärder:**
1. Om skatt EJ drogs: Deklarera inkomsten, du ansvarar för skatten
2. Kontakta uppdragsgivaren för kontrolluppgift
3. Ansök om F-skatt om du planerar fortsätta

---

### 3.2 Fått preliminärskattebesked med fel belopp

**Symptom:** Debiterad F-skatt stämmer inte med förväntad inkomst.

**Kontrollpunkter:**

```
□ Baseras beskedet på gammal/felaktig uppgift?
  → Skatteverket använder senaste deklarationen

□ Har din verksamhet förändrats väsentligt?
  → Ökade/minskade intäkter

□ Har du redovisat alla intäkter korrekt?
```

**Åtgärder:**
1. Logga in på Skatteverket
2. Ändra preliminär inkomstdeklaration
3. Ny debitering beräknas automatiskt

---

### 3.3 Kvarskatt trots F-skatt

**Symptom:** Slutskattebesked visar kvarskatt.

**Vanliga orsaker:**

```
□ Debiterad F-skatt var för låg
  → Inkomsten blev högre än beräknat

□ Egenavgifter ej medräknade korrekt
  → Särskilt relevant för EF

□ Intäkter utan avdragen skatt
  → Utländska plattformar drar ej svensk skatt
  → Barter-produkter har ej skatt avdragen

□ Kapitalvinster/utdelningar
  → Beskattas separat
```

**Åtgärder:**
1. Analysera slutskattebeskedet
2. Justera kommande års preliminärskatt
3. Skapa buffert för kvarskatt

---

## 4. SGI-problem

### 4.1 SGI är 0 eller mycket låg

**Symptom:** Försäkringskassan meddelar låg SGI.

**Kontrollpunkter för EF:**

```
□ Vad visar NE-bilagan som överskott?
  → SGI = överskott

□ Har du gjort stora avdrag?
  → Sänker överskottet och därmed SGI

□ Är verksamheten i uppbyggnadsskede (<36 mån)?
  → Kan få jämförelseinkomst istället
```

**Kontrollpunkter för AB:**

```
□ Hur mycket lön har du tagit ut?
  → SGI = utbetald lön

□ Tar du mest utdelning?
  → Utdelning räknas EJ i SGI

□ Är lönen "marknadsmässig"?
  → För låg lön kan ifrågasättas
```

**Åtgärder:**
1. Beräkna vilken SGI du behöver
2. Justera lön/överskott för att nå nivån
3. Kontakta Försäkringskassan för omprövning

---

### 4.2 Väntar barn men har låg SGI

**Symptom:** Oro för låg föräldrapenning.

**Tidslinje:**
```
SGI fastställs vid:
- Födsel (för föräldrapenning)
- Baseras på inkomst ~12 månader bakåt

Åtgärd om <12 månader kvar:
→ Höj lön/överskott OMEDELBART
→ Varje månad med högre inkomst hjälper

Åtgärd om >12 månader kvar:
→ Planera inkomstfördelning noggrant
→ Sikta på SGI ≥599,250 kr för maximal föräldrapenning
```

---

## 5. Plattformsproblem

### 5.1 Hittar inte fakturaunderlag

**Per plattform:**

| Plattform | Var hittar jag underlag? |
|-----------|--------------------------|
| YouTube | YouTube Studio → Analytics → Revenue → Transaction history i AdSense |
| Twitch | Creator Dashboard → Channel Analytics → Revenue |
| Instagram | Professional Dashboard → Monetization → Payouts |
| TikTok | TikTok Creator Portal → Balance → Transaction History |
| Patreon | Creator Dashboard → Income → Payout History |

**Om underlag saknas:**
1. Kontakta plattformens support
2. Använd bankutdrag som stöd
3. Upprätta egen verifikation med tillgänglig information

---

### 5.2 Plattform har hållit inne skatt (W-8BEN)

**Symptom:** 30% avdrag på USA-baserade plattformar.

**Kontrollpunkter:**

```
□ Har du fyllt i W-8BEN korrekt?
  → Formulär som intygar icke-amerikansk skattestatus

□ Har formuläret löpt ut?
  → Giltigt i 3 år
  → Måste förnyas

□ Har du angett korrekt land?
  → Sverige har skatteavtal med USA
```

**Åtgärder:**
1. Logga in på plattformen
2. Gå till skatteuppgifter/tax information
3. Fyll i nytt W-8BEN
4. Kontakta support om innehållen skatt kan återbetalas

---

## 6. Juridiska problem

### 6.1 Klagomål om reklammarkering

**Symptom:** Varning från Konsumentverket eller klagomål.

**Omedelbara åtgärder:**

```
1. Redigera inlägget
   → Lägg till "REKLAM" överst
   → Se till att det är tydligt synligt

2. Dokumentera
   → Ta screenshot av korrigerat inlägg
   → Notera datum och tid för ändring

3. Informera uppdragsgivaren
   → De kan också bli ansvariga
```

**Förebyggande:**
- Märk ALLA betalda samarbeten
- Placera märkning ÖVERST
- Vid osäkerhet: Märk ändå

---

### 6.2 Upphovsrättskrav (musik, bilder)

**Symptom:** Copyright claim, krav på ersättning, nedtagning.

**Omedelbara åtgärder:**

```
1. Ta ner innehållet
   → Stoppar ytterligare intrång

2. Svara INTE på krav utan juridisk rådgivning
   → Medge ingenting

3. Dokumentera
   → Spara allt material
   → Notera publiceringsperiod
```

**Förebyggande:**
- Använd endast licensierad musik
- Epidemic Sound, Artlist = säkra alternativ
- Kontrollera bildlicenser

---

## 7. Dubbel struktur-problem

### 7.1 Blandat EF och AB

**Symptom:** Oklart vilket företag som fakturerat/betalat vad.

**Kontrollpunkter:**

```
□ Finns transaktioner bokförda i fel företag?
  → Gå igenom alla verifikationer

□ Har samma kostnad bokförts i båda?
  → Dubbelräkning ej tillåten

□ Har internfakturor hanterats korrekt?
  → Moms ska vara med
  → Avtal ska finnas
```

**Åtgärder:**
1. Gör fullständig genomgång av båda bokföringarna
2. Upprätta lista över alla internfakturor
3. Korrigera felaktiga bokningar
4. Upprätta tydliga rutiner

---

### 7.2 Skatteverket ifrågasätter internprissättning

**Symptom:** Frågor om transaktioner mellan EF och AB.

**Dokumentation som behövs:**

```
□ Skriftliga avtal för alla transaktioner
□ Prissättningsunderlag (marknadsjämförelser)
□ Affärsmässig motivering
□ Faktiska leveranser/prestationer
```

**Försvar:**
1. Visa att priset är marknadsmässigt
2. Visa att verklig tjänst/vara levererades
3. Visa affärsmässigt syfte (ej endast skatteplanering)

---

## 8. Akuta situationer

### 8.1 Missad deadline

| Deadline | Konsekvens vid miss | Åtgärd |
|----------|---------------------|--------|
| Momsdeklaration | Förseningsavgift | Lämna in omedelbart |
| Periodisk sammanställning | 1,250 kr avgift | Lämna in omedelbart |
| Inkomstdeklaration | Förseningsavgift + skönstaxering | Kontakta Skatteverket |
| F-skatt betalning | Ränta | Betala + kontakta Skatteverket |

### 8.2 Kontrollbesked från Skatteverket

**Steg:**
1. Läs noggrant vad de frågar om
2. Samla all relevant dokumentation
3. Svara inom angiven tid
4. Vid osäkerhet: Anlita rådgivare
5. Var sanningsenlig men ange inte mer än vad som frågas

### 8.3 Revision

**Förberedelser:**
1. Samla ALL bokföring för perioden
2. Kontrollera att verifikationer finns
3. Förbered förklaringar för ovanliga poster
4. Anlita redovisningskonsult om möjligt
