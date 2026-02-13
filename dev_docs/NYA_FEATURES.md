. Media Kit-generator
Standardverktyg i creator-ekonomin 2025, men inget svenskt verktyg erbjuder det. Kreatörer bygger idag media kits manuellt i Canva.
Implementation: Dra in analytics från Instagram, TikTok, YouTube via API. Generera professionell PDF med demografi, engagemangsgrad, tidigare samarbeten. Inkludera prisförslag baserat på följarantal och engagemang. Automatisk uppdatering kvartalsvis.
Svårighetsgrad: Medel. API-integrationer finns redan delvis i din app.
3. Avtalsmallar och e-signering
Creator-specifika avtal saknas helt på den svenska marknaden. Verktyg som CreatorIQ, RosterGrid och HoneyBook erbjuder detta internationellt. Svenska kreatörer använder inga avtal alls eller kopierar generiska mallar.
Implementation: Mallbibliotek anpassat för svenska influencersamarbeten: leveranser, betalningsvillkor, contenträttigheter, exklusivitet, bytesaffärer. Integrera e-signering (BankID om möjligt). Lagra i kampanjhanteringssystemet.
Svårighetsgrad: Medel. Juridisk granskning krävs men templaten är straightforward.
4. Automatiserade betalningspåminnelser och inkasso-workflow
Ingen kreatör vill jaga betalningar. Det är det näst vanligaste klagomålet efter sena betalningar överhuvudtaget.
Implementation: Automatiska påminnelser vid 15, 30 och 45 dagar. Eskaleringsflöde. Professionell inkassokommunikation. Eventuellt kopplad till fakturafinaliseringen ovan.
Svårighetsgrad: Låg. Primärt e-post/SMS-automation.
5. Multi-currency rate cards och prisriktlinjer
Kreatörer, särskilt nya, underprissätter sig systematiskt. Internationella plattformar erbjuder pricing benchmarks.
Implementation: Föreslå priser baserat på följarantal, engagemang, plattform, nisch. Svenska branschriktlinjer. Visa vad liknande kreatörer tar betalt. Integrera med faktureringsflödet.
Svårighetsgrad: Låg-medel. Datainsamling är huvudutmaningen.

Features att FÖRBÄTTRA
1. AI-assistent: Scenariospecifik, inte generisk
Din kunskapsbas med 30+ scenarion är en stark grund. Men assistenten behöver bli proaktiv, inte reaktiv.
Förbättring: "Du har 3 obetalda fakturor äldre än 30 dagar." "Din barter-deal med X saknar värdering, jag behöver marknadsvärdet." "Du har inte deklarerat periodisk sammanställning för Q3." Assistenten ska agera som en digital revisor som håller koll, inte som en FAQ.
2. Bokföring: "Creator Mode" som default
BAS-kontoplanen är korrekt men onödig för 90% av målgruppen. De behöver inte se konto 2641.
Förbättring: Förenklad vy med creator-kategorier: "Plattformsintäkter", "Samarbeten", "Barter", "Resor", "Utrustning". Full BAS i bakgrunden för SIE-export. Automatisk kategorisering via AI. En-klicks-avstämning för vanliga transaktioner.
3. Bankintegration: Automatisk matchning
PSD2-synk och swipe-kategorisering finns. Saknas: automatisk matchning av banktransaktioner mot fakturor. Flagga transaktioner som kan vara oredovisade intäkter. Kassaflödesprognos baserad på betalningshistorik.
4. Gåvo-/produktspårning: Fullständig skattehantering
Nuvarande feature finns men behöver utökas: automatisk beräkning av marknadsvärde för skatt, spåra om produkt behålls/returneras/ges bort/används som arbetsredskap, generera dokumentation mot Skatteverket, varning när en produkt blir en skattepliktig händelse. Skatteverket granskar influencersektorn aktivt. Det här är compliance-kritiskt.
5. Kampanjhantering: Content-workflow
Lägg till content approval-flöden, varumärkesportal där kunder kan granska leveranser, automatisk spårning av publiceringsschema, prestandamätning per kampanj (räckvidd, engagemang, konverteringar).

Features att ÖVERVÄGA (lägre prioritet)
Affiliate-integration: Många kreatörer tjänar via Adtraction, Awin, Amazon Associates. Auto-import av provisionsdata och skatterapportering. Relevant men inte brådskande.
Kvittomatchning: OCR finns. Lägg till automatisk matchning av kvitto mot banktransaktion. Minskar dubbelinmatning.
Team-access: Kreatörer som skalar anställer assistenter. Begränsade roller (bokförare, assistent, revisor) med auditlogg.

Features att IFRÅGASÄTTA
Fullständigt bokföringsmodulen
De flesta kreatörer behöver inte fullständig BAS-bokföring och kommer ändå outsourca till revisor. Överväg att göra "Exportera till revisor"-paket till huvudflödet och behålla förenklat läge som default. Den avancerade vyn blir opt-in, inte standard.
Kalender som fristående feature
Deadlines är viktiga men kan duplicera verktyg kreatören redan använder. Om användningen är låg, integrera med Google Calendar istället och ta bort egen kalendervy. Deadlines och påminnelser kan leva i appen utan att vara en separat sektion.