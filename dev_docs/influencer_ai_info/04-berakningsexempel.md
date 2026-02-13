# Beräkningsexempel

## 1. Inkomstberäkningar

### 1.1 YouTube-utbetalning med valutaomräkning

**Scenario:** Influencer får månatlig AdSense-utbetalning.

```
Uppgifter:
- Utbetalt: $2,847.63 USD
- Inbetalningsdatum: 2024-02-23
- Valutakurs (Riksbanken): 10.3842 SEK/USD

Beräkning:
$2,847.63 × 10.3842 = 29,571.87 SEK

Bokföring:
Debet 1940 Bank: 29,571.87 kr
Kredit 3011 Försäljning tjänster EU: 29,571.87 kr

Momsdeklaration:
Ruta 39: 29,571.87 kr

Periodisk sammanställning:
Kund: Google Ireland Ltd
VAT: IE6388047V
Belopp: 29,571.87 kr
```

---

### 1.2 Barter-produkt med skatteberäkning

**Scenario:** Influencer får väska värd 12,000 kr mot ett Instagram-inlägg.

```
Uppgifter:
- Produkt: Designerväska
- Marknadsvärde: 12,000 kr inkl. moms
- Bolagsform: Enskild firma

Beräkning skattepliktig inkomst:
Intäkt: 12,000 kr

Om privat bruk (eget uttag):
Nettovärde: 12,000 / 1.25 = 9,600 kr
Moms: 2,400 kr

Bokföring (produkt mottagen):
Debet 4010 Inköp varor: 9,600 kr
Debet 2640 Ingående moms: 2,400 kr
Kredit 3010 Intäkter: 12,000 kr

Bokföring (eget uttag för privat bruk):
Debet 2013 Eget uttag: 12,000 kr
Kredit 4010 Inköp varor: 9,600 kr
Kredit 2640 Ingående moms: 2,400 kr

Skattekonsekvens (antagen marginalskatt 35%):
Skatt på 12,000 kr: ~4,200 kr
```

---

### 1.3 Sponsrad resa med medföljande

**Scenario:** Influencer bjuds på resa, partner följer med gratis.

```
Uppgifter:
- Flyg influencer: 8,500 kr
- Hotell influencer (5 nätter): 15,000 kr
- Flyg medföljande: 8,500 kr
- Hotell medföljande: ingår i dubbelrum
- Aktiviteter (båda): 4,000 kr
- Arbetade timmar: 35 timmar under 5 dagar (7h/dag)
- Dokumenterat arbete: 12 Instagram-inlägg, 4 Stories/dag, 2 Reels

Bedömning influencerns resa:
- Arbete: 35 timmar = 7 timmar/dag ✓
- Kriteriet "huvudsaklig arbetstid" uppfyllt
- Skattefri om nöjesinslag försumbara

Medföljandes resa:
- Alltid skattepliktig förmån

Beräkning förmånsvärde medföljande:
Flyg: 8,500 kr
Hotell: 0 kr (ingen merkostnad för dubbelrum i detta fall)
Aktiviteter (50%): 2,000 kr
Totalt förmånsvärde: 10,500 kr

Skattekonsekvens (marginalskatt 35%):
Skatt på 10,500 kr: ~3,675 kr
```

---

### 1.4 Donations/Tips från Twitch

**Scenario:** Streamer får donations under månad.

```
Uppgifter:
- Bits mottagna: 45,000 bits
- Bits-värde: $0.01 per bit = $450
- Direktdonationer via PayPal: $320
- Subscriptions (50% av $4.99 × 85 subs): $212.08
- Valutakurs: 10.55 SEK/USD

Beräkning total intäkt:
Bits: $450 × 10.55 = 4,747.50 kr
Donations: $320 × 10.55 = 3,376.00 kr
Subs: $212.08 × 10.55 = 2,237.44 kr
Totalt: 10,360.94 kr

Bokföring (Twitch-utbetalning från USA):
Debet 1940 Bank: 10,360.94 kr
Kredit 3012 Försäljning tjänster utanför EU: 10,360.94 kr

Momsdeklaration:
Ruta 40: 10,360.94 kr
```

---

## 2. Momsberäkningar

### 2.1 Faktura till svenskt företag

**Scenario:** Samarbete med svenskt klädmärke.

```
Uppgifter:
- Arvode: 35,000 kr exkl. moms
- Influencer har F-skatt och är momsregistrerad

Fakturabelopp:
Arvode: 35,000 kr
Moms 25%: 8,750 kr
Totalt att betala: 43,750 kr

Bokföring vid fakturering:
Debet 1510 Kundfordringar: 43,750 kr
Kredit 3010 Intäkter: 35,000 kr
Kredit 2610 Utgående moms: 8,750 kr

Bokföring vid betalning:
Debet 1940 Bank: 43,750 kr
Kredit 1510 Kundfordringar: 43,750 kr
```

