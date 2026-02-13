# AI-Agent Snabbreferens

## Dokumentöversikt

| Fil | Innehåll | Användning |
|-----|----------|------------|
| 01-karnregler.md | Grundläggande regler, tröskelvärden, bolagsformer | Faktafrågor om regler |
| 02-scenariobibliotek.md | 30 vanliga situationer med lösningar | "Vad gör jag om..." frågor |
| 03-plattformskatalog.md | Plattformsspecifik info (VAT, moms, utbetalningar) | Plattformsfrågor |
| 04-berakningsexempel.md | Konkreta sifferexempel | "Hur beräknar jag..." frågor |
| 05-beslutstrаd.md | Visuella beslutsflöden | Hjälp med val |
| 06-felsokningsguide.md | Problemlösning | "Det stämmer inte..." frågor |
| 07-kalender-deadlines.md | Alla deadlines och påminnelser | Tidsfrågor |
| 08-varningsflaggor.md | Automatiska kontroller och varningar | Proaktiva varningar |

---

## Trigger-ord → Dokument

### Produkter och barter
- "fick produkt", "pressutskick", "gratis", "barter" → Scenario 001-004
- "marknadsvärde", "värdering" → Beräkningsexempel 1.2

### Plattformar
- "YouTube", "AdSense", "Google" → Plattformskatalog (YouTube)
- "Twitch", "subs", "bits" → Plattformskatalog (Twitch)
- "Instagram", "Meta", "Reels bonus" → Plattformskatalog (Instagram)
- "TikTok", "Creator Fund" → Plattformskatalog (TikTok)
- "Patreon" → Plattformskatalog (Patreon)
- "affiliate", "Adtraction" → Plattformskatalog (Affiliate)

### Moms
- "moms", "VAT", "faktura" → Kärnregler sektion 3, Beslutsträd 2.1
- "periodisk sammanställning" → Kärnregler 3.3, Kalender
- "Reverse Charge", "EU" → Scenario 007-010, Beslutsträd 2.1
- "OSS", "privatperson EU" → Kärnregler 3.4, Scenario 018-019

### Bolagsform
- "EF", "enskild firma" → Kärnregler 4.1, Beslutsträd 3.1
- "AB", "aktiebolag" → Kärnregler 4.2, Beslutsträd 3.1
- "byta bolagsform", "starta AB" → Scenario 028, Beslutsträd 3.2
- "utdelning", "3:12" → Scenario 027, Beräkningsexempel 3.1

### Avdrag
- "avdrag", "dra av" → Kärnregler 5, Beslutsträd 4.1
- "kläder", "smink" → Kärnregler 5.2, Scenario 016-017
- "resa", "arbetsresa" → Scenario 005-006, Beslutsträd 1.2
- "hemmakontor", "arbetsrum" → Kärnregler 5.3, Beräkningsexempel 5.2

### Social trygghet
- "SGI", "sjukpenning" → Kärnregler 7, Scenario 023
- "föräldraledighet", "VAB", "barn" → Beräkningsexempel 3.3, Varningsflaggor 3.3
- "pension" → Kärnregler 7.2

### Juridik
- "reklam", "markering", "MFL" → Kärnregler 6, Scenario 024
- "upphovsrätt", "musik", "licens" → Scenario 025, Varningsflaggor 5.2

### Dubbel struktur
- "EF och AB", "båda bolag" → Kärnregler 8, Scenario 029-030
- "internfaktura" → Scenario 030, Varningsflaggor 4.1-4.2

### Deadlines
- "deadline", "när ska", "förfaller" → Kalender
- "momsdeklaration" → Kalender (kvartalsvis/månadsvis)
- "inkomstdeklaration" → Kalender (maj/juli)

### Problem
- "stämmer inte", "fel", "problem" → Felsökningsguide
- "Skatteverket", "granskning" → Felsökningsguide 8

---

## Kritiska tröskelvärden (snabbåtkomst)

| Belopp | Betydelse |
|--------|-----------|
| 1 800 kr | Skattefri tävlingsvinst |
| 2 000 kr | Schablonavdrag arbetsrum EF |
| 5 000 kr | Skattefritt friskvårdsbidrag AB |
| 25 000 kr | Aktiekapital AB |
| 80 000 kr | Momsbefrielse omsättning |
| 99 680 kr | OSS-tröskel EU-privatpersoner |
| 204 325 kr | Schablonbelopp 3:12 (2024) |
| 615 300 kr | Brytpunkt statlig skatt |
| 681 600 kr | Lönekrav för lönebaserat 3:12-utrymme |

---

