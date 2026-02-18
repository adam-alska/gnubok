# Företagsmoduler — Funktionskatalog per bransch

Varje bransch har fyra lager:

- **Bokföring & Skatt** — Branschanpassade BAS-kontoplan, momsinställningar, skatteregler och auto-kontosättning
- **Branschrapporter** — KPI:er och analysverktyg specifika för sektorn
- **Smart import** — Filimport (CSV/Excel/SIE) från branschens vanliga system med automatisk bokföring
- **Operativa moduler** — Verksamhetsstöd som kan, men inte måste, koppla till bokföringen

Modulantal varierar per bransch beroende på verklig bokföringskomplexitet.

---

## 1. Restaurang & Café

En av de mest bokföringskrävande branscherna. Blandad moms (12% mat, 25% alkohol/dryck), dagskassaavstämning, personalliggare, drickshantering och representation skapar många unika behov.

### Bokföring & Skatt

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Restaurangkontoplan** | BAS-kontoplan förberedd för restaurang med uppdelning per intäktstyp | Separata konton för mat (3001), dryck (3002), alkohol (3003), take-away; auto-kontosättning från kassaimport |
| **Momssplit mat/dryck** | Automatisk uppdelning av moms 12% (mat) vs 25% (alkohol, dryck) | Regelmotor för momsfördelning, hantering av blandade kvitton, månadsavstämning per momssats |
| **Dagskassaavstämning** | Stäm av kassans Z-rapport mot faktisk kassa och bank | Z-rapport-import, avvikelseanalys (svinn, differens), verifikation per dag |
| **Tipsbokföring** | Bokför dricks korrekt — arbetsgivaravgift på kartdricks, skattefri kontantdricks | Fördelning per anställd, arbetsgivaravgiftsberäkning, konto 7699/7010-koppling |
| **Personalliggare** | Elektronisk personalliggare enligt krav från Skatteverket | Daglig registrering in/ut, exportformat för kontroll, koppla till lönekostnad |
| **Alkoholpunktskatt** | Hantera punktskatt vid egenbrygd/import av alkohol | Accisberäkning, lagerrapportering, Tullverket-format |
| **Representationsbokföring** | Bokför representation med rätt avdragsgränser | Automatisk split avdragsgill/ej avdragsgill del, 90 SEK-gräns internt, momsavdrag |

### Branschrapporter

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Matkostnad (Food Cost %)** | Livsmedelskostnad som andel av matintäkt | Daglig/veckovis/månadsvis %, mål vs utfall, trendkurva, larmgräns |
| **Personalkostnad vs omsättning** | Spåra personalkostnad som andel av total omsättning | Målvärde (typiskt 30-35%), trend, jämförelse budget |
| **Svinnrapport** | Analysera matsvinn i kronor och procent | Svinn per kategori, kostnad, svinn-till-omsättning |
| **RevPASH** | Revenue per available seat hour | Intäkt per stolstimme, jämförelse per pass (lunch/middag), kapacitetsoptimering |

### Smart import

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Z-rapport-import** | Importera dagskassarapport från kassasystem | CSV/Excel från iZettle, Trivec, Square, Orderbird; auto-bokför med momssplit och kontosättning |
| **Leverantörsfaktura-import** | Importera leverantörsfakturor för matinköp | Parsning av leverantörsformat (Martin & Servera, Menigo), kostnadsfördelning per kategori |

### Operativa moduler

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Menyhantering** | Bygg och publicera menyer digitalt | Menybyggare, säsongsbyte, allergenmarkering, prissättning per kanal |
| **Bordsbokning** | Online och manuell bordsreservation | Bokningswidget, no-show-hantering, sittningsplanering, kapacitetsvy |
| **Receptkalkyl** | Beräkna kostnad per rätt utifrån inköpspriser | Receptbyggare, portionskostnad, marginalkalkyl, prisändringsanalys |
| **Personalschema** | Schemalägg personal i skift | Skiftplanering, bytesförfrågningar, övertidsvarning, tillgänglighetsvy |
| **Leverantörsbeställning** | Beställ varor direkt till leverantörer | Beställningsmallar, leveransbevakning, prishistorik |

---

## 2. Hotell & Boende

Moms 12% på boende, 25% på övriga tjänster. Förskottsbetalningar, channel manager-provisioner, säsongsprissättning och nattrevision skapar unik bokföringskomplexitet.

### Bokföring & Skatt

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Hotellkontoplan** | BAS-konton uppdelade per intäktstyp: rum, konferens, F&B, tilläggstjänster | Konton 3010 (rumsintäkter), 3020 (konferens), 3030 (F&B); auto-kontosättning |
| **Momssplit boende/tjänst** | Moms 12% på boende, 25% på frukost, minibar, spa, parkering | Automatisk split vid kombinationspaket (halvpension, konferenspaket), momsavstämning |
| **Förskottsbetalning** | Bokför förskott/depositioner korrekt som förutbetald intäkt | Konto 2420, automatisk intäktsföring vid incheckning, avbokningsbokföring |
| **Provisionshantering** | Bokför provision till Booking.com, Expedia, Airbnb som kostnad | Provisionsberäkning per kanal, nettointäkt per bokning, konto 6090 |
| **Nattrevision** | Automatiserad nattlig avstämning av dagens intäkter | Dagsbokslut, kassaavstämning, no-show-debitering, verifikation per dygn |

### Branschrapporter

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **RevPAR** | Revenue per available room — branschens viktigaste KPI | Beläggningsgrad × ADR, jämförelse per månad/säsong, budget vs utfall |
| **ADR (Average Daily Rate)** | Genomsnittlig rumspris | Pris per rumstyp, kanalfördelning, säsongsanalys |
| **Beläggningsgrad** | Procent uthyrda rum | Daglig/veckovis/månadsvis, prognos baserad på bokningsläge |
| **Kanallönsamhet** | Jämför nettointäkt per kanal efter provision | Direktbokning vs OTA, provision %, rekommendation |

### Smart import

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **PMS-import** | Importera boknings- och intäktsdata från PMS (Mews, Protel, Hotellinx) | CSV/Excel, nattrevisionsrapport, auto-bokföring med momssplit |
| **Channel Manager-rapport** | Importera provisionssammanställning per kanal | Booking/Expedia/Airbnb-rapporter, provisionsbokföring |

