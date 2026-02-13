# UI/UX Specification

## Design Principles

1. **Calm over busy**: Financial apps induce anxiety. Use whitespace, muted colors, clear hierarchy.
2. **One action per screen**: Each view has one primary action.
3. **Instant feedback**: Every action shows immediate result.
4. **Mobile-first**: Influencers manage finances on phone.

Color System
CSS

:root {
  /* Primary - Deep Forest & Sage (Trustworthy but aesthetic) */
  --primary-50: #f4fbf7;
  --primary-500: #4d8b73;
  --primary-600: #3a6b58;
  --primary-700: #2c4f42;
  
  /* Success - Muted Mint (Profit/Growth) */
  --success-500: #10b981;
  
  /* Warning - Burnt Amber (Pending/Alerts) */
  --warning-500: #d97706;
  
  /* Danger - Soft Brick (Expenses/Loss) */
  --danger-500: #e11d48;
  
  /* Neutral - "Stone" (Warmer than standard gray, feels like paper) */
  --gray-50: #fafaf9;  /* Background base */
  --gray-100: #f5f5f4; /* Card background */
  --gray-200: #e7e5e4; /* Borders */
  --gray-500: #78716c; /* Secondary text */
  --gray-900: #1c1917; /* Primary text (Soft Black) */
}
Typography
Headings: Plus Jakarta Sans or Outfit (600/700 weight) — More editorial feel

Body: Inter (400/500 weight) — Clean readability

Numbers/Money: JetBrains Mono or Inter (Tabular figures enabled)

## Page Layouts

### Onboarding Wizard (/onboarding)

Full-screen wizard. User cannot access app until complete. Progress saved between sessions.

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  Logo                                          Steg 1 av 6  │
│                                                             │
│  ━━━━━━━━━━○○○○○○                                          │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│           VÄLKOMMEN! LÅT OSS KOMMA IGÅNG                   │
│                                                             │
│           Vilken bolagsform har du?                         │
│                                                             │
│           ┌─────────────────────────────────────┐          │
│           │                                     │          │
│           │  ○  Enskild firma                   │          │
│           │     Enskild näringsidkare           │          │
│           │                                     │          │
│           └─────────────────────────────────────┘          │
│                                                             │
│           ┌─────────────────────────────────────┐          │
│           │                                     │          │
│           │  ○  Aktiebolag (AB)                 │          │
│           │     Eget bolag med org.nummer       │          │
│           │                                     │          │
│           └─────────────────────────────────────┘          │
│                                                             │
│                                                             │
│                                                             │
│           ┌─────────────────────────────────────┐          │
│           │            Fortsätt →               │          │
│           └─────────────────────────────────────┘          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Wizard Steps:**

1. **Entity Type** - Enskild firma or Aktiebolag
2. **Company Details** - Name, org.nr (required for AB), address
3. **Tax Registration** - F-skatt status, VAT registered?, momsperiod
4. **Preliminary Tax** - Monthly F-skatt amount (for comparison warnings)
5. **Bank Details** - Account info for invoice payments (IBAN/BIC or Swedish format)
6. **Connect Bank** - Enable Banking integration (at least one account required)

```
STEP 2: FÖRETAGSUPPGIFTER
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  Företagsnamn *                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Anna Andersson Content                              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Organisationsnummer *  (för AB)                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 559123-4567                                         │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Adress *                                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Storgatan 1                                         │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Postnummer *              Ort *                            │
│  ┌──────────────┐         ┌────────────────────────────┐   │
│  │ 111 22       │         │ Stockholm                  │   │
│  └──────────────┘         └────────────────────────────┘   │
│                                                             │
│                                                             │
│  ┌──────────────┐    ┌─────────────────────────────────┐   │
│  │   ← Tillbaka │    │            Fortsätt →           │   │
│  └──────────────┘    └─────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

```
STEP 3: SKATTEREGISTRERING
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ☑ Jag har F-skattsedel                                     │
│                                                             │
│  ───────────────────────────────────────────────────────── │
│                                                             │
│  Räkenskapsår *                                             │
│  ○ Kalenderår (jan-dec)                                     │
│  ○ Brutet räkenskapsår                                      │
│                                                             │
│  [Visas om brutet:]                                         │
│  Räkenskapsåret börjar *                                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Juli (1 jul - 30 jun)                           ▼   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ───────────────────────────────────────────────────────── │
│                                                             │
│  Är du momsregistrerad? *                                   │
│                                                             │
│  ○ Ja, jag är momsregistrerad                               │
│  ○ Nej, min omsättning är under 80 000 kr/år                │
│                                                             │
│  [Visas om momsregistrerad:]                                │
│                                                             │
│  Momsnummer                                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ SE559123456701                                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Momsperiod *                                               │
│  ○ Kvartalsvis (vanligast)                                  │
│  ○ Månadsvis                                                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