---

### 2.2 Faktura till EU-företag (Reverse Charge)

**Scenario:** Samarbete med tyskt företag.

```
Uppgifter:
- Arvode: €3,000 EUR
- Valutakurs vid fakturadatum: 11.25 SEK/EUR
- Kundens VAT-nummer: DE123456789

Fakturabelopp:
Arvode: €3,000 (33,750 SEK)
Moms: €0 (Reverse Charge)
Totalt: €3,000

Obligatorisk text på faktura:
"Reverse charge - VAT to be accounted for by the recipient"
"Art. 196 Council Directive 2006/112/EC"

Bokföring vid fakturering:
Debet 1510 Kundfordringar: 33,750 kr
Kredit 3011 Försäljning tjänster EU: 33,750 kr

Momsdeklaration:
Ruta 39: 33,750 kr

Periodisk sammanställning:
Land: DE
VAT-nummer: DE123456789
Belopp: 33,750 kr
```

---

### 2.3 Merch-försäljning till EU-privatperson

**Scenario:** Säljer t-shirt till kund i Finland.

```
Uppgifter:
- T-shirt pris: 349 kr inkl. moms
- Kund: Privatperson i Finland
- Total EU-privatpersonförsäljning hittills i år: 45,000 kr

Bedömning:
Under OSS-tröskel (99,680 kr) → Kan välja svensk moms

Alternativ 1: Svensk moms
Pris: 349 kr inkl. 25% svensk moms
Netto: 279.20 kr
Moms: 69.80 kr

Alternativ 2: Finsk moms (24%)
Netto: 349 / 1.24 = 281.45 kr
Moms: 67.55 kr
Redovisas via OSS

Vid överskridande av tröskel:
- Obligatoriskt mottagarlandets moms
- Registrera för OSS hos Skatteverket
```

---

### 2.4 Kvartalsvis periodisk sammanställning

**Scenario:** Sammanställning Q1.

```
EU-försäljning under Q1:
- Google Ireland Ltd (IE6388047V): 87,450 kr
- Meta Platforms Ireland Ltd (IE9692928F): 12,300 kr
- TikTok Technology Ltd (IE3434547SH): 8,200 kr
- Tyskt varumärke GmbH (DE987654321): 25,000 kr

Periodisk sammanställning:
┌─────────────────────────────────────────────────────┐
│ Period: 2024-01-01 till 2024-03-31                  │
├──────────┬────────────────┬─────────────────────────┤
│ Land     │ VAT-nummer     │ Belopp (SEK)            │
├──────────┼────────────────┼─────────────────────────┤
│ IE       │ IE6388047V     │ 87,450                  │
│ IE       │ IE9692928F     │ 12,300                  │
│ IE       │ IE3434547SH    │ 8,200                   │
│ DE       │ DE987654321    │ 25,000                  │
├──────────┴────────────────┼─────────────────────────┤
│ SUMMA                     │ 132,950                 │
└───────────────────────────┴─────────────────────────┘

Kontrollavstämning:
Ruta 39 i momsdeklarationen Q1: 132,950 kr ✓
```

---

## 3. Skatteoptimering

### 3.1 Lön vs utdelning i AB

**Scenario:** AB med vinst 800,000 kr före lön.

```
Förutsättningar:
- Vinst före lön: 800,000 kr
- Gränsbelopp för lågbeskattad utdelning: 204,325 kr
- Brytpunkt statlig skatt: 615,300 kr

Alternativ 1: Endast lön 800,000 kr
Arbetsgivaravgifter (31.42%): 251,360 kr
Maximal lönekostnad: 800,000 kr
Bruttolön: 800,000 / 1.3142 = 608,719 kr
Inkomstskatt (~32%): 194,790 kr
Netto till ägaren: 413,929 kr
SGI: 608,719 kr ✓

Alternativ 2: Lön 500,000 kr + Utdelning
Lön brutto: 500,000 kr
Arbetsgivaravgifter: 157,100 kr
Total lönekostnad: 657,100 kr
Kvar i bolaget: 142,900 kr
Bolagsskatt (20.6%): 29,438 kr
Tillgängligt för utdelning: 113,462 kr
Utdelningsskatt (20%): 22,692 kr
Netto utdelning: 90,770 kr

Lön efter skatt (~32%): 340,000 kr
Total netto: 430,770 kr
SGI: 500,000 kr ✓

Alternativ 3: Lön till brytpunkt + Max utdelning
Lön brutto: 615,300 kr
Arbetsgivaravgifter: 193,327 kr
Total lönekostnad: 808,627 kr
→ Överstiger vinst, ej genomförbart

Rekommendation:
Alternativ 2 ger högst netto OCH god SGI.
```

---

### 3.2 EF: Periodiseringsfond