### Operativa moduler

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Rumsbokning** | Central bokningsmotor | Kalendervy, tillgänglighet, säsongspriser, min/max-nätter |
| **Gästregister** | Gästprofiler och historik | Kontaktuppgifter, besökshistorik, preferenser, GDPR |
| **Städschema** | Planera städning per rum | Status per rum, checklista, personalfördelning |
| **Säsongsplanering** | Priser och kapacitet per säsong | Säsongsdefinition, dynamisk prissättning, beläggningsprognos |
| **Gästkommunikation** | Automatiska meddelanden | Bekräftelse, incheckning, utcheckning, recensionsförfrågan |

---

## 3. Tech & IT

Tidrapportering som styr fakturering. Projektredovisning med WIP (Work in Progress). FoU-avdrag. Licensavskrivningar. Relativt enkel moms (25% tjänst, omvänd moms vid EU-försäljning).

### Bokföring & Skatt

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **IT-kontoplan** | BAS-konton anpassade för konsult/SaaS-bolag | Konton för konsultintäkter, licensintäkter, SaaS MRR; auto-kontosättning |
| **Projektredovisning** | Intäkter och kostnader per kundprojekt | Successiv vinstavräkning, WIP-beräkning (konto 1470), projektbokslut |
| **FoU-avdrag** | Beräkna avdrag för forskning och utveckling | Nedsättning av arbetsgivaravgifter, underlag per anställd, Skatteverket-krav |
| **Licensavskrivning** | Hantera avskrivning av mjukvarulicenser och IP | Avskrivningsplan, konto 1010/1020, linjär vs degressiv avskrivning |
| **EU-tjänstemoms** | Omvänd skattskyldighet vid försäljning till EU-kunder | Automatisk B2B-kontroll (VAT-nummer), konto 2614, EU-försäljningsrapport |

### Branschrapporter

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Debiteringsgrad** | Andel debiterbara timmar av total arbetstid | Per konsult/team, mål vs utfall, trend |
| **Projektlönsamhet** | Intäkt minus kostnad per projekt | Timkostnad vs debiterat, överdrag-varning, jämförelse budget |
| **MRR/ARR** | Monthly/Annual Recurring Revenue för SaaS | Tillväxttakt, churn, expansion revenue |

### Smart import

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Tidrapport-import** | Importera tidrapporter från Harvest, Toggl, Clockify | CSV/Excel, auto-koppling till projekt, fakturaunderlag |

### Operativa moduler

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Projekthantering** | Överblick och styrning av kundprojekt | Projekttavla, milstolpar, tidslinje, budgetuppföljning |
| **Tidrapportering** | Logga tid per projekt och kund | Timer, manuell inmatning, godkännandeflöde, debiterbara timmar |
| **Ärendehantering** | Supportärenden och buggspårning | Ärendekö, SLA-prioritet, statusflöde, kundportal |
| **Resursplanering** | Allokera personal till projekt | Beläggningsvy, kompetensfilter, överlappningsvarning |

---

## 4. Bygg & Entreprenad

Komplex bransch: omvänd skattskyldighet (moms) inom byggsektorn, ROT-avdrag, successiv vinstavräkning per projekt, ÄTA-hantering, UE-attestering och personalliggare.

### Bokföring & Skatt

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Byggkontoplan** | BAS-konton med projektkontosättning och UE-konton | Separata konton per projekt, UE-kostnader (konto 4400), materialkostnader |
| **Omvänd skattskyldighet bygg** | Automatisk hantering av omvänd moms (6 kap. ML) vid UE-tjänster | Automatisk kontroll köpare/säljare, fakturamärkning, momsdeklaration ruta 24 |
| **ROT-avdrag** | Beräkna och rapportera ROT-avdrag per kund | Automatisk 30%-beräkning, maxbelopp 50 000 SEK, personnummervalidering, Skatteverket-format |
| **Successiv vinstavräkning** | Periodisera projektintäkter efter färdigställandegrad | Beräkning av färdigställandegrad, intäktsperiodisering, konto 1470 WIP |
| **UE-attestering** | Attestflöde för underentreprenörsfakturor | Godkännandeflöde, delavstämning, F-skatt-kontroll, försäkringsverifiering |
| **Personalliggare** | Elektronisk personalliggare enligt Skatteverkets krav | In/ut-registrering, export vid kontroll, UE-personal inkluderad |
| **ÄTA-bokföring** | Koppla ÄTA-arbeten till rätt projekt och faktura | ÄTA-registrering, kostnadseffekt på projektkalkyl, intäktsökning vid godkänd ÄTA |

### Branschrapporter

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Projektmarginal** | Kalkylerad vs verklig marginal per projekt | Budget vs utfall, ÄTA-påverkan, UE-kostnad vs plan |
| **ÄTA-analys** | ÄTA som andel av ursprunglig kalkyl | ÄTA-andel per projekt, typ av ÄTA, kundgodkännandestatus |
| **Likviditet per projekt** | Kassaflöde per projekt — fakturerat vs betalt vs kostnad | Faktureringsrytm, kundfordringsålder, UE-skulder |

### Smart import

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **UE-fakturaimport** | Importera underentreprenörsfakturor | Parsning, projektkoppling, F-skatt-kontroll, auto-kontosättning |
| **Materialkostnadsimport** | Importera materialinköp per projekt | Leverantörsformat (Beijer, Ahlsell), projektfördelning |

### Operativa moduler

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Projektkalkyl** | Detaljerade kalkyler inför anbud | Arbete, material, maskiner, UE-kostnader, marginalpåslag |
| **ÄTA-hantering** | Spåra ändringar, tillägg och avgående | Registrering, kundgodkännande, koppling till faktura |
| **Byggdagbok** | Digital dagbok per projekt | Dagliga noteringar, foto, väderpåverkan, personallog |
| **Ritningshantering** | Versionshantering av projektritningar | Uppladdning, versionsjämförelse, distribution till UE |
| **Materialbeställning** | Beställ och spåra material | Materiallistor, leveransbevakning, kostnadsuppföljning |

---

## 5. Hälsa & Sjukvård

Sjukvårdstjänster är momsfria (3 kap. 4-5 § ML) men kompletterande tjänster (friskvård, kosmetisk) kan vara momspliktiga. Blandning av regionavtal, privata patienter och försäkringsersättningar.

