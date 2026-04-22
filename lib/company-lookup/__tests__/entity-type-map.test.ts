import { describe, it, expect } from 'vitest'
import { mapEntityType } from '../entity-type-map'

describe('mapEntityType', () => {
  it('maps canonical AB codes and labels to aktiebolag', () => {
    expect(mapEntityType('AB')).toBe('aktiebolag')
    expect(mapEntityType('ab')).toBe('aktiebolag')
    expect(mapEntityType('Aktiebolag')).toBe('aktiebolag')
    expect(mapEntityType('Publikt aktiebolag')).toBe('aktiebolag')
  })

  it('maps canonical EF codes and labels to enskild_firma', () => {
    expect(mapEntityType('EF')).toBe('enskild_firma')
    expect(mapEntityType('ef')).toBe('enskild_firma')
    expect(mapEntityType('Enskild firma')).toBe('enskild_firma')
    expect(mapEntityType('Enskild näringsidkare')).toBe('enskild_firma')
  })

  it('returns null for unsupported entity types', () => {
    expect(mapEntityType('HB')).toBeNull()
    expect(mapEntityType('Handelsbolag')).toBeNull()
    expect(mapEntityType('KB')).toBeNull()
    expect(mapEntityType('Kommanditbolag')).toBeNull()
    expect(mapEntityType('Stiftelse')).toBeNull()
    expect(mapEntityType('Ekonomisk förening')).toBeNull()
    expect(mapEntityType('Bostadsrättsförening')).toBeNull()
  })

  it('returns null for empty or nullish input', () => {
    expect(mapEntityType('')).toBeNull()
    expect(mapEntityType(null)).toBeNull()
    expect(mapEntityType(undefined)).toBeNull()
  })
})