**Scenario:** Enskild firma med ojämna resultat.

```
År 1: Överskott 600,000 kr (viralt år)
År 2: Överskott 150,000 kr (normalt år)
År 3: Överskott 100,000 kr (svagt år)

Utan periodiseringsfond:
År 1 skatt (antagen 45% marginal på del): ~200,000 kr
År 2 skatt (~32%): ~48,000 kr
År 3 skatt (~32%): ~32,000 kr
Total skatt: ~280,000 kr

Med periodiseringsfond:
År 1:
  Överskott: 600,000 kr
  Avsättning (30%): 180,000 kr
  Beskattas: 420,000 kr
  Skatt (~40% snitt): 168,000 kr

År 2:
  Överskott: 150,000 kr
  Avsättning (30%): 45,000 kr
  Beskattas: 105,000 kr
  Skatt (~32%): 33,600 kr

År 3:
  Överskott: 100,000 kr
  Återföring: 225,000 kr (180k + 45k)
  Beskattas: 325,000 kr
  Skatt (~38% snitt): 123,500 kr

Total skatt: ~325,100 kr

Analys:
I detta fall blev det dyrare med periodiseringsfond!
Fonden lönar sig när framtida inkomster förväntas vara LÄGRE.
```

---

### 3.3 SGI-optimering

**Scenario:** Influencer planerar barn, vill maximera föräldrapenning.

```
Nuvarande struktur (AB):
- Lön: 25,000 kr/månad = 300,000 kr/år
- Utdelning: 400,000 kr/år
- SGI: 300,000 kr

Föräldrapenning vid SGI 300,000 kr:
Dagpenning (80%): 657 kr/dag (tak)
→ SGI under taket 599,250 kr, får 80% av faktisk SGI
Faktisk dagpenning: 300,000 × 0.8 / 365 = 657 kr/dag

Optimerad struktur (12 månader före barn):
- Lön: 50,000 kr/månad = 600,000 kr/år
- Utdelning: 100,000 kr/år
- SGI: 600,000 kr

Föräldrapenning vid SGI 600,000 kr:
Dagpenning (80%): 1,315 kr/dag
Men tak finns: 1,116 kr/dag (2024)

Beräkning per 390 dagar föräldraledighet:
Låg SGI (300k): 657 × 390 = 256,230 kr
Hög SGI (600k): 1,116 × 390 = 435,240 kr
Skillnad: 179,010 kr mer vid optimerad SGI

Kostnad för omställning:
Ökad lön 300,000 kr/år → ökad skatt ~100,000 kr
Nettofördel efter 1 års planering: ~79,000 kr
```

---

## 4. Valutaberäkningar

### 4.1 Kursdifferens vid försenad betalning

**Scenario:** Faktura i EUR med betalning 45 dagar senare.

```
Fakturadatum: 2024-01-15
Fakturabelopp: €5,000
Kurs 2024-01-15: 11.35 SEK/EUR
Fakturerat i SEK: 56,750 kr

Betalningsdatum: 2024-03-01
Kurs 2024-03-01: 11.52 SEK/EUR
Mottaget i SEK: 57,600 kr

Kursdifferens: 57,600 - 56,750 = 850 kr (vinst)

Bokföring vid fakturering:
Debet 1510 Kundfordringar: 56,750 kr
Kredit 3011 Försäljning tjänster EU: 56,750 kr

Bokföring vid betalning:
Debet 1940 Bank: 57,600 kr
Kredit 1510 Kundfordringar: 56,750 kr
Kredit 3960 Valutakursvinster: 850 kr
```

---

### 4.2 Aggregerad månadsintäkt från flera plattformar

**Scenario:** Månadssammanställning med blandade valutor.

```
Januari 2024 intäkter:

YouTube (USD):
  Belopp: $3,245.00
  Inbetalning: 2024-02-22
  Kurs: 10.42
  SEK: 33,812.90

Twitch (USD):
  Belopp: $1,876.50
  Inbetalning: 2024-02-15
  Kurs: 10.38
  SEK: 19,477.67

TikTok (USD):
  Belopp: $456.00
  Inbetalning: 2024-02-28
  Kurs: 10.45
  SEK: 4,765.20

Adtraction (SEK):
  Belopp: 8,450 kr
  SEK: 8,450.00

Total intäkt januari: 66,505.77 kr

Momsredovisning:
Ruta 39 (EU - YouTube, TikTok): 38,578.10 kr
Ruta 40 (Export - Twitch): 19,477.67 kr
Ruta 05-08 (Sverige - Adtraction): 6,760 kr netto + 1,690 kr moms
```

---

## 5. Avdragsberäkningar

### 5.1 Datorutrustning med blandad användning

**Scenario:** Köp av MacBook Pro för video och privat.