### Bokföring & Skatt

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Vårdkontoplan** | BAS-konton uppdelade per intäktstyp: regionavtal, privatpatienter, försäkring | Konton 3010 (regionersättning), 3020 (patientavgift), 3030 (försäkring) |
| **Momsfrihet sjukvård** | Hantera momsfria vårdtjänster vs momspliktiga sidotjänster | Automatisk momsbedömning per tjänsttyp, korrekt moms vid blandad verksamhet |
| **Försäkringsersättning** | Bokför ersättningar från försäkringsbolag korrekt | Intäktsföring vid godkännande, kundfordran per försäkringsbolag, avskrivning av nekade ärenden |
| **Frikort & Högkostnadsskydd** | Hantera patienters frikort vid avgiftsberäkning | Automatisk kontroll mot högkostnadsgräns, rapportering till region |

### Branschrapporter

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Intäkt per behandlare** | Omsättning fördelat per vårdgivare | Per dag/vecka/månad, privatpatienter vs region, besökssnitt |
| **Patientmix** | Fördelning region/privat/försäkring | Intäktsfördelning per betalarkategori, trend, lönsamhet per typ |

### Smart import

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Regionersättningsimport** | Importera utbetalningsbesked från region | Periodisering, kontosättning, avstämning mot avtal |
| **Försäkringsrapport-import** | Importera beslut och utbetalningar från försäkringsbolag | Auto-bokföring godkända/nekade ärenden |

### Operativa moduler

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Patientbokning** | Bokning av besök och behandlingar | Onlinebokning, kalendervy, SMS-påminnelse, väntelista |
| **Journalhantering** | Strukturerade patientjournaler | Anteckningar, diagnoser, vårdplan, GDPR-efterlevnad |
| **Remisshantering** | Skicka och ta emot remisser | Mallar, statusspårning, svarsbevakning |
| **Kassasystem & Patientavgifter** | Debitera patientbetalningar | Avgiftskategorier, frikort-koll, kortbetalning |

---

## 6. Detaljhandel

Lagervärdering (FIFO/vägt genomsnitt) påverkar bokslut direkt. Kassaavstämning dagligen. Moms 25% standard men 6%/12% på vissa varor. Svinn påverkar lagerresultat. Personalliggare i livsmedelsbutik.

### Bokföring & Skatt

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Detaljhandelskontoplan** | BAS-konton per produktkategori och momssats | Intäktskonton per varugrupp, separata konton 25%/12%/6% moms |
| **Lagervärdering** | Löpande beräkning av lagervärde för bokslut | FIFO och vägt genomsnitt, månadsbokslut, inkuransbedömning, konto 1400 |
| **Kassaavstämning** | Daglig avstämning kassa vs kassarapport | Z-rapport-import, avvikelse, kontant/kort-split, verifikation per dag |
| **Svinnbokföring** | Bokför varusvinn korrekt som kostnad | Svinnregistrering, konto 4730, period-uppföljning |
| **Personalliggare** | Elektronisk personalliggare (obligatorisk livsmedelsbutik) | In/ut-registrering, Skatteverket-export |

### Branschrapporter

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Bruttomarginal per varugrupp** | Inpris vs utpris per kategori | Marginal %, jämförelse kampanjperiod vs normal, trendvy |
| **Lageromsättningshastighet** | Hur snabbt lagret omsätts | Per varugrupp, kapitalbindning, beställningspunkt-förslag |
| **Svinnprocent** | Svinn i kronor och procent av omsättning | Per kategori, trend, benchmark mot branschsnitt |
| **Försäljning per m²** | Butikseffektivitet | Intäkt per kvadratmeter, jämförelse butiker |

### Smart import

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **POS Z-rapport-import** | Dagskassarapport från kassasystem | CSV/Excel från iZettle, Sitoo, Caspeco; auto-kontosättning med momssplit |
| **Inventeringsimport** | Importera inventeringsresultat | Avvikelseberäkning, lageruppdatering, svinnbokföring |
| **Leverantörsfaktura-import** | Importera leverantörsfakturor | Parsning, inprisuppdatering, auto-kontosättning |

### Operativa moduler

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Lagerhantering** | Lagernivåer och rörelser | Inleverans, bristlista, beställningspunkt, lagerplatser |
| **Kampanjer & Rabatter** | Priskampanjer och erbjudanden | Rabattregler, tidsbegränsade kampanjer, marginalbevakning |
| **Kundklubb** | Lojalitetsprogram | Poängintjäning, belöningar, riktade kampanjer |
| **Prishantering** | Centraliserad prissättning | Inpris vs utpris, marginalkalkyl, prisändringslogg |
| **Butiksdrift & Schema** | Bemanning och öppettider | Schemaläggning, timrapport, budgetjämförelse |

---

## 7. E-handel

Plattformsimport (Shopify, Woo) → auto-bokföring. Returer som kreditering. Multi-currency med kursdifferens. EU-moms via OSS. Lagervärdering. Fraktbokföring.

### Bokföring & Skatt

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **E-handelskontoplan** | BAS-konton för orderintäkter, fraktintäkt, returer, plattformsavgifter | Konton 3001 (varuförsäljning), 3540 (fraktintäkt), 3740 (returkostnad), 6590 (plattformsavgift) |
| **Lagervärdering** | Löpande lagervärde för bokslut | FIFO, vägt genomsnitt, månadsbokslut, inkuransbedömning |
| **Returbokföring** | Automatisk kreditering vid returer | Lageråterföring, konto 3740, momskorrigering, periodsummering |
| **Multi-currency** | Bokför försäljning i utländsk valuta i SEK | Valutaomvandling via Riksbanken-kurs, kursdifferens konto 3960/7960 |
| **EU-moms (OSS)** | One Stop Shop för moms vid EU-distansförsäljning | Moms per destinationsland, OSS-deklarationsunderlag, tröskelvärdebevakning |
| **Plattformsavgifter** | Bokför avgifter från Shopify, Stripe, Klarna korrekt | Bruttoförsäljning → avgift → nettoutbetalning, periodisering |

### Branschrapporter

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Returprocent** | Returer som andel av försäljning | Per produktkategori, kostnad per retur, trend |
| **Genomsnittligt ordervärde (AOV)** | Snittorder i kronor | Trend, kanalfördelning, kampanjeffekt |
| **Kanalfördelning** | Intäkt per försäljningskanal | Egen webb vs marknadsplats, marginal per kanal |
| **Fraktkostnad vs intäkt** | Fraktnetto per order | Fraktsubvention, break-even-analys |

