#!/usr/bin/env npx tsx
/**
 * Seed script for 2026 Swedish tax table data.
 *
 * Usage:
 *   npx tsx scripts/seed-tax-tables-2026.ts
 *
 * This generates the SQL and writes it to stdout.
 * Pipe to a file or apply directly via supabase CLI.
 *
 * For production: replace generated data with actual Skatteverket data
 * from their annual XLSX/TXT publication.
 */

import { generateTaxTableSQL } from '../lib/salary/tax-table-seed'

const sql = generateTaxTableSQL(2026)
console.log('-- Generated tax table seed data for 2026')
console.log('-- Tables 29-42, columns 1-6, brackets 0-150,000 SEK/month')
console.log('-- Replace with actual Skatteverket data for production use')
console.log('')
console.log(sql)
