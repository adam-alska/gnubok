import {
  SECTORS,
  getSector,
  getExtensionDefinition,
  getAllExtensions,
  getExtensionsBySector,
} from '../sectors'

describe('sectors registry', () => {
  it('should have 6 sectors', () => {
    expect(SECTORS.length).toBe(6)
  })

  it('should have 17 total extensions', () => {
    expect(getAllExtensions().length).toBe(17)
  })

  it('should have unique slugs within each sector', () => {
    for (const sector of SECTORS) {
      const slugs = sector.extensions.map(e => e.slug)
      const uniqueSlugs = new Set(slugs)
      expect(uniqueSlugs.size).toBe(slugs.length)
    }
  })

  it('should have at least one extension per sector', () => {
    for (const sector of SECTORS) {
      expect(sector.extensions.length).toBeGreaterThan(0)
    }
  })

  it('getSector returns correct sector', () => {
    const sector = getSector('restaurant')
    expect(sector).toBeDefined()
    expect(sector!.slug).toBe('restaurant')
    expect(sector!.name).toBe('Restaurang & Café')
  })

  it('getSector returns undefined for unknown slug', () => {
    const sector = getSector('invalid' as any)
    expect(sector).toBeUndefined()
  })

  it('getExtensionDefinition returns correct extension', () => {
    const ext = getExtensionDefinition('restaurant', 'food-cost')
    expect(ext).toBeDefined()
    expect(ext!.slug).toBe('food-cost')
    expect(ext!.name).toBe('Food Cost %')
    expect(ext!.sector).toBe('restaurant')
  })

  it('getExtensionDefinition returns undefined for unknown extension', () => {
    const ext = getExtensionDefinition('restaurant', 'nonexistent')
    expect(ext).toBeUndefined()
  })

  it('getExtensionsBySector returns extensions for a sector', () => {
    const extensions = getExtensionsBySector('restaurant')
    expect(extensions.length).toBe(4)
  })

  it('all extensions have required fields', () => {
    for (const ext of getAllExtensions()) {
      expect(ext.slug).toBeTruthy()
      expect(ext.name).toBeTruthy()
      expect(ext.sector).toBeTruthy()
      expect(ext.category).toBeTruthy()
      expect(ext.description).toBeTruthy()
      expect(ext.longDescription).toBeTruthy()
      expect(ext.icon).toBeTruthy()
      expect(ext.dataPattern).toBeTruthy()
    }
  })
})
