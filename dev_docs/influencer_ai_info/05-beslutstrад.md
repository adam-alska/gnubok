# Beslutsträd

## 1. Produkter och förmåner

### 1.1 Mottagen produkt

```
┌─ Fick du en produkt?
│
├─► Fanns avtal/överenskommelse om motprestation?
│   │
│   ├─► JA (samarbete)
│   │   └─► SKATTEPLIKTIG INTÄKT
│   │       Värde: Marknadspris inkl. moms
│   │       Bokför som: Intäkt + eget uttag (om privat bruk)
│   │
│   └─► NEJ (oombett pressutskick)
│       │
│       ├─► Behåller du produkten?
│       │   │
│       │   ├─► JA
│       │   │   └─► SKATTEPLIKTIG INTÄKT
│       │   │       Värde: Marknadspris inkl. moms
│       │   │
│       │   └─► NEJ
│       │       │
│       │       ├─► Returnerade
│       │       │   └─► EJ SKATTEPLIKTIG
│       │       │       Krav: Spara returkvitto
│       │       │
│       │       ├─► Kastade/gav bort
│       │       │   └─► EJ SKATTEPLIKTIG
│       │       │       Krav: Ingen privat användning dessförinnan
│       │       │
│       │       └─► Sålde vidare
│       │           └─► FÖRSÄLJNINGSINTÄKT SKATTEPLIKTIG
│       │               (Ej ursprungsvärdet, utan säljpriset)
```

---

### 1.2 Sponsrad resa

```
┌─ Bjuden på resa av uppdragsgivare?
│
├─► Är resan nödvändig för verksamheten?
│   │
│   ├─► NEJ
│   │   └─► HELA VÄRDET SKATTEPLIKTIGT
│   │
│   └─► JA
│       │
│       ├─► Arbetar du ≥30h/vecka ELLER ≥6h/dag under resan?
│       │   │
│       │   ├─► NEJ
│       │   │   └─► DELVIS SKATTEPLIKTIGT
│       │   │       Nöjesandelen beskattas
│       │   │
│       │   └─► JA
│       │       │
│       │       ├─► Är nöjesinslagen försumbara?
│       │       │   │
│       │       │   ├─► JA
│       │       │   │   └─► SKATTEFRI RESA
│       │       │   │
│       │       │   └─► NEJ
│       │       │       └─► DELVIS SKATTEPLIKTIGT
│       │       │           Nöjesandelen beskattas
│
├─► Följer partner/vän med gratis?
│   └─► JA
│       └─► ALLTID SKATTEPLIKTIG FÖRMÅN
│           Värde: Medföljarens faktiska reskostnad
```

---

### 1.3 Rabattkod/personalrabatt

```
┌─ Fick du rabatt som del av ersättning?
│
├─► Rabatt på produkter du ska marknadsföra?
│   └─► SKATTEPLIKTIG
│       Värde: Marknadspris - betalt pris
│
├─► Rabatt för eget bruk (ej kopplat till uppdrag)?
│   │
│   ├─► Erbjuds samma rabatt till allmänheten?
│   │   └─► EJ SKATTEPLIKTIG (öppen kampanj)
│   │
│   └─► Exklusiv rabatt?
│       └─► SKATTEPLIKTIG
│           Värde: Normalrabatt till allmänheten jämförs
```

---

## 2. Momshantering

### 2.1 Val av momsregel vid fakturering

```
┌─ Vem fakturerar du?
│
├─► Svenskt företag
│   └─► SVENSK MOMS 25%
│       Ruta: 05-08
│       Periodisk sammanställning: Nej
│
├─► Företag i annat EU-land
│   │
│   ├─► Har kunden giltigt VAT-nummer?
│   │   │
│   │   ├─► JA
│   │   │   └─► REVERSE CHARGE (0% moms)
│   │   │       Ruta: 39
│   │   │       Periodisk sammanställning: JA
│   │   │       Text på faktura: "Reverse charge"
│   │   │
│   │   └─► NEJ
│   │       └─► Behandla som privatperson
│   │           → Se "Privatperson i EU"
│   │
├─► Företag utanför EU
│   └─► EXPORT (0% moms)
│       Ruta: 40
│       Periodisk sammanställning: Nej
│
├─► Privatperson i Sverige
│   └─► SVENSK MOMS 25%
│       Ruta: 05-08
│
├─► Privatperson i annat EU-land
│   │
│   ├─► Total EU-privatförsäljning ≤99,680 kr/år?
│   │   │
│   │   ├─► JA
│   │   │   └─► VALFRITT:
│   │   │       • Svensk moms 25% (enklast)
│   │   │       • ELLER mottagarlandets moms via OSS
│   │   │
│   │   └─► NEJ (över tröskeln)
│   │       └─► OBLIGATORISKT mottagarlandets moms
│   │           Redovisa via OSS
│   │
├─► Privatperson utanför EU
│   └─► EXPORT (0% moms)
│       Ruta: 40
```