```
STEP 4: PRELIMINÄRSKATT
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  Hur mycket betalar du i F-skatt per månad?                 │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 15 000                                          kr  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ⓘ Vi använder detta för att varna dig om din beräknade    │
│    skatt skiljer sig mycket från det du betalar in.         │
│                                                             │
│  Hittar du det på:                                          │
│  • Ditt senaste F-skattbeslut från Skatteverket             │
│  • Skattekontot på skatteverket.se                          │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Jag vet inte just nu - hoppa över                   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

```
STEP 6: KOPPLA BANK
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  Koppla ditt företagskonto                                  │
│                                                             │
│  Vi hämtar dina transaktioner automatiskt så du slipper     │
│  mata in dem manuellt.                                      │
│                                                             │
│  🔒 Säkert via BankID. Vi kan aldrig flytta dina pengar.   │
│                                                             │
│           ┌─────────────────────────────────────┐          │
│           │     🏦 Koppla bankkonto            │          │
│           └─────────────────────────────────────┘          │
│                                                             │
│  Populära banker:                                           │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          │
│  │ Nordea  │ │   SEB   │ │Swedbank │ │ Handels │          │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘          │
│                                                             │
│  ⓘ Du kan koppla fler konton senare i inställningar.       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Validation Rules:**
- All fields marked * are required
- Org.nr validated against format (NNNNNN-NNNN)
- At least one bank account must be connected
- Cannot proceed without completing current step

---

### Dashboard (/)

```
┌─────────────────────────────────────────────────────────────┐
│  Logo                                    [Settings] [Avatar]│
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                     │   │
│  │   DISPONIBELT ATT SPENDERA                         │   │
│  │                                                     │   │
│  │        136 205 kr                                  │   │
│  │   ───────────────────                              │   │
│  │                                                     │   │
│  │   Total: 450 000 kr                                │   │
│  │   ┌────────────────────────────┬──────────────┐   │   │
│  │   │██████████████████████████  │░░░░░░░░░░░░░░│   │   │
│  │   │ Disponibelt 30%            │ Låst 70%     │   │   │
│  │   └────────────────────────────┴──────────────┘   │   │
│  │                                                     │   │
│  │   [Visa skatteberäkning ↓]                         │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────┐  ┌─────────────────────┐          │
│  │ ⚠️ 23 transaktioner │  │ 📄 2 obetalda       │          │
│  │    att sortera      │  │    fakturor         │          │
│  │                     │  │    45 000 kr        │          │
│  │ [Sortera nu →]      │  │ [Visa →]            │          │
│  └─────────────────────┘  └─────────────────────┘          │
│                                                             │
│  INTÄKTER 2024          ┌────────────────────────┐         │
│  ──────────────         │                    ____│         │
│  450 000 kr             │               ____/    │         │
│                         │          ____/         │         │
│                         │     ____/              │         │
│                         │____/                   │         │
│                         └────────────────────────┘         │
│                         Jan Feb Mar Apr May Jun            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
│  [Dashboard]  [Transaktioner]  [Fakturor]  [+]             │
└─────────────────────────────────────────────────────────────┘
```

**Components:**

1. **BalanceCard**: Hero component showing available balance
   - Large number, animated on load
   - Expandable tax breakdown panel
   - Color-coded bar chart (green=available, gray=locked)

2. **AlertCard**: Action items requiring attention
   - Badge with count
   - Clear CTA button
   - Subtle warning color for urgency

3. **RevenueChart**: Simple line/area chart
   - Recharts or Chart.js
   - Hover shows month details
   - No unnecessary decoration

---