### Smart import

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Shopify/Woo-import** | Importera ordrar och utbetalningsrapporter | CSV-export, auto-bokföring per order inkl. moms, frakt, rabatter |
| **Klarna-rapport-import** | Importera Klarna-utbetalningar och avgifter | Bruttobelopp, avgiftsavdrag, nettoutbetalning, periodmatchning |
| **Fraktrapport-import** | Importera fraktkostnader per order | Postnord/DHL/Budbee-rapporter, kostnadsfördelning |

### Operativa moduler

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Orderhantering** | Central ordervy | Orderstatus, plocklista, batch-hantering |
| **Frakthantering** | Hantera frakt | Fraktsedlar, spårning, returlogistik |
| **Returhantering** | Hantera returer och byten | Returgodkännande, lageråterföring, återbetalning |
| **Produktdatahantering** | Central produktinfo | Beskrivningar, bilder, attribut |

---

## 8. Frisör & Skönhet

Provisionsberäkning som lönekostnad. Presentkort som förutbetald intäkt. Moms 25% på allt (tjänst + vara). Personalliggare obligatorisk. Kassaavstämning dagligen.

### Bokföring & Skatt

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Salongkontoplan** | BAS-konton uppdelade: tjänsteintäkter, produktförsäljning, presentkort | Konton 3010 (behandling), 3020 (produktförsäljning), 2420 (presentkortsskuld) |
| **Provisionsberäkning** | Räkna provision per frisör/terapeut och bokför som lönekostnad | Procent på tjänst/produkt, trappsteg, konto 7010/7210, månadssammanställning |
| **Presentkort som skuld** | Bokför sålda presentkort som förutbetald intäkt tills inlösen | Konto 2420 (skuld), intäktsföring vid inlösen, förfallohantering |
| **Kassaavstämning** | Daglig avstämning kort/Swish/kontant | Z-rapport, avvikelse, verifikation per dag |
| **Personalliggare** | Elektronisk personalliggare enligt Skatteverket | In/ut-registrering, export vid kontroll |

### Branschrapporter

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Intäkt per stol** | Omsättning per arbetsstation | Per dag/vecka, beläggningsgrad, optimeringsförslag |
| **Provisionsandel** | Provisionskostnad som andel av tjänsteintäkt | Per frisör, trend, lönsamhet per anställd |
| **Produktförsäljning per besök** | Merförsäljning av produkter | Snitt per kund, andel av omsättning |

### Smart import

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Kassarapport-import** | Importera dagskassa från kassasystem | CSV från iZettle/Zettle, auto-kontosättning |
| **Bokningssystem-import** | Importera bokningsdata och intäkter | Export från Timma, Fresha, Planway; intäktsfördelning per behandlare |

### Operativa moduler

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Tidsbokning** | Online och receptionsbokning | Bokningswidget, SMS-påminnelse, väntelista |
| **Kundkort** | Profil med behandlingshistorik | Favoritbehandlare, allergier, färgrecept |
| **SMS-påminnelser** | Automatiska påminnelser | Bokningspåminnelse, återbesökspåminnelse |
| **Skiftschema** | Schemalägg personal | Stolsfördelning, ledighetsönskemål |

---

## 9. Transport & Logistik

Fordonsavskrivningar, leasing, bränslekostnad per fordon, milersättning vs faktisk kostnad. Trängselskatt. Cabotageregler vid internationell transport.

### Bokföring & Skatt

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Transportkontoplan** | BAS-konton per kostnadskategori: bränsle, leasing, underhåll, försäkring | Konton per fordon möjligt, kostnadskonton 5610/5620/5611/5612 |
| **Fordonsavskrivning** | Hantera avskrivning per fordon | Linjär/degressiv, räkenskapsenlig avskrivning, konto 1240/7832 |
| **Leasinghantering** | Bokför leasing korrekt (operationell vs finansiell) | Leasingavgift som driftskostnad, restvärde, avtalsperiod |
| **Trängselskatt** | Bokför trängselskatt som avdragsgill kostnad | Auto-kontosättning konto 5615, per fordon, periodsammanställning |
| **Milersättning vs faktisk kostnad** | Jämför schablon (25 kr/mil) mot verklig fordonskostnad | Per fordon, rekommendation avdragsmetod, Skatteverket-schabloner |

### Branschrapporter

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Kostnad per mil** | Total driftskostnad per mil och per fordon | Bränsle + underhåll + avskrivning + försäkring, trend |
| **Intäkt per fordon** | Omsättning fördelad per fordon | Lönsamhet per fordon, underutnyttjade resurser |
| **Bränsleeffektivitet** | Bränsleförbrukning per fordon och period | Liter/mil, trend, avvikelse mot förväntat |

### Smart import

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Bränslekort-import** | Importera tankningar från bränslekort (Circle K, OKQ8, Preem) | CSV, auto-kontosättning per fordon |
| **Vägtulls-import** | Importera trängselskatt och broavgifter | Transportstyrelsen-format, auto-kontosättning |

### Operativa moduler

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Flottahantering** | Fordonsregister och översikt | Besiktning, försäkring, leasingperioder |
| **Ruttplanering** | Optimera körrutter | Adressklustring, tidsestimering, kapacitet |
| **Leveransspårning** | Realtidsspårning av leveranser | GPS, ETA, leveransbevis, kundnotifiering |
| **Fordonsunderhåll** | Planera service och reparationer | Serviceintervall, reservdelshistorik |
| **Chaufförshantering** | Personal och behörigheter | Körkortsklass, YKB, timrapport |
| **Fraktsedlar & Dokument** | Generera fraktdokument | CMR, följesedel, digital signatur |

---

## 10. Juridik & Redovisning

Tidrapport → fakturering (löpande räkning). Klientmedelskonto. WIP-värdering. A conto-fakturering. Intressekonflikt påverkar inte bokföringen men är branschkrav.

### Bokföring & Skatt

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Juristkontoplan** | BAS-konton för arvodesintäkter, klientmedel, utlägg | Konton 3010 (arvoden), 1690 (klientmedel i förvaltning), 6990 (utlägg för klients räkning) |
| **Klientmedelskonto** | Separat hantering av klientmedel (disciplinnämndsregler) | Konto 1690/2890, klientmedelslista, avstämning mot bankkonto, rapportering |
| **WIP-värdering** | Värdera pågående arbete (nedlagd tid ej fakturerad) | Beräkning av WIP, konto 1470, månatlig omvärdering |
| **A conto-bokföring** | Bokför a conto-fakturor och slutavräkning | Förskottsbokföring konto 2420, avräkning vid slutfaktura |