---

### 2.2 Momsregistrering

```
┌─ Behöver jag momsregistrera mig?
│
├─► Bedriver du momspliktig verksamhet?
│   │
│   ├─► NEJ (t.ex. sjukvård, utbildning)
│   │   └─► INGEN MOMSREGISTRERING
│   │
│   └─► JA
│       │
│       ├─► Omsättning >80,000 kr/år?
│       │   │
│       │   ├─► JA
│       │   │   └─► OBLIGATORISK registrering
│       │   │
│       │   └─► NEJ
│       │       │
│       │       ├─► Säljer du till EU-företag (Reverse Charge)?
│       │       │   │
│       │       │   ├─► JA
│       │       │   │   └─► REKOMMENDERAD registrering
│       │       │   │       (för periodisk sammanställning)
│       │       │   │
│       │       │   └─► NEJ
│       │       │       └─► FRIVILLIG registrering
│       │       │           Fördel: Momsavdrag på inköp
```

---

## 3. Bolagsform

### 3.1 EF eller AB?

```
┌─ Vilken bolagsform passar?
│
├─► Förväntad årlig vinst?
│   │
│   ├─► <300,000 kr
│   │   └─► ENSKILD FIRMA
│   │       • Enklare administration
│   │       • Skattemässigt likvärdigt
│   │
│   ├─► 300,000 - 500,000 kr
│   │   │
│   │   ├─► Accepterar du personligt ansvar?
│   │   │   │
│   │   │   ├─► JA
│   │   │   │   └─► EF kan fungera
│   │   │   │       Överväg AB om växande
│   │   │   │
│   │   │   └─► NEJ
│   │   │       └─► AKTIEBOLAG
│   │   │
│   ├─► >500,000 kr
│   │   └─► AKTIEBOLAG
│   │       • Betydande skattefördel via 3:12
│   │       • Ansvarsbegränsning
│   │
├─► Juridisk risk i verksamheten?
│   │
│   ├─► HÖG (kontroversiellt innehåll, upphovsrättskänsligt)
│   │   └─► AKTIEBOLAG
│   │       Personlig ekonomi skyddad
│   │
│   └─► LÅG
│       └─► Båda fungerar
│
├─► Planerar investerare/partners?
│   │
│   ├─► JA
│   │   └─► AKTIEBOLAG
│   │       Ägarandelar möjliga
│   │
│   └─► NEJ
│       └─► Båda fungerar
```

---

### 3.2 När byta från EF till AB?

```
┌─ Ska jag byta till AB?
│
├─► Vinst >500,000 kr konsekvent (2+ år)?
│   └─► JA → Stark indikation för AB
│
├─► Juridisk tvist eller risk?
│   └─► JA → AB skyddar privatekonomin
│
├─► Vill ha utdelning istället för lön?
│   └─► JA → AB möjliggör 20% skatt
│
├─► Vill anställa personal?
│   └─► JA → AB ofta lämpligare
│
├─► Planerar sälja verksamheten?
│   └─► JA → AB enklare att överlåta
│
Om 2+ JA → Överväg starkt att byta till AB
```

---

## 4. Avdrag

### 4.1 Är kostnaden avdragsgill?