```
Uppgifter:
- Inköpspris: 35,000 kr inkl. moms
- Bedömd verksamhetsanvändning: 80%
- Bolagsform: Enskild firma

Beräkning avdrag:
Nettopris: 35,000 / 1.25 = 28,000 kr
Moms: 7,000 kr

Verksamhetsandel 80%:
Avdragsgill kostnad: 28,000 × 0.80 = 22,400 kr
Avdragsgill moms: 7,000 × 0.80 = 5,600 kr

Bokföring:
Debet 1220 Inventarier: 22,400 kr
Debet 2640 Ingående moms: 5,600 kr
Debet 2013 Eget uttag: 7,000 kr
Kredit 1940 Bank: 35,000 kr

Avskrivning (5 år):
Årligt avdrag: 22,400 / 5 = 4,480 kr
```

---

### 5.2 Hemmakontor (schablon vs faktiskt)

**Scenario:** Influencer arbetar i lägenhet.

```
Uppgifter:
- Total hyra: 12,000 kr/månad
- Lägenhetens yta: 75 kvm
- Arbetsrummets yta: 12 kvm
- Arbetade timmar hemma: 1,200 timmar/år

Alternativ 1: Schablonavdrag
Krav: >800 timmar/år ✓
Avdrag: 2,000 kr/år

Alternativ 2: Faktiskt avdrag (om kraven uppfylls)
Krav: Separat rum, exklusiv verksamhetsanvändning
Andel: 12/75 = 16%
Årshyra: 12,000 × 12 = 144,000 kr
Avdrag: 144,000 × 0.16 = 23,040 kr

Skillnad: 21,040 kr/år

VARNING: Faktiskt avdrag kräver att rummet INTE används
för boende. Kraven är mycket stränga. Vid tveksamhet,
använd schablon eller hyr extern lokal.
```

---

### 5.3 Resa med delvis privat syfte

**Scenario:** Resa till New York för samarbete + privat.

```
Uppgifter:
- Totalt 7 dagar
- Arbetsdagar: 4 dagar (möten, inspelning)
- Privata dagar: 3 dagar (sightseeing)
- Flygbiljett: 9,500 kr
- Hotell: 3,000 kr/natt × 7 = 21,000 kr
- Traktamente utland (USA): 614 kr/dag

Beräkning avdragsgill del:
Flyg: 9,500 × (4/7) = 5,429 kr
Hotell arbetsdagar: 3,000 × 4 = 12,000 kr
Traktamente arbetsdagar: 614 × 4 = 2,456 kr

Totalt avdragsgillt: 19,885 kr
Ej avdragsgillt (privat): 9,500 - 5,429 + 9,000 = 13,071 kr
```

---

## 6. Jämförande beräkningar

### 6.1 EF vs AB vid olika vinstnivåer

**Scenario:** Jämförelse vid 400k, 600k och 1M kr vinst.

```
Vinst 400,000 kr:

EF:
  Egenavgifter (~28%): 112,000 kr
  Skattepliktig inkomst: 288,000 kr
  Inkomstskatt (~32%): 92,160 kr
  Netto: 195,840 kr

AB (lön 300k + utdelning):
  Lön brutto: 300,000 kr
  Arbetsgivaravgifter: 94,260 kr
  Kvar: 5,740 kr
  Bolagsskatt: 1,182 kr
  Lön efter skatt: 204,000 kr
  Utdelning: 4,558 kr × 0.8 = 3,646 kr
  Netto: 207,646 kr

Fördel AB: 11,806 kr

---

Vinst 600,000 kr:

EF:
  Egenavgifter: 168,000 kr
  Skattepliktig: 432,000 kr
  Inkomstskatt (~35%): 151,200 kr
  Netto: 280,800 kr

AB (lön 400k + utdelning):
  Lön brutto: 400,000 kr
  Arbetsgivaravgifter: 125,680 kr
  Kvar: 74,320 kr
  Bolagsskatt: 15,310 kr
  Lön efter skatt: 272,000 kr
  Utdelning: 59,010 kr × 0.8 = 47,208 kr
  Netto: 319,208 kr

Fördel AB: 38,408 kr

---

Vinst 1,000,000 kr:

EF:
  Egenavgifter: 280,000 kr
  Skattepliktig: 720,000 kr
  Inkomstskatt (~42%): 302,400 kr
  Netto: 417,600 kr

AB (lön 600k + utdelning):
  Lön brutto: 600,000 kr
  Arbetsgivaravgifter: 188,520 kr
  Kvar: 211,480 kr
  Bolagsskatt: 43,565 kr
  Lön efter skatt: 390,000 kr
  Utdelning: 167,915 kr × 0.8 = 134,332 kr
  Netto: 524,332 kr

Fördel AB: 106,732 kr
```

**Slutsats:** AB blir mer fördelaktigt ju högre vinsten är.
Brytpunkt ligger omkring 300-400k kr vinst.