### Tax Breakdown (Expanded)

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  SKATTEBERÄKNING 2024                    [Så räknar vi]    │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  Intäkter                              450 000 kr          │
│  - Avdragsgilla kostnader               -85 000 kr          │
│  ─────────────────────────────────────────────────────────  │
│  = Resultat                             365 000 kr          │
│                                                             │
│  Egenavgifter (28,97%)                 -105 745 kr   ░░░░  │
│  Inkomstskatt (~32%)                   -116 800 kr   ░░░░░ │
│  Moms att betala                        -91 250 kr   ░░░░  │
│  ─────────────────────────────────────────────────────────  │
│  = Låst för skatt                       313 795 kr          │
│                                                             │
│  ⓘ Detta är en uppskattning. Faktisk skatt kan variera.    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

### Transactions - Swipe View (/transactions)

```
┌─────────────────────────────────────────────────────────────┐
│  ← Tillbaka              Sortera transaktioner              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│           23 kvar att sortera                               │
│                                                             │
│     ← PRIVAT                           FÖRETAG →            │
│                                                             │
│           ┌─────────────────────────┐                       │
│           │                         │                       │
│           │   ADOBE SYSTEMS         │                       │
│           │   -1 500,00 kr          │                       │
│           │                         │                       │
│           │   15 jan 2024           │                       │
│           │                         │                       │
│           │   ┌─────────────────┐   │                       │
│           │   │ Företag         │   │                       │
│           │   │ [▼ Välj typ]    │   │                       │
│           │   └─────────────────┘   │                       │
│           │                         │                       │
│           └─────────────────────────┘                       │
│                                                             │
│                      [Osäker?]                              │
│                                                             │
│  ──────────────────────────────────────────────────────────│
│                                                             │
│  Redan sorterade                                [Visa alla] │
│                                                             │
│  ● Adobe Systems     -1 500 kr    Programvara    ✓         │
│  ● Spotify AB        -149 kr      Privat         ✓         │
│  ● Influencer AB     +25 000 kr   Inkomst        ✓         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Interaction:**
- Swipe right = Business (show expense type selector)
- Swipe left = Private
- Tap "Osäker?" = Mark for later / add note
- Cards animate smoothly with spring physics

**Components:**

1. **SwipeCard**: Draggable card with gesture handling
   - Use `@use-gesture/react` + `framer-motion`
   - Threshold: 100px triggers categorization
   - Background color hints direction

2. **ExpenseTypeSelector**: Dropdown/bottom sheet
   - Only shown for business expenses
   - Quick-select common types

---

### Transactions - List View (/transactions?view=list)

```
┌─────────────────────────────────────────────────────────────┐
│  Transaktioner                          [Filter] [+ Manual] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 🔍 Sök transaktioner...                             │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  [Alla] [Osorterade (23)] [Företag] [Privat]               │
│                                                             │
│  JANUARI 2024                                               │
│  ───────────────────────────────────────────────────────── │
│                                                             │
│  15 jan   ADOBE SYSTEMS              -1 500,00 kr          │
│           Software subscription       [Programvara]   →    │
│                                                             │
│  14 jan   Influencer Agency AB       +25 000,00 kr         │
│           Faktura #INV-2024-012      [Inkomst]        →    │
│                                                             │
│  12 jan   ICA MAXI                    -847,00 kr           │
│           Osorterad                   [Sortera]       →    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

### Create Invoice (/invoices/new)