### Branschrapporter

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Debiteringsgrad** | Andel debiterbara timmar av total arbetstid | Per jurist/konsult, mål vs utfall, trend |
| **Realisationsgrad** | Fakturerat belopp vs tidvärde (nedskrivning av tid) | Per ärende, mönsteranalys, lönsamhet per ärendety |
| **Genomsnittlig timintäkt** | Faktiskt fakturerat per timme | Per jurist, klient, ärendetyp; jämförelse mot prislista |
| **WIP-rapport** | Totalt pågående arbete ej fakturerat | Per klient/ärende, åldringsanalys, risk för nedskrivning |

### Smart import

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Tidrapport-import** | Importera tid från ärendehanteringssystem | CSV från Time, Clio, Maconomy; koppling till ärende och klient |

### Operativa moduler

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Ärendehantering** | Administrera klientärenden | Ärendetyper, statusflöde, deadline-bevakning |
| **Tidrapportering** | Registrera tid per ärende | Debiterbara vs interna timmar, godkännande |
| **Dokumenthantering** | Versionshanterade dokument per ärende | Mallbibliotek, e-signering, klientdelning |
| **Deadlinebevakning** | Påminnelser för tidsfrister | Preskriptionstider, eskaleringsregler |
| **Intressekonfliktskontroll** | Kontrollera jäv vid nya ärenden | Partsregister, automatisk sökning, logg |

---

## 11. Utbildning & Förskola

Maxtaxa-regler vid fakturering. Kommunala bidrag/peng som intäkt. Momsfri utbildning. Statsbidrag med krav på periodisering.

### Bokföring & Skatt

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Utbildningskontoplan** | BAS-konton för kommunal peng, statsbidrag, föräldraavgift | Konton 3010 (kommunal ersättning), 3020 (föräldraavgift), 3910 (statsbidrag) |
| **Maxtaxa-fakturering** | Automatisk beräkning av avgift enligt maxtaxa-reglerna | Inkomstkontroll, syskonrabatt, schema-avdrag, frånvaroavdrag |
| **Statsbidragsperiodisering** | Periodisera statsbidrag korrekt över den period de avser | Konto 2970 (förutbetald intäkt), villkorsuppfyllnad, återbetalningsrisk |
| **Momsfrihet utbildning** | Utbildningstjänster är momsfria | Korrekt momsbedömning, sidoverksamhet (cafeteria, uthyrning) kan vara momspliktig |

### Branschrapporter

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Kostnad per barn/elev** | Total driftskostnad per inskrivet barn | Personal, lokal, mat, material; jämförelse med kommunal peng |
| **Personaltäthet** | Antal barn per heltidsanställd | Trend, lagkrav (förskolans riktlinje), schemaanalys |

### Smart import

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Kommunal peng-import** | Importera utbetalningsbesked från kommun | Periodisering, kontosättning, avstämning |

### Operativa moduler

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Schemaläggning** | Undervisningsschema | Per klass/lärare/sal, konfliktkontroll |
| **Elevregister** | Elev- och barnuppgifter | Kontakt, vårdnadshavare, allergi, specialbehov |
| **Närvarohantering** | Registrera frånvaro | Daglig närvaro, mönsteranalys, föräldraavisering |
| **Föräldrakommunikation** | Meddelanden till vårdnadshavare | Push/e-post/SMS, nyhetsflöde |
| **Matsedel & Allergikost** | Publicera matsedel | Veckomatsdel, allergiflaggor |
| **Vikariebokning** | Hantera vikarier | Vikariepool, snabbbokning, kostnadsspårning |

---

## 12. Jordbruk & Livsmedel

Unik skatteposition: skogskonto, expansionsfond, räntefördelning (EF/NE). EU-stöd som intäkt (periodisering). Biologiska tillgångar. Moms 12% livsmedel vs 25% övriga varor.

### Bokföring & Skatt

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Jordbrukskontoplan** | BAS-konton anpassade för gröda, djur, skogsbruk, EU-stöd | Konton 3010 (växtodling), 3020 (djurförsäljning), 3910 (EU-stöd), 1280 (biologiska tillgångar) |
| **Skogskonto** | Hantera insättning och uttag från skogskonto | Insättning (max 60% av skogsintäkt), beskattning vid uttag, konto 1760 |
| **Expansionsfond** | Beräkna avsättning till expansionsfond för enskild firma | Beräkning av underlag, expansionsfondsskatt 20,6%, NE-bilaga |
| **Räntefördelning** | Positiv/negativ räntefördelning på kapital | Kapitalunderlag, statslåneränta, inkomstfördelning tjänst/kapital |
| **EU-stöd som intäkt** | Periodisera EU-jordbruksstöd korrekt | Intäktsföring per period, villkorsskuld, jämförelse ansökt vs utbetalt |
| **Biologiska tillgångar** | Värdera djur och grödor som tillgång | Anskaffningsvärde vs verkligt värde, konto 1280, årlig omvärdering |
| **Momssplit livsmedel** | Moms 12% vid livsmedelsförsäljning, 25% övriga varor | Automatisk momskod per produkttyp |

### Branschrapporter

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Avkastning per hektar** | Intäkt minus kostnad per odlad yta | Per gröda, säsongsjämförelse, vädereffekt |
| **Bidragsberoende** | EU-stöd som andel av total intäkt | Trend, risk vid policyändring |
| **Djurkostnad per enhet** | Total kostnad per djur (foder, veterinär, stall) | Per djurtyp, jämförelse med intäkt vid slakt/försäljning |

### Smart import

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **SAM-utbetalningsimport** | Importera utbetalningsbesked för EU-jordbruksstöd | Jordbruksverket-format, periodisering, auto-kontosättning |

### Operativa moduler

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Skördeplanering** | Planera odlingscykler | Fältregister, grödor, sådd/skörd-datum |
| **Djurhållning** | Register och uppföljning av besättning | Individregister, hälsologg, Jordbruksverket-rapportering |
| **Spårbarhet** | Spåra livsmedel från jord till bord | Batchnummer, leveranskedja, återkallning |
| **Maskinlogg** | Drifttid och underhåll | Maskinregister, timlogg, servicepåminnelse |
| **Certifieringar** | KRAV, ekologisk, EU-ekologisk | Certifikatregister, giltighetstid, revisionsförberedelse |

