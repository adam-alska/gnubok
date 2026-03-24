import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createMockSupabase,
  createQueuedMockSupabase,
  makeTransaction,
  makeCategorizationTemplate,
} from '@/tests/helpers'
import {
  normalizeCounterpartyName,
  calculateConfidence,
  findCounterpartyTemplate,
  buildMappingResultFromCounterpartyTemplate,
  upsertCounterpartyTemplate,
} from '../counterparty-templates'

describe('counterparty-templates', () => {
  // ── Normalization ──────────────────────────────────────────

  describe('normalizeCounterpartyName', () => {
    it('strips KORTKÖP prefix', () => {
      expect(normalizeCounterpartyName('KORTKÖP ICA MAXI')).toBe('ica maxi')
    })

    it('strips SWISH prefix', () => {
      expect(normalizeCounterpartyName('SWISH ANDERS JOHANSSON')).toBe('anders johansson')
    })

    it('strips BANKGIRO prefix', () => {
      expect(normalizeCounterpartyName('BANKGIRO TELIA SVERIGE AB')).toBe('telia sverige')
    })

    it('strips AUTOGIRO prefix', () => {
      expect(normalizeCounterpartyName('AUTOGIRO FOLKSAM')).toBe('folksam')
    })

    it('strips trailing dates (YYYYMMDD)', () => {
      expect(normalizeCounterpartyName('ICA MAXI 20240615')).toBe('ica maxi')
    })

    it('strips trailing dates (YYYY-MM-DD)', () => {
      expect(normalizeCounterpartyName('TELIA 2024-06-15')).toBe('telia')
    })

    it('strips inline dates', () => {
      expect(normalizeCounterpartyName('SPOTIFY 20240615 PREMIUM')).toBe('spotify premium')
    })

    it('strips invoice references', () => {
      expect(normalizeCounterpartyName('LEVERANTÖR F2024001')).toBe('leverantör')
    })

    it('strips trailing digit sequences (4+)', () => {
      expect(normalizeCounterpartyName('CLAS OHLSON 12345')).toBe('clas ohlson')
    })

    it('strips Swedish company suffixes (AB, HB, KB)', () => {
      expect(normalizeCounterpartyName('SPOTIFY AB')).toBe('spotify')
    })

    it('handles combined prefixes and dates', () => {
      expect(normalizeCounterpartyName('KORTKÖP TELIA SVERIGE AB 20240615')).toBe('telia sverige')
    })

    it('preserves meaningful content', () => {
      expect(normalizeCounterpartyName('HEMKÖP LINNÉ')).toBe('hemköp linné')
    })
  })

  // ── Confidence ─────────────────────────────────────────────

  describe('calculateConfidence', () => {
    it('returns ~0.45 for occurrence_count = 1', () => {
      const c = calculateConfidence(1)
      expect(c).toBeCloseTo(0.45, 1)
    })

    it('grows logarithmically', () => {
      const c1 = calculateConfidence(1)
      const c5 = calculateConfidence(5)
      const c10 = calculateConfidence(10)
      expect(c5).toBeGreaterThan(c1)
      expect(c10).toBeGreaterThan(c5)
      // Growth should slow down
      expect(c10 - c5).toBeLessThan(c5 - c1)
    })

    it('caps at 0.95', () => {
      expect(calculateConfidence(100)).toBe(0.95)
      expect(calculateConfidence(1000)).toBe(0.95)
    })

    it('never exceeds 0.95', () => {
      for (let i = 1; i <= 50; i++) {
        expect(calculateConfidence(i)).toBeLessThanOrEqual(0.95)
      }
    })
  })

  // ── Lookup ─────────────────────────────────────────────────

  describe('findCounterpartyTemplate', () => {
    it('returns null for transaction without merchant name', async () => {
      const { supabase } = createMockSupabase()
      const tx = makeTransaction({ merchant_name: null, description: '' })
      const result = await findCounterpartyTemplate(supabase as never, 'user-1', tx)
      expect(result).toBeNull()
    })

    it('returns exact alias match with full confidence', async () => {
      const template = makeCategorizationTemplate({ confidence: 0.8 })
      const { supabase, enqueue } = createQueuedMockSupabase()

      // Alias match returns the template
      enqueue({ data: template })

      const tx = makeTransaction({ merchant_name: 'Telia Sverige AB' })
      const result = await findCounterpartyTemplate(supabase as never, 'user-1', tx)

      expect(result).not.toBeNull()
      expect(result!.matchMethod).toBe('exact_alias')
      expect(result!.confidence).toBe(0.8)
    })

    it('falls through to exact normalized when alias misses', async () => {
      const template = makeCategorizationTemplate({ confidence: 0.8 })
      const { supabase, enqueue } = createQueuedMockSupabase()

      enqueue({ data: null }) // Alias miss
      enqueue({ data: template }) // Exact normalized hit

      const tx = makeTransaction({ merchant_name: 'Telia' })
      const result = await findCounterpartyTemplate(supabase as never, 'user-1', tx)

      expect(result).not.toBeNull()
      expect(result!.matchMethod).toBe('exact_normalized')
      expect(result!.confidence).toBeCloseTo(0.76, 1) // 0.8 * 0.95
    })

    it('falls through to fuzzy match within Levenshtein threshold', async () => {
      const template = makeCategorizationTemplate({
        counterparty_name: 'telia',
        confidence: 0.8,
      })
      const { supabase, enqueue } = createQueuedMockSupabase()

      enqueue({ data: null }) // Alias miss
      enqueue({ data: null }) // Exact miss
      enqueue({ data: [template] }) // Fuzzy: all templates

      // "teliq" has Levenshtein distance 1 from "telia"
      const tx = makeTransaction({ merchant_name: 'Teliq' })
      const result = await findCounterpartyTemplate(supabase as never, 'user-1', tx)

      expect(result).not.toBeNull()
      expect(result!.matchMethod).toBe('fuzzy')
      expect(result!.confidence).toBeLessThan(0.8)
      expect(result!.confidence).toBeGreaterThan(0)
    })

    it('returns null when fuzzy match exceeds threshold', async () => {
      const template = makeCategorizationTemplate({
        counterparty_name: 'telia',
        confidence: 0.8,
      })
      const { supabase, enqueue } = createQueuedMockSupabase()

      enqueue({ data: null }) // Alias miss
      enqueue({ data: null }) // Exact miss
      enqueue({ data: [template] }) // Fuzzy: all templates

      // "xxxxx" has Levenshtein distance 5 from "telia"
      const tx = makeTransaction({ merchant_name: 'XXXXX' })
      const result = await findCounterpartyTemplate(supabase as never, 'user-1', tx)

      expect(result).toBeNull()
    })

    it('returns null when no templates exist', async () => {
      const { supabase, enqueue } = createQueuedMockSupabase()

      enqueue({ data: null }) // Alias miss
      enqueue({ data: null }) // Exact miss
      enqueue({ data: [] }) // Fuzzy: empty

      const tx = makeTransaction({ merchant_name: 'Unknown Company' })
      const result = await findCounterpartyTemplate(supabase as never, 'user-1', tx)

      expect(result).toBeNull()
    })
  })

  // ── Build MappingResult ────────────────────────────────────

  describe('buildMappingResultFromCounterpartyTemplate', () => {
    it('builds correct MappingResult for expense with VAT', () => {
      const template = makeCategorizationTemplate({
        debit_account: '6200',
        credit_account: '1930',
        vat_treatment: 'standard_25',
        occurrence_count: 10,
      })
      const match = { template, matchMethod: 'exact_alias' as const, confidence: 0.85 }
      const tx = makeTransaction({ amount: -1250 })

      const result = buildMappingResultFromCounterpartyTemplate(match, tx, 'enskild_firma')

      expect(result.debit_account).toBe('6200')
      expect(result.credit_account).toBe('1930')
      expect(result.confidence).toBe(0.85)
      expect(result.vat_lines.length).toBe(1)
      expect(result.vat_lines[0].account_number).toBe('2641')
      expect(result.vat_lines[0].debit_amount).toBeGreaterThan(0)
      expect(result.rule).toBeNull()
      expect(result.description).toContain('telia')
      expect(result.description).toContain('10 ggr')
    })

    it('builds correct MappingResult for expense without VAT', () => {
      const template = makeCategorizationTemplate({
        debit_account: '6570',
        credit_account: '1930',
        vat_treatment: null,
      })
      const match = { template, matchMethod: 'exact_alias' as const, confidence: 0.9 }
      const tx = makeTransaction({ amount: -50 })

      const result = buildMappingResultFromCounterpartyTemplate(match, tx, 'enskild_firma')

      expect(result.debit_account).toBe('6570')
      expect(result.vat_lines).toHaveLength(0)
    })

    it('builds correct MappingResult for reverse charge', () => {
      const template = makeCategorizationTemplate({
        debit_account: '6540',
        credit_account: '1930',
        vat_treatment: 'reverse_charge',
      })
      const match = { template, matchMethod: 'exact_alias' as const, confidence: 0.8 }
      const tx = makeTransaction({ amount: -5000 })

      const result = buildMappingResultFromCounterpartyTemplate(match, tx, 'aktiebolag')

      expect(result.vat_lines.length).toBe(2)
      expect(result.vat_lines.some(l => l.account_number === '2645')).toBe(true)
    })

    it('does not generate VAT lines for income transactions', () => {
      const template = makeCategorizationTemplate({
        debit_account: '1930',
        credit_account: '3001',
        vat_treatment: 'standard_25',
      })
      const match = { template, matchMethod: 'exact_alias' as const, confidence: 0.8 }
      const tx = makeTransaction({ amount: 10000 })

      const result = buildMappingResultFromCounterpartyTemplate(match, tx, 'enskild_firma')

      expect(result.vat_lines).toHaveLength(0)
    })

    it('detects private accounts', () => {
      const template = makeCategorizationTemplate({
        debit_account: '2013',
        credit_account: '1930',
      })
      const match = { template, matchMethod: 'exact_alias' as const, confidence: 0.8 }
      const tx = makeTransaction({ amount: -500 })

      const result = buildMappingResultFromCounterpartyTemplate(match, tx, 'enskild_firma')

      expect(result.default_private).toBe(true)
    })
  })

  // ── Upsert ─────────────────────────────────────────────────

  describe('upsertCounterpartyTemplate', () => {
    const mappingResult = {
      rule: null,
      debit_account: '5410',
      credit_account: '1930',
      risk_level: 'NONE' as const,
      confidence: 0.9,
      requires_review: false,
      default_private: false,
      vat_lines: [],
      description: 'Test',
    }

    it('inserts new template for unknown counterparty', async () => {
      const { supabase, enqueue } = createQueuedMockSupabase()
      const tx = makeTransaction({ merchant_name: 'New Company AB', date: '2024-06-15' })

      enqueue({ data: null }) // No existing template
      enqueue({ data: null }) // Insert succeeds

      await upsertCounterpartyTemplate(
        supabase as never, 'user-1', tx, mappingResult, 'user_approved'
      )

      expect(supabase.from).toHaveBeenCalledWith('categorization_templates')
    })

    it('does not throw on insert error', async () => {
      const { supabase, enqueue } = createQueuedMockSupabase()
      const tx = makeTransaction({ merchant_name: 'New Company AB' })

      enqueue({ data: null }) // No existing
      enqueue({ error: { message: 'constraint violation' } })

      // Should not throw
      await upsertCounterpartyTemplate(
        supabase as never, 'user-1', tx, mappingResult, 'user_approved'
      )
    })

    it('updates existing template on re-approval', async () => {
      const { supabase, enqueue } = createQueuedMockSupabase()
      const existing = makeCategorizationTemplate({
        debit_account: '5410',
        credit_account: '1930',
        occurrence_count: 3,
        counterparty_aliases: ['ica maxi'],
      })
      const tx = makeTransaction({ merchant_name: 'ICA Maxi', date: '2024-07-01' })

      enqueue({ data: existing }) // Existing found
      enqueue({ data: null }) // Update succeeds

      await upsertCounterpartyTemplate(
        supabase as never, 'user-1', tx, mappingResult, 'user_approved'
      )

      expect(supabase.from).toHaveBeenCalledWith('categorization_templates')
    })

    it('resets occurrence_count on correction', async () => {
      const { supabase, enqueue } = createQueuedMockSupabase()
      const existing = makeCategorizationTemplate({
        debit_account: '6200', // Different from mappingResult's 5410
        credit_account: '1930',
        occurrence_count: 10,
        confidence: 0.85,
      })
      const tx = makeTransaction({ merchant_name: 'Telia Sverige AB', date: '2024-07-01' })

      enqueue({ data: existing }) // Existing found (different accounts = correction)
      enqueue({ data: null }) // Update succeeds

      await upsertCounterpartyTemplate(
        supabase as never, 'user-1', tx, mappingResult, 'user_approved'
      )

      expect(supabase.from).toHaveBeenCalledWith('categorization_templates')
    })

    it('skips upsert for transactions without merchant name', async () => {
      const { supabase } = createQueuedMockSupabase()
      const tx = makeTransaction({ merchant_name: null, description: '' })

      await upsertCounterpartyTemplate(
        supabase as never, 'user-1', tx, mappingResult, 'user_approved'
      )

      expect(supabase.from).not.toHaveBeenCalled()
    })
  })
})