```
┌─────────────────────────────────────────────────────────────┐
│  ← Avbryt                Ny faktura              [Förhandsv]│
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  KUND                                                       │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 🔍 Sök eller skapa ny kund...                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │ Google Ireland   │  │ Influencer AB    │                │
│  │ EU-företag       │  │ Svenskt företag  │                │
│  └──────────────────┘  └──────────────────┘                │
│                                                             │
│  ───────────────────────────────────────────────────────── │
│                                                             │
│  FAKTURADETALJER                                            │
│                                                             │
│  Fakturadatum        Förfallodatum                          │
│  ┌────────────┐      ┌────────────┐                        │
│  │ 2024-01-15 │      │ 2024-02-14 │  (30 dagar)            │
│  └────────────┘      └────────────┘                        │
│                                                             │
│  Er referens                                                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ PO-12345                                            │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ───────────────────────────────────────────────────────── │
│                                                             │
│  RADER                                                      │
│                                                             │
│  Beskrivning                           Antal    À-pris     │
│  ┌────────────────────────────────┐   ┌────┐  ┌─────────┐ │
│  │ Instagram kampanj November     │   │ 1  │  │ 20 000  │ │
│  └────────────────────────────────┘   └────┘  └─────────┘ │
│                                                = 20 000 kr │
│                                                             │
│  [+ Lägg till rad]                                          │
│                                                             │
│  ───────────────────────────────────────────────────────── │
│                                                             │
│  Summa exkl. moms                          20 000,00 kr    │
│  Moms 25%                                   5 000,00 kr    │
│  ─────────────────────────────────────────────────────────  │
│  ATT BETALA                                25 000,00 kr    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │        [Spara utkast]    [Skapa & skicka]          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**VAT Logic Display:**

For EU customer with valid VAT:
```
│  Summa                                     20 000,00 kr    │
│  Moms                                           0,00 kr    │
│  ─────────────────────────────────────────────────────────  │
│  ATT BETALA                                20 000,00 kr    │
│                                                             │
│  ⓘ Omvänd skattskyldighet tillämpas (EU B2B)               │
```

**Components:**

1. **CustomerSelect**: Searchable dropdown with recent customers
   - Shows customer type badge
   - "Create new" option at bottom

2. **InvoiceLineItem**: Repeatable row
   - Auto-calculate line total
   - Drag to reorder

3. **VatSummary**: Auto-updating totals
   - Shows applicable VAT rule
   - Explanation tooltip

---

### Invoice Preview (Modal/Slide-over)

```
┌─────────────────────────────────────────────────────────────┐
│  Förhandsgranskning                               [✕ Stäng] │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                     │   │
│  │  ANNA ANDERSSON CONTENT                             │   │
│  │  Storgatan 1, 111 22 Stockholm                      │   │
│  │  F-skatt: Ja | Moms: SE123456789001                 │   │
│  │                                                     │   │
│  │  ─────────────────────────────────────────────────  │   │
│  │                                                     │   │
│  │  FAKTURA                                            │   │
│  │  Fakturanummer: INV-2024-015                        │   │
│  │  Fakturadatum: 2024-01-15                           │   │
│  │  Förfallodatum: 2024-02-14                          │   │
│  │                                                     │   │
│  │  Till:                                              │   │
│  │  Google Ireland Limited                             │   │
│  │  Gordon House, Barrow Street                        │   │
│  │  Dublin 4, Ireland                                  │   │
│  │  VAT: IE6388047V                                    │   │
│  │                                                     │   │
│  │  ─────────────────────────────────────────────────  │   │
│  │                                                     │   │
│  │  Beskrivning                Antal  Pris     Summa   │   │
│  │  ─────────────────────────────────────────────────  │   │
│  │  YouTube AdSense Jan 2024   1 st   €1,850   €1,850  │   │
│  │                                                     │   │
│  │  ─────────────────────────────────────────────────  │   │
│  │  Summa exkl. moms                          €1,850   │   │
│  │  Moms (0%)                                     €0   │   │
│  │  ─────────────────────────────────────────────────  │   │
│  │  ATT BETALA                                €1,850   │   │
│  │                                                     │   │
│  │  Reverse charge - Article 196 Council Directive    │   │
│  │  2006/112/EC                                        │   │
│  │                                                     │   │
│  │  ─────────────────────────────────────────────────  │   │
│  │  Betalning till: IBAN SE12 3456 7890 1234 5678 90   │   │
│  │  BIC: SWEDSESS                                      │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │   [Ladda ner PDF]          [Skicka via email]      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

### Salary Management (/salary) - Aktiebolag only

Only visible for users with entity_type = 'aktiebolag'.

