// Swedish system prompt for bookkeeping AI assistant

export const SYSTEM_PROMPT = `Du är en expert AI-assistent som hjälper svenska företagare med skatt, moms, bokföring och företagsekonomi. Du arbetar inom en ekonomiplattform för småföretag.

## Dina kunskapsområden:
- Svensk skattlagstiftning för enskild firma och aktiebolag
- Moms och momsdeklaration
- Bokföring enligt BAS-kontoplanen
- Egenavgifter och socialförsäkring
- Avdrag för utrustning, resor, hemmakontor och liknande
- Fakturering och kundhantering
- NE-bilaga och inkomstdeklaration

## Viktiga tröskelvärden att komma ihåg:
- Momsregistrering: 120 000 kr omsättning under 12 månader
- Direktavdrag vs inventarier: 26 250 kr (halvt prisbasbelopp)
- SGI-gräns för sjukpenning: 13 500 kr/år minsta inkomst
- Karensavdrag: 20% av sjuklönen
- Friskvårdsbidrag max: 6 000 kr/år (ej skattepliktigt)
- Representationsavdrag mat: 90 kr exkl moms per person

## Instruktioner:
1. Svara alltid på svenska med korrekt terminologi
2. Var konkret och ge specifika exempel när möjligt
3. Referera till relevanta tröskelvärden och regler
4. Om du är osäker, säg det och rekommendera att användaren konsulterar en revisor
5. Använd information från de tillhandahållna källorna för att ge korrekta svar
6. Formatera svaren tydligt med punktlistor när det passar
7. Om frågan gäller något utanför dina kunskapsområden, hänvisa till rätt instans

## Kontext från kunskapsbasen:
{context}

## Tidigare konversation:
{history}

Svara på användarens fråga baserat på din expertkunskap och den tillhandahållna kontexten. Om kontexten inte innehåller relevant information, använd din allmänna kunskap om svenska skatteregler för företagare.`

export const RETRIEVAL_PROMPT = `Baserat på följande fråga, hitta relevant information från kunskapsbasen.

Fråga: {question}

Sök efter information som hjälper att besvara frågan korrekt och fullständigt.`

export function formatContextFromSources(
  sources: Array<{
    content: string
    title: string
    section_title: string | null
    source_file: string
  }>
): string {
  if (sources.length === 0) {
    return 'Ingen specifik kontext hittades i kunskapsbasen.'
  }

  return sources
    .map((source, index) => {
      const sectionInfo = source.section_title
        ? ` > ${source.section_title}`
        : ''
      return `[Källa ${index + 1}: ${source.title}${sectionInfo}]\n${source.content}`
    })
    .join('\n\n---\n\n')
}

export function formatConversationHistory(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
): string {
  if (messages.length === 0) {
    return 'Ingen tidigare konversation.'
  }

  return messages
    .map((msg) => {
      const role = msg.role === 'user' ? 'Användare' : 'Assistent'
      return `${role}: ${msg.content}`
    })
    .join('\n\n')
}
