ERP-Base: Gap-analys mot svensk bokföringsmarknad

1. SAKNAS HELT — Kritiska luckor
1.1 Leverantörsreskontra
Alla etablerade system har fullständig leverantörsreskontra: registrering av inkommande fakturor, förfallodatum, betalningsstatus, automatisk bokföring vid betalning. Ditt system saknar tabeller och flöden för leverantörsfakturor. Detta är ett absolut krav för att kunna kallas bokföringssystem.
Behövs: suppliers-tabell, supplier_invoices-tabell, flöde för registrering/betalning/bokföring, leverantörsreskontra-rapport, stöd för både kontant- och fakturametoden.
1.2 Kundreskontra (formellt)
Du har invoices och customers, men det saknas en explicit kundreskontra-vy som visar utestående fordringar, förfallna fakturor, och avstämning mot konto 1510. Alla konkurrenter har detta som standardfunktion.
1.3 Lönehantering
salary_payments finns men alla konkurrenter (Fortnox, Bokio, Visma) erbjuder komplett lönehantering: lönespecifikationer, arbetsgivaravgifter, skattetabeller (FOS-förfrågan mot Skatteverket), AGI-rapportering, semesterhantering. Detta är en separat modul som de flesta SME-kunder förväntar sig.
Behövs: Skattetabellhantering, lönespec-generering (PDF), arbetsgivaravgiftsberäkning, AGI-rapportering, semesterskuld, förmånsberäkning (bil, etc).
1.4 Årsredovisning (K2/K3)
Aktiebolag måste lämna årsredovisning till Bolagsverket. Fortnox och Björn Lundén genererar detta. Din plattform har årsbokslut men saknar årsredovisningsgenerering med förvaltningsberättelse, noter, och formell K2/K3-struktur.
Behövs: Generering av förvaltningsberättelse, resultaträkning (K2-format), balansräkning (K2-format), noter, digital inlämning till Bolagsverket (XBRL).
1.5 Kontantmetod-stöd
Många enskilda firmor bokför med kontantmetoden (bokslutsmetoden). Ditt system verkar byggt kring faktureringsmetoden. Båda måste stödjas, med automatisk övergång till fakturametod vid bokslut för kontantmetoden.
1.6 Anläggningsregister
Inventarier, maskiner, fastigheter — med avskrivningsplaner (linjär/degressiv), restvärden, och automatisk avskrivningsbokföring. Saknas helt. Krävs för AB med tillgångar.
1.7 Offert/Order-flöde
Fortnox och Visma har offert → order → faktura-kedja. Inte nödvändigt för MVP men förväntat i ett komplett system.

2. FINNS MEN OTILLRÄCKLIGT — Behöver utökas
2.1 Bokföringsmallar / Konteringshjälp
Bokio's stora USP är smart konteringshjälp: användaren väljer "IT-tjänst 25% moms" och systemet konterar automatiskt. Du har AI-kategorisering, men saknar troligen ett bibliotek av färdiga bokföringsmallar för vanliga affärshändelser som en nybörjare kan välja mellan.
Behövs: 50-100 vanliga transaktionsmallar (kontorsmateriell, IT-tjänst, bensin, representation, etc) med korrekt moms och kontering.
2.2 Bankavstämning
Du har PSD2-transaktionssynk, men behöver explicit bankavstämning: matcha banktransaktioner mot bokförda poster, markera avstämda, visa differenser. Alla konkurrenter har detta.
2.3 Momsdeklaration
Du nämner "10 rutor" men verifierar att den genererar korrekt SKV 4820-underlag? Behöver också stödja: EU-handel (omvänd skattskyldighet), import/export-moms, olika momssatser (25/12/6/0%), tröskelbelopp (120 000 SEK från 2025).
2.4 SIE-export
Du har SIE4-export. Verifiera att SIE-import också fungerar korrekt (ingående balanser, verifikationer, kontoplan) — detta är kritiskt för att kunder ska kunna byta till ditt system från Fortnox/Bokio.
2.5 Rapporter
Du har saldobalans, resultat, balans, moms. Saknar troligen:
Huvudbok (alla transaktioner per konto)
Grundbok (verifikationslista i datumordning)
Kundreskontra-rapport
Leverantörsreskontra-rapport
Periodrapporter (jämförelse mellan perioder)
Kassaflödesanalys

3. HYGIEN-FUNKTIONER — Förväntas av alla
3.1 Autentisering
BankID-inloggning förväntas av svenska användare. Inte nödvändigt dag 1, men e-post + lösenord + 2FA via TOTP är minimum.
3.2 Mobilapp / Responsivt
Alla konkurrenter har mobilapp eller fullt responsivt gränssnitt. Kvittofotografering från mobil är en hygienfaktor.
3.3 Periodlåsning
Bokföringslagen kräver att bokföring är "varaktig" — du behöver kunna låsa perioder så att poster inte kan ändras i efterhand utan att det syns. Du har WORM-arkiv, verifiera att periodlåsning är implementerad.
3.4 Fleranvändarstöd
Roller: ägare, redovisningskonsult (extern), anställd. Behörigheter per modul. Alla konkurrenter har detta. Redovisningskonsult-access är affärskritiskt — byråer är den viktigaste distributionskanalen.
3.5 Verifikationskedja
Varje verifikation behöver: löpnummer utan luckor, datum, belopp, motkonto, beskrivning, bifogat underlag. Du har detta delvis via WORM + voucher numbering, men verifiera fullständigt BFL-compliance.