---

## 13. Media & Kommunikation

Projektredovisning. Freelancer-fakturor (F-skatt-kontroll). Immateriella rättigheter som tillgång. Licensintäkter. Ofta blandad tjänstemoms (25%) och kulturmoms (6%).

### Bokföring & Skatt

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Mediakontoplan** | BAS-konton per intäktstyp: projektarvoden, licensintäkt, royalties | Konton 3010 (projektintäkt), 3020 (licensintäkt), 3910 (royalty) |
| **Projektredovisning** | Intäkter och kostnader per kundprojekt | Budget vs utfall, WIP vid pågående projekt, projektbokslut |
| **Freelancer-bokföring** | Hantera fakturor från frilansare korrekt | F-skatt-kontroll, auto-kontosättning konto 4010, kostnad per projekt |
| **Kulturmoms** | Hantera moms 6% vid publicering, film, kultur | Korrekt momssats per tjänsttyp, blandad verksamhet |
| **IP-tillgångar** | Aktivera och avskriva immateriella rättigheter | Aktivering, avskrivningsplan, konto 1010/1020 |

### Branschrapporter

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Projektlönsamhet** | Intäkt minus kostnad per projekt | Budget vs utfall, timkostnad vs debiterat |
| **Freelancerandel** | Andel av produktionskostnad som går till freelancers | Trend, lönsamhetspåverkan, per projekttyp |
| **Kundlönsamhet** | Intäkt och marginal per kund | Tidsförbrukning vs fakturerat, återkommande kunder |

### Smart import

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Freelancer-fakturaimport** | Importera fakturor från frilansare | Parsning, F-skatt-verifiering, projektkoppling |
| **Kampanjrapport-import** | Importera kampanjresultat | Intäkter per kampanj, provisionskostnader |

### Operativa moduler

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Projekthantering** | Styra kundprojekt | Projekttavla, tidslinje, kundgodkännande |
| **Innehållsplanering** | Redaktionskalender | Kanalvy, statusflöde, deadlines |
| **Mediebank** | Central lagring av media | Taggning, sök, rättighetsspårning |
| **Tidrapport & Debitering** | Logga tid per kund | Timer, budget vs utfall, fakturaunderlag |

---

## 14. Fitness & Sport

Autogiro-intäkter (periodisering). Klippkort/förskott som skuld. Moms 6% på idrott, 25% på PT och spa. Friskvårdsbidragsproblematik.

### Bokföring & Skatt

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Fitnesskontoplan** | BAS-konton per intäktstyp: medlemskap, PT, klippkort, shop | Konton 3010 (medlemsavgift), 3020 (PT), 2420 (klippkortsskuld), 3030 (shop) |
| **Momssplit idrott/PT** | Moms 6% på idrottslig verksamhet, 25% på PT, spa, shop | Automatisk momssats per tjänsttyp, blandad verksamhet |
| **Autogiro-periodisering** | Bokför autogiro-dragningar som intäkt rätt period | Förskottsbetalning, periodisering konto 2970, misslyckade dragningar |
| **Klippkort som skuld** | Sålda klippkort/startpaket bokförs som förutbetald intäkt | Konto 2420, intäktsföring per nyttjat tillfälle, förfallohantering |
| **Friskvårdsbidrag** | Hantera friskvårdsbidrag från arbetsgivare | Skatteverkets gräns (5 000 SEK), kvittogenerering, dokumentation |

### Branschrapporter

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Churn rate** | Medlemsavgång per månad | Trend, orsaksanalys, retention per avtalstyp |
| **Intäkt per medlem** | Genomsnittlig intäkt per aktiv medlem | Inklusive PT, shop, extra tjänster |
| **Beläggningsgrad klasser** | Fyllnadsgrad per gruppträningspass | Per klass/tid, optimering av schema |

### Smart import

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Autogiro-rapport-import** | Importera autogiro-dragningsrapport (Bankgirot) | Lyckade/misslyckade, auto-kontosättning, period-matchning |
| **Kassarapport-import** | Importera dagskassa | Drop-in, PT-paket, shop; auto-kontosättning |

### Operativa moduler

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Medlemshantering** | Registrera och hantera medlemskap | Avtalstyper, förnyelse, uppsägning |
| **Klassbokning** | Boka platser i träningspass | Schema, platsbegränsning, väntelista |
| **PT-bokning** | Boka personlig tränare | Paket, kundhistorik, kalender |
| **Tillträdeskontroll** | Inpassering till anläggning | Nyckelbricka/QR, besökslogg |

---

## 15. Fordon & Verkstad

Arbetsorder → faktura. Reservdelslager (lagervärdering). Garanti-avsättningar. VMB (vinstmarginalbeskattning) vid begagnade delar.

### Bokföring & Skatt

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Verkstadskontoplan** | BAS-konton per intäktstyp: arbete, reservdelar, besiktning | Konton 3010 (arbetsintäkt), 3020 (reservdelar), 4010 (inköp reservdelar) |
| **Arbetsorder → Faktura** | Generera faktura direkt från arbetsorder | Timpris + delar, automatisk summering, konto-koppling |
| **Reservdelslager** | Lagervärdering av reservdelar | FIFO, konto 1460, månadsbokslut, inkuransavdrag |
| **VMB (begagnade delar)** | Vinstmarginalbeskattning vid försäljning av begagnade reservdelar | Beräkning av vinstmarginal, moms enbart på marginalen, konto 2640 |
| **Garantiavsättning** | Avsätt för framtida garantikostnader | Avsättning konto 2290, upplösning vid faktisk kostnad |

### Branschrapporter

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Genomsnittligt ordervärde** | Snittfaktura per arbetsorder | Arbete vs delar, trend, kundtypsanalys |
| **Reservdelsmarginal** | Inpris vs utpris på delar | Per kategori, trend |
| **Verkstadsbeläggning** | Utnyttjandegrad av lyftar och mekaniker | Per resurs, optimering |

### Smart import

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Reservdelsleverantör-import** | Importera priser och leveranser | Mekonomen, Autoexperten-format, auto-kontosättning |