## Vanliga plattformars momshantering (snabbåtkomst)

| Plattform | Moms | Ruta | Period. samnst. |
|-----------|------|------|-----------------|
| YouTube | Reverse Charge | 39 | Ja |
| Twitch | Export | 40 | Nej |
| Instagram | Reverse Charge | 39 | Ja |
| TikTok | Reverse Charge | 39 | Ja |
| Patreon | Export | 40 | Nej |
| Spotify | Svensk 25% | 05-08 | Nej |
| Adtraction | Svensk 25% | 05-08 | Nej |

---

## Standardsvar-mallar

### Vid fråga om skatteplikt

```
[Inkomsttyp] är [skattepliktig/ej skattepliktig].

Värdering: [Marknadsvärde inkl. moms / Nominellt belopp]

Bokföring:
- Debet [konto]: [belopp]
- Kredit [konto]: [belopp]

[Eventuella villkor eller undantag]
```

### Vid fråga om momshantering

```
Kund: [Kundtyp och land]
Momsregel: [Svensk 25% / Reverse Charge / Export]

Faktura:
- Belopp exkl. moms: [X] kr
- Moms: [Y] kr / 0 kr
- Text på faktura: [Om tillämpligt]

Redovisning:
- Momsdeklaration ruta: [X]
- Periodisk sammanställning: [Ja/Nej]
```

### Vid fråga om avdragsrätt

```
[Kostnadstyp] är [avdragsgill/ej avdragsgill].

Villkor för avdrag:
- [Villkor 1]
- [Villkor 2]

[Om delvis avdragsgill: Beräkning av andel]

Dokumentationskrav:
- [Krav]
```

### Vid varning

```
VARNING: [Typ av varning]

Problem: [Beskrivning]

Konsekvens om ej åtgärdat:
- [Konsekvens 1]
- [Konsekvens 2]

Åtgärd:
1. [Steg 1]
2. [Steg 2]

Deadline: [Om tillämpligt]
```

---

## Konteringsguide (vanliga poster)

### Intäkter

| Typ | Debet | Kredit |
|-----|-------|--------|
| Svensk försäljning | 1510 Kundfordringar | 3010 Intäkter + 2610 Utg. moms |
| EU-försäljning (B2B) | 1510 Kundfordringar | 3011 Försäljning EU |
| Export (utanför EU) | 1510 Kundfordringar | 3012 Försäljning export |
| Kontant plattformsintäkt | 1940 Bank | 3011/3012 beroende på plattform |
| Barter-produkt | 4010 Inköp + 2640 Ing. moms | 3010 Intäkter |

### Kostnader

| Typ | Debet | Kredit |
|-----|-------|--------|
| Inköp med moms | [Kostnadskonto] + 2640 Ing. moms | 1940 Bank / 2440 Lev.skuld |
| Inventarier | 1220 Inventarier + 2640 Ing. moms | 1940 Bank |
| Prenumerationer | 6540 IT-tjänster + 2640 Ing. moms | 1940 Bank |

### Eget uttag (EF)

| Typ | Debet | Kredit |
|-----|-------|--------|
| Privat uttag | 2013 Eget uttag | 1940 Bank |
| Barter till privat bruk | 2013 Eget uttag | 4010 Inköp + 2640 Ing. moms |

### Valutakursdifferenser

| Typ | Debet | Kredit |
|-----|-------|--------|
| Kursvinst | 1940 Bank | 1510 Kundfordringar + 3960 Kursvinst |
| Kursförlust | 1940 Bank + 7960 Kursförlust | 1510 Kundfordringar |

---

## Eskaleringsmatris

| Situation | Åtgärd |
|-----------|--------|
| Enkel faktafråga | Svara direkt från dokumentation |
| Komplex beräkning | Använd beräkningsexempel som mall |
| Osäkerhet om regler | Hänvisa till Skatteverket.se |
| Juridisk tvist | Rekommendera jurist |
| Skatteverket-kontakt | Rekommendera redovisningskonsult |
| Allvarlig varning | Flagga tydligt, föreslå åtgärd |
| Utanför scope | Tydliggör begränsning, hänvisa vidare |

---

## Begränsningar att kommunicera

AI-agenten kan INTE:
- Ge juridisk rådgivning (endast information)
- Garantera skattekonsekvenser
- Ersätta revisor/redovisningskonsult
- Lämna in deklarationer
- Kontakta myndigheter

AI-agenten SKA:
- Ge saklig information baserad på dokumentation
- Flagga risker och varningar
- Rekommendera professionell hjälp vid behov
- Hänvisa till officiella källor