```
┌─ Är utgiften avdragsgill?
│
├─► Teknik (kamera, dator, mikrofon, ljus)
│   │
│   ├─► Används i verksamheten?
│   │   │
│   │   ├─► Uteslutande verksamhet
│   │   │   └─► FULLT AVDRAG
│   │   │
│   │   ├─► Delvis privat
│   │   │   └─► PROPORTIONELLT AVDRAG
│   │   │       (Bedöm verksamhetsandel)
│   │   │
│   │   └─► Huvudsakligen privat
│   │       └─► INGET/MARGINELLT AVDRAG
│
├─► Kläder
│   │
│   ├─► Kan användas privat?
│   │   │
│   │   ├─► JA (normala kläder)
│   │   │   └─► EJ AVDRAGSGILL
│   │   │
│   │   └─► NEJ
│   │       │
│   │       ├─► Uniform/skyddskläder
│   │       │   └─► AVDRAGSGILL
│   │       │
│   │       ├─► Extrem scenklädsel
│   │       │   └─► AVDRAGSGILL
│   │       │       (Dokumentera varför ej privat)
│   │       │
│   │       └─► Historisk kostym/rekvisita
│   │           └─► AVDRAGSGILL
│
├─► Smink och skönhet
│   │
│   ├─► Vardagssmink/hudvård
│   │   └─► EJ AVDRAGSGILL
│   │
│   ├─► Teatersmink/sfx
│   │   └─► AVDRAGSGILL
│   │
│   └─► Skönhetsingrepp (filler, botox, kirurgi)
│       └─► EJ AVDRAGSGILL
│           (Oavsett "varumärkes"-argument)
│
├─► Resa
│   │
│   ├─► Arbetsresa med dokumenterat syfte?
│   │   │
│   │   ├─► JA, endast arbete
│   │   │   └─► FULLT AVDRAG
│   │   │
│   │   ├─► JA, men även privata inslag
│   │   │   └─► PROPORTIONELLT AVDRAG
│   │   │       (Endast arbetsdagar)
│   │   │
│   │   └─► Huvudsakligen privat
│   │       └─► EJ AVDRAGSGILL
│   │
│   └─► Pendling hem-arbete
│       └─► EJ AVDRAGSGILL
│
├─► Hemmakontor
│   │
│   ├─► Separat rum, ej bostad, exklusiv användning?
│   │   │
│   │   ├─► JA
│   │   │   └─► FAKTISKT AVDRAG
│   │   │       (Andel av hyra)
│   │   │
│   │   └─► NEJ
│   │       └─► SCHABLONAVDRAG 2,000 kr
│   │           (Krav: >800 h arbete i bostad)
│
├─► Agentarvode/provision
│   └─► FULLT AVDRAG
│       (Direkt kopplat till intäkt)
│
├─► Programvara/prenumerationer
│   │
│   ├─► Verksamhetsrelaterad?
│   │   │
│   │   ├─► JA (Adobe, redigeringsprogram)
│   │   │   └─► FULLT AVDRAG
│   │   │
│   │   └─► NEJ (Netflix, Spotify privat)
│   │       └─► EJ AVDRAGSGILL
```

---

## 5. Social trygghet

### 5.1 SGI-optimering

```
┌─ Hur optimerar jag SGI?
│
├─► Bolagsform?
│   │
│   ├─► Enskild firma
│   │   │
│   │   ├─► SGI = skattemässigt överskott
│   │   │
│   │   ├─► Gör du avdrag som sänker överskottet?
│   │   │   │
│   │   │   ├─► JA
│   │   │   │   └─► VARNING: Lägre SGI!
│   │   │   │       Överväg om avdragen är värda
│   │   │   │       den lägre sjuk-/föräldrapenningen
│   │   │   │
│   │   │   └─► NEJ
│   │   │       └─► OK
│   │   │
│   │   └─► Uppbyggnadsskede (<36 månader)?
│   │       └─► JA → Kan få jämförelseinkomst
│   │
│   └─► Aktiebolag
│       │
│       ├─► SGI = endast utbetald lön
│       │   (Utdelning räknas EJ)
│       │
│       ├─► Tar du ut tillräcklig lön?
│       │   │
│       │   ├─► JA (≥400,000 kr/år rekommenderat)
│       │   │   └─► OK
│       │   │
│       │   └─► NEJ (låg lön + hög utdelning)
│       │       └─► VARNING: Lågt skydd!
│       │           Risk vid sjukdom/barn
│
├─► Planerar du barn inom 12 månader?
│   │
│   └─► JA
│       └─► MAXIMERA SGI NU
│           • EF: Minimera avdrag
│           • AB: Höj lönen, sänk utdelning
│           • SGI tar ~12 månader att bygga upp
│
├─► Befintligt SGI-skydd tillräckligt?
│   │
│   ├─► Test: Vad får du i sjukpenning?
│   │   Sjukpenning = SGI × 0.8 / 365 per dag
│   │
│   └─► Rekommendation: SGI ≥400,000 kr
│       → ~876 kr/dag i sjukpenning
```