### Operativa moduler

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Arbetsorder** | Skapa och hantera arbeten | Registrering, mekaniker-tilldelning, statusflöde |
| **Fordonsregister** | Register med fordonshistorik | Regnummer, servicehistorik, besiktningsdatum |
| **Verkstadsplanering** | Beläggning av lyftar och personal | Kalendervy, bokningstider, akut-slot |
| **Besiktningspåminnelse** | Automatiska påminnelser | SMS/e-post, historik |

---

## 16. Bemanning & HR

Tidrapport → kundfaktura + löneunderlag (dubbelt flöde). Marginalberäkning per uppdrag. Socialavgiftsperiodisering. F-skatt-verifiering av underkonsulter.

### Bokföring & Skatt

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Bemanningskontoplan** | BAS-konton per intäkts- och kostnadstyp: uthyrning, rekrytering, underkonsulter | Konton 3010 (uthyrningsintäkt), 3020 (rekryteringsarvode), 4010 (UE-kostnad), 7010 (löner) |
| **Tidrapport → Dubbelbokföring** | Tidrapport genererar både kundfaktura och löneunderlag | Timrapport, kunddebitering, lönekostnad, marginalberäkning per uppdrag |
| **Arbetsgivaravgifter-periodisering** | Periodisera arbetsgivaravgifter korrekt per månad | Beräkning per anställd, konto 7510, semesterlöneskuld, period-vy |
| **UE-verifiering** | Kontrollera F-skatt och försäkring för underkonsulter | Skatteverkets API-kontroll, dokumentation, fakturamottagning |
| **Traktamente vid uthyrning** | Beräkna traktamente för uthyrd personal | Skatteverkets schabloner, skattefri del, förmånsbeskattning vid övernattning |

### Branschrapporter

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Marginal per konsult** | Debiterat minus lönekostnad per uthyrd person | Per uppdrag, trend, jämförelse |
| **Beläggningsgrad** | Andel uthyrd tid av total tid | Per konsult, team, totalt |
| **Fakturerat per konsult** | Total fakturering per person och period | Ranking, budget vs utfall |

### Smart import

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Tidrapport-import** | Importera timmar från kundsystem | CSV, kundgodkännande-status, auto-koppling till uppdrag |
| **Lönesystem-import** | Importera löneunderlag | Export från Hogia, Visma Lön; auto-bokföring av lön + sociala avgifter |

### Operativa moduler

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Kandidatregister** | Rekryteringsdatabas | CV, kompetens, status, GDPR-rensning |
| **Uppdragshantering** | Matcha kandidater med uppdrag | Kravprofil, matchning, förlängning |
| **Avtalshantering** | Kundavtal och konsultavtal | Templates, förnyelsepåminnelser |
| **Kompetensregister** | Certifieringar och utbildningar | Per person, giltighetstid |
| **Compliance** | Lagar och branschkrav | ID06-kontroll, arbetstillstånd |

---

## 17. Tillverkning & Industri

BOM-kalkyl kopplat till lagervärdering. Tre lagernivåer (råvara/halvfabrikat/färdigvara). Produktionsavvikelse bokförs. Maskinavskrivningar. Energiskatteavdrag vid industriprocess.

### Bokföring & Skatt

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Tillverkningskontoplan** | BAS-konton per lagertyp och kostnadsställe | Konton 1410 (råvarulager), 1420 (PIA), 1450 (färdigvarulager), 4010 (materialinköp) |
| **Trestegslagervärdering** | Värdera råvaror, halvfabrikat (PIA) och färdigvaror separat | FIFO per lagernivå, omvärdering vid produktion, konto 1410/1420/1450 |
| **BOM-kalkyl → Lagervärde** | Strukturlista (BOM) styr självkostnad per tillverkad enhet | Materialkomponenter, arbetskostnad, OH-pålägg, lagervärde per BOM |
| **Produktionsavvikelse** | Bokför avvikelse mellan kalkylerad och faktisk kostnad | Standard- vs verklig kostnad, avvikelsekonto 4900 |
| **Maskinavskrivning** | Avskrivningsplan för produktionsutrustning | Räkenskapsenlig avskrivning, konto 1210/7831, restvärdeavskrivning |
| **Energiskatteavdrag** | Avdrag för energiskatt vid industriell tillverkning | Nedsättning av energiskatt, ansökan till Skatteverket, periodisering |

### Branschrapporter

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Materialeffektivitet** | Faktisk materialförbrukning vs BOM-kalkyl | Spill %, kostnad för avvikelse, trend |
| **Kostnad per producerad enhet** | Total kostnad (material + arbete + OH) per enhet | Per produkt, period-jämförelse |
| **OEE (Overall Equipment Effectiveness)** | Maskinutnyttjandegrad | Tillgänglighet × prestanda × kvalitet |

### Smart import

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Produktionsrapport-import** | Importera utfallsdata per tillverkningsorder | Godkänt/kasserat, materialförbrukning, auto-kontosättning |
| **Lagerexport-import** | Importera lagerförändringar | Per lagernivå, inventeringsresultat |

### Operativa moduler

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Produktionsplanering** | Schemalägga tillverkningsorder | Ordervy, maskinbeläggning, kapacitet |
| **Strukturlista (BOM)** | Definiera materialstruktur | Komponenter, nivåer, alternativa delar |
| **Kvalitetskontroll** | Säkerställ produktkvalitet | Kontrollplaner, mätprotokoll, avvikelser |
| **Maskinunderhåll** | Förebyggande och avhjälpande underhåll | Schema, felanmälan, reservdelsförbrukning |
| **Spårbarhet & Batch** | Spåra råvaror till färdig produkt | Batchnummer, komponentspårning, återkallning |

---

## 18. Konsult & Rådgivning

Enklare bokföring: tidrapport → faktura, traktamente, hemmakontor. Ofta enskild firma. WIP-bevakning vid löpande räkning.

### Bokföring & Skatt

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Konsultkontoplan** | BAS-konton för konsultintäkt, utlägg, resor | Konton 3010 (konsultarvode), 5800 (resekostnad), 6990 (vidarefakturerade utlägg) |
| **Traktamente** | Beräkna traktamente vid tjänsteresor enligt Skatteverkets schabloner | Hel/halvdag, reducering vid fri måltid, skattefri del, förmånsvärde |
| **Hemmakontor-avdrag** | Schablonavdrag för hemmakontor | Fast belopp (2 000/4 000 SEK), alternativt verklig kostnad med yta-beräkning |
| **WIP-bevakning** | Pågående ej fakturerat arbete | Konto 1470, per uppdrag, åldringsanalys |

