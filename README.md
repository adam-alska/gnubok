# erp-base

Swedish accounting SaaS for sole traders (enskild firma) and limited companies (aktiebolag). Implements double-entry bookkeeping compliant with Swedish accounting law (Bokforingslagen), including VAT handling, tax reporting, and 7-year document retention.

## Tech Stack

- **Framework**: Next.js 16 (App Router), React 19, TypeScript (strict)
- **Database**: Supabase (PostgreSQL + RLS + magic link auth)
- **Styling**: Tailwind CSS 4 + shadcn/ui
- **Hosting**: Vercel
- **Integrations**: Enable Banking (PSD2), Anthropic SDK, OpenAI (embeddings), Resend (email), web-push (VAPID)

## Getting Started

```bash
npm install
npm run dev
```

## Commands

```bash
npm run dev          # Start development server
npm run build        # Production build
npm run lint         # ESLint
npm test             # Run all Vitest tests
```

## Documentation

See `CLAUDE.md` for comprehensive project documentation including architecture, bookkeeping engine, extension development, and database conventions.