---

## 6. Marknadsföringslagen

### 6.1 Ska inlägget märkas som reklam?

```
┌─ Behöver jag märka med REKLAM?
│
├─► Fick du ersättning (pengar, produkter, tjänster)?
│   │
│   ├─► JA
│   │   │
│   │   ├─► Finns avtal/överenskommelse om publicering?
│   │   │   │
│   │   │   ├─► JA
│   │   │   │   └─► MÄRKNING KRÄVS
│   │   │   │       "REKLAM" eller "ANNONS"
│   │   │   │       Placering: Överst i inlägg
│   │   │   │
│   │   │   └─► NEJ (spontan recension)
│   │   │       │
│   │   │       ├─► Behöll du produkten?
│   │   │       │   │
│   │   │       │   ├─► JA
│   │   │       │   │   └─► REKOMMENDERAD märkning
│   │   │       │   │       (Transparens)
│   │   │       │   │
│   │   │       │   └─► NEJ
│   │   │       │       └─► Ingen märkning krävs
│   │   │
│   └─► NEJ (köpte själv, äkta rekommendation)
│       │
│       ├─► Affiliate-länk inkluderad?
│       │   │
│       │   ├─► JA
│       │   │   └─► MÄRKNING KRÄVS
│       │   │       (Du tjänar på klick/köp)
│       │   │
│       │   └─► NEJ
│       │       └─► Ingen märkning krävs
│
├─► Är det osäkert?
│   └─► JA
│       └─► MÄRK ÄNDÅ
│           Hellre för tydlig än otydlig
```

---

## 7. Dubbel struktur (EF + AB)

### 7.1 Vilket företag för uppdraget?

```
┌─ Ska uppdraget faktureras från EF eller AB?
│
├─► Ersättningsnivå?
│   │
│   ├─► <50,000 kr
│   │   └─► EF (enkelhet)
│   │
│   ├─► 50,000 - 100,000 kr
│   │   └─► Bedöm övriga faktorer ↓
│   │
│   └─► >100,000 kr
│       └─► AB (skatteoptimering)
│
├─► Juridisk risk?
│   │
│   ├─► Hög (kontroversiellt, oklara rättigheter)
│   │   └─► AB (ansvarsbegränsning)
│   │
│   └─► Låg
│       └─► Båda fungerar
│
├─► Avtalstyp?
│   │
│   ├─► Engångsuppdrag
│   │   └─► EF (enkelhet)
│   │
│   └─► Långt ambassadörskap (6+ månader)
│       └─► AB (stabilare struktur)
│
├─► Internationell klient?
│   │
│   ├─► JA
│   │   └─► AB (tydligare för utländska parter)
│   │
│   └─► NEJ
│       └─► Båda fungerar
│
├─► Behöver bygga SGI?
│   │
│   ├─► JA, via EF-överskott
│   │   └─► EF
│   │
│   ├─► JA, via AB-lön
│   │   └─► AB
│   │
│   └─► SGI tillräcklig
│       └─► Optimera för skatt
```

---

### 7.2 Internfaktura mellan EF och AB

```
┌─ Ska EF fakturera AB (eller vice versa)?
│
├─► Finns verklig tjänst/vara som levereras?
│   │
│   ├─► JA
│   │   │
│   │   ├─► Är prissättningen marknadsmässig?
│   │   │   │
│   │   │   ├─► JA (inom ±20% av marknad)
│   │   │   │   │
│   │   │   │   ├─► Finns skriftligt avtal?
│   │   │   │   │   │
│   │   │   │   │   ├─► JA
│   │   │   │   │   │   └─► OK - Internfaktura tillåten
│   │   │   │   │   │       Glöm ej moms (25%)
│   │   │   │   │   │
│   │   │   │   │   └─► NEJ
│   │   │   │   │       └─► UPPRÄTTA AVTAL
│   │   │   │   │           Innan fakturering
│   │   │   │   │
│   │   │   └─► NEJ (avviker >20%)
│   │   │       └─► JUSTERA PRISET
│   │   │           Risk: Omklassificering av Skatteverket
│   │   │
│   └─► NEJ (ren skatteplanering)
│       └─► EJ TILLÅTEN
│           Risk: Förtäckt lön/utdelning
```