### Branschrapporter

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Debiteringsgrad** | Debiterbara timmar / total arbetstid | Mål vs utfall, trend |
| **Intäkt per konsult** | Total fakturering per person | Ranking, budget vs utfall |

### Smart import

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Tidrapport-import** | Importera tid från Harvest, Toggl, Clockify | CSV, koppling till uppdrag, fakturaunderlag |

### Operativa moduler

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Uppdragshantering** | Administrera kunduppdrag | Milstolpar, statusvy, lönsamhetsanalys |
| **Tidrapportering** | Detaljerad tidregistrering | Timer, kategorier, veckoöversikt |
| **Offert & Avtal** | Skapa offerter | Mallar, godkännande, avtalsstatus |

---

## 19. Event & Underhållning

Biljettintäkter som förskott (periodisering). Moms 6% på kulturella evenemang. SINK-skatt vid utländska artister. Sponsorintäkter. Eventbudget.

### Bokföring & Skatt

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Eventkontoplan** | BAS-konton per intäktstyp: biljetter, sponsring, F&B, merch | Konton 3010 (biljettintäkt), 3020 (sponsorintäkt), 3030 (F&B), 3040 (merch) |
| **Biljettintäkt som förskott** | Bokför förskottssålda biljetter som skuld tills eventet äger rum | Konto 2420, intäktsföring vid genomfört event, avbokningshantering |
| **Kulturmoms 6%** | Hantera reducerad moms på kulturella föreställningar | Moms 6% på biljetter, 25% på mat/dryck/merch, blandad verksamhet |
| **Artistskatt (SINK)** | Hantera källskatt för utländska artister | Beräkning av SINK (15%), inbetalning till Skatteverket, underlag per artist |
| **Sponsorintäktsbokföring** | Bokför sponsoravtal med motprestationsperiodisering | Periodisering per event, konto 3910, avtalsvärde vs motprestation |

### Branschrapporter

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Intäkt per besökare** | Total intäkt delat på antal besökare | Biljett + F&B + merch, jämförelse mellan event |
| **Budget vs utfall** | Eventbudget jämfört med verkligt resultat | Per kostnadspost, totalt, vinstmarginal |
| **Sponsorandel** | Sponsorintäkt som andel av total intäkt | Per event, trend, beroendeanalys |

### Smart import

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Biljettsystem-import** | Importera försäljningsdata från biljettsystem | Ticketmaster, Eventbrite, NORTIC; auto-kontosättning inkl avgifter |
| **POS-rapport-import** | Importera F&B- och merch-försäljning | Kassarapport från eventbar/shop, momssplit |

### Operativa moduler

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Evenemangsplanering** | Planera och koordinera event | Checklista, tidslinje, budget |
| **Biljettförsäljning** | Sälj och hantera biljetter | Biljettyper, priskategorier, QR-validering |
| **Artist- & Talangbokning** | Boka artister och föreläsare | Kontrakt, riderhantering, schema |
| **Sponsorhantering** | Hantera sponsoravtal | Avtalsnivåer, motprestationer, uppföljning |
| **Volontärhantering** | Koordinera frivilliga | Registrering, skifttilldelning, kommunikation |

---

## 20. Fastighetsförvaltning

Hyresintäkter (periodisering). Fastighetsskatt/avgift. Avskrivning fastigheter (lång tid). Underhållsfond. ROT vid renovering. Stämpelskatt vid köp.

### Bokföring & Skatt

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Fastighetskontoplan** | BAS-konton per fastighet och kostnadstyp | Konton 1110 (byggnader), 3010 (hyresintäkt), 5010 (fastighetsskötsel), 7720 (fastighetsskatt) |
| **Hyresintäkt-periodisering** | Periodisera hyresintäkter korrekt per månad | Förskottshyra (konto 2970), hyresrabatt, tomgångskostnad |
| **Fastighetsskatt** | Beräkna och bokföra fastighetsskatt/avgift | Taxeringsvärde, skattesats per fastighetstyp, konto 7720, periodisering |
| **Fastighetsavskrivning** | Avskrivningsplan per byggnad (lång löptid) | Komponentavskrivning (K3) eller linjär (K2), konto 1119/7820 |
| **Underhållsfond** | Avsätt medel för planerat underhåll | Avsättning per år, upplösning vid genomfört underhåll, 10-årsplan kopplad |
| **ROT vid renovering** | Hantera ROT-avdrag för hyresgäster vid renovering | Beräkning, personnummer, Skatteverket-rapportering |
| **Indexuppräkning** | Automatisk beräkning av hyreshöjning vid index | KPI-koppling, beräkning per kontrakt, underlag för avisering |

### Branschrapporter

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Driftnetto per fastighet** | Hyresintäkt minus driftskostnad | Per fastighet/objekt, jämförelse, trend |
| **Vakansgrad** | Andel outhyrda ytor | Per fastighet, trendanalys, intäktsbortfall |
| **Underhållskostnad per m²** | Total underhållskostnad per kvadratmeter | Plan vs utfall, per fastighet, kategori |

### Smart import

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Hyresreskontra-import** | Importera hyresreskontra | Avier, betalningar, restbelopp; auto-kontosättning |
| **Energirapport-import** | Importera energiförbrukning | El/vatten/fjärrvärme, per fastighet, kostnadsfördelning |

### Operativa moduler

| Modul | Beskrivning | Nyckelfunktioner |
|---|---|---|
| **Objektregister** | Fastighets- och lokalöversikt | Adresser, ytor, byggnadsår, dokument |
| **Hyresgästhantering** | Administrera hyresavtal | Avtalstider, kontakt, uppsägningsflöde |
| **Hyresavier** | Generera och skicka avier | Automatisk avisering, tillägg, autogiro |
| **Felanmälan** | Hantera felanmälningar | Webformulär, prioritet, hantverkarstyrning |
| **Underhållsplanering** | Långsiktig och akut | 10-årsplan, kostnadsprognos, status |
| **Besiktning & Rondering** | Dokumentera besiktningar | Protokoll, foto, avvikelserapport |
| **Energiövervakning** | Följ energiförbrukning | El/vatten/värme, jämförelse, energideklaration |