```
┌─────────────────────────────────────────────────────────────┐
│  ← Tillbaka                         Lön & Arbetsgivaravgifter│
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  2024                                      [+ Registrera lön]│
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  HITTILLS I ÅR                                      │   │
│  │                                                     │   │
│  │  Bruttolön            150 000 kr                    │   │
│  │  Arbetsgivaravgifter   47 130 kr                    │   │
│  │  ─────────────────────────────────                  │   │
│  │  Total lönekostnad    197 130 kr                    │   │
│  │                                                     │   │
│  │  Innehållen skatt      45 000 kr  ⚠️ Att betala in  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  LÖNEUTBETALNINGAR                                          │
│  ───────────────────────────────────────────────────────── │
│                                                             │
│  Mars 2024                                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Brutto      50 000 kr    Arb.avg    15 710 kr     │   │
│  │  Skatt      -15 000 kr    Totalt     65 710 kr     │   │
│  │  ─────────────────                                  │   │
│  │  Netto       35 000 kr    AGI: ✓ Rapporterad       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Februari 2024                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Brutto      50 000 kr    Arb.avg    15 710 kr     │   │
│  │  Skatt      -15 000 kr    Totalt     65 710 kr     │   │
│  │  ─────────────────                                  │   │
│  │  Netto       35 000 kr    AGI: ⚠️ Ej rapporterad   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Register Salary Modal:**
```
┌─────────────────────────────────────────────────────────────┐
│  Registrera löneutbetalning                        [✕]     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Löneperiod *                                               │
│  ┌──────────────┐  till  ┌──────────────┐                  │
│  │ 2024-03-01   │        │ 2024-03-31   │                  │
│  └──────────────┘        └──────────────┘                  │
│                                                             │
│  Bruttolön *                                                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 50 000                                          kr  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Skattetabell *                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Tabell 33 - Stockholm                           ▼   │   │
│  └─────────────────────────────────────────────────────┘   │
│  ⓘ Hittas på ditt skattsedelsbesked                        │
│                                                             │
│  ───────────────────────────────────────────────────────── │
│                                                             │
│  BERÄKNAT                                                   │
│  Arbetsgivaravgifter (31,42%)           15 710 kr          │
│  Preliminärskatt (enligt tabell)        15 000 kr          │
│  ─────────────────────────────────────────────────────────  │
│  Nettolön till dig                      35 000 kr          │
│  Total kostnad för bolaget              65 710 kr          │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │               Registrera löneutbetalning            │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

### Settings (/settings)

```
┌─────────────────────────────────────────────────────────────┐
│  ← Tillbaka                   Inställningar                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  FÖRETAGSINFORMATION                                        │
│                                                             │
│  Företagsnamn                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Anna Andersson Content                              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ☑ Jag har F-skattsedel                                     │
│  ☑ Jag är momsregistrerad                                   │
│                                                             │
│  Momsnummer                                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ SE199001011234                                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ───────────────────────────────────────────────────────── │
│                                                             │
│  SKATTEBERÄKNING                                            │
│                                                             │
│  Kommunalskattesats                                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 31.5 %                               [Hitta min →] │   │
│  └─────────────────────────────────────────────────────┘   │
│  ⓘ Används för att beräkna ungefärlig inkomstskatt         │
│                                                             │
│  ───────────────────────────────────────────────────────── │
│                                                             │
│  FAKTURAINSTÄLLNINGAR                                       │
│                                                             │
│  Betalningsvillkor (dagar)                                  │
│  ┌────────┐                                                │
│  │ 30     │                                                │
│  └────────┘                                                │
│                                                             │
│  ───────────────────────────────────────────────────────── │
│                                                             │
│  BANKUPPGIFTER (visas på fakturor)                          │
│                                                             │
│  Bank              Clearingnummer    Kontonummer            │
│  ┌──────────┐     ┌──────────┐      ┌──────────────────┐  │
│  │ Nordea   │     │ 3300     │      │ 123 456 789      │  │
│  └──────────┘     └──────────┘      └──────────────────┘  │
│                                                             │
│  ───────────────────────────────────────────────────────── │
│                                                             │
│  KOPPLAD BANK                                               │
│                                                             │
│  ✓ Nordea ****4567                   [Koppla bort]         │
│    Senast synkad: idag 08:15                               │
│                                                             │
│                             [Spara ändringar]               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Component Library

Use shadcn/ui as base. Key components needed:

### Core
- Button (primary, secondary, ghost, destructive)
- Input (text, number, date)
- Select (with search)
- Checkbox
- Card
- Badge
- Dialog / Sheet (slide-over)
- Toast (notifications)

### Custom
- SwipeCard (gesture-based)
- MoneyDisplay (formatted SEK/EUR with color)
- StatusBadge (invoice/transaction status)
- PercentageBar (disponibelt visualization)
- DatePicker (Swedish locale)

---

## Responsive Behavior

| Breakpoint | Layout |
|------------|--------|
| < 640px (mobile) | Single column, bottom nav, swipe UI default |
| 640-1024px (tablet) | Two columns where appropriate |
| > 1024px (desktop) | Sidebar nav, multi-column dashboard |

Mobile is primary. All features must work on 375px width.

---

## Accessibility

- All interactive elements keyboard accessible
- ARIA labels for icons
- Color contrast AA minimum
- Focus indicators visible
- Screen reader tested
