-- Financial Insights: AI-powered proactive alerts and KPI tracking
-- Migration: 20240101000028_financial_insights.sql

-- ============================================================
-- 0. Drop pre-existing tables with incomplete schemas (from earlier remote migrations)
-- ============================================================
DROP TABLE IF EXISTS public.ai_insights_cache CASCADE;
DROP TABLE IF EXISTS public.kpi_snapshots CASCADE;
DROP TABLE IF EXISTS public.cash_flow_forecasts CASCADE;
DROP TABLE IF EXISTS public.financial_insights CASCADE;

-- ============================================================
-- financial_insights table
-- ============================================================
create table if not exists public.financial_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  insight_type text not null check (insight_type in (
    'cash_flow_warning',
    'spending_anomaly',
    'tax_optimization',
    'revenue_trend',
    'overdue_alert',
    'seasonal_pattern',
    'savings_opportunity',
    'compliance_reminder'
  )),
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),

  title text not null,
  description text not null,
  action_text text,
  action_url text,

  data jsonb default '{}'::jsonb,

  is_read boolean not null default false,
  is_dismissed boolean not null default false,

  expires_at timestamptz,

  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_financial_insights_user_id on public.financial_insights(user_id);
create index if not exists idx_financial_insights_user_active on public.financial_insights(user_id, is_dismissed, is_read) where is_dismissed = false;
create index if not exists idx_financial_insights_type on public.financial_insights(user_id, insight_type);
create index if not exists idx_financial_insights_created on public.financial_insights(created_at desc);

-- RLS
alter table public.financial_insights enable row level security;

drop policy if exists "Users can view their own insights" on public.financial_insights;
create policy "Users can view their own insights"
  on public.financial_insights for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own insights" on public.financial_insights;
create policy "Users can insert their own insights"
  on public.financial_insights for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own insights" on public.financial_insights;
create policy "Users can update their own insights"
  on public.financial_insights for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own insights" on public.financial_insights;
create policy "Users can delete their own insights"
  on public.financial_insights for delete
  using (auth.uid() = user_id);

-- Service role bypass for cron jobs
drop policy if exists "Service role can manage all insights" on public.financial_insights;
create policy "Service role can manage all insights"
  on public.financial_insights for all
  using (auth.role() = 'service_role');

-- ============================================================
-- cash_flow_forecasts table
-- ============================================================
create table if not exists public.cash_flow_forecasts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  forecast_date date not null,
  forecast_type text not null default 'daily' check (forecast_type in ('daily', 'weekly', 'monthly')),

  opening_balance numeric not null default 0,
  expected_income numeric not null default 0,
  expected_expenses numeric not null default 0,
  projected_balance numeric not null default 0,

  confidence_level numeric not null default 0.5 check (confidence_level >= 0 and confidence_level <= 1),

  income_items jsonb default '[]'::jsonb,
  expense_items jsonb default '[]'::jsonb,

  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_cash_flow_forecasts_user_id on public.cash_flow_forecasts(user_id);
create index if not exists idx_cash_flow_forecasts_user_date on public.cash_flow_forecasts(user_id, forecast_date);
create index if not exists idx_cash_flow_forecasts_created on public.cash_flow_forecasts(created_at desc);

-- RLS
alter table public.cash_flow_forecasts enable row level security;

drop policy if exists "Users can view their own forecasts" on public.cash_flow_forecasts;
create policy "Users can view their own forecasts"
  on public.cash_flow_forecasts for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own forecasts" on public.cash_flow_forecasts;
create policy "Users can insert their own forecasts"
  on public.cash_flow_forecasts for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own forecasts" on public.cash_flow_forecasts;
create policy "Users can update their own forecasts"
  on public.cash_flow_forecasts for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own forecasts" on public.cash_flow_forecasts;
create policy "Users can delete their own forecasts"
  on public.cash_flow_forecasts for delete
  using (auth.uid() = user_id);

drop policy if exists "Service role can manage all forecasts" on public.cash_flow_forecasts;
create policy "Service role can manage all forecasts"
  on public.cash_flow_forecasts for all
  using (auth.role() = 'service_role');

-- ============================================================
-- kpi_snapshots table
-- ============================================================
create table if not exists public.kpi_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  snapshot_date date not null,
  period_type text not null default 'daily' check (period_type in ('daily', 'weekly', 'monthly')),

  -- Income metrics
  revenue numeric not null default 0,
  expenses numeric not null default 0,
  net_income numeric not null default 0,

  -- Margin metrics
  gross_margin_pct numeric default 0,
  operating_margin_pct numeric default 0,

  -- Balance sheet proxies
  accounts_receivable numeric not null default 0,
  accounts_payable numeric not null default 0,
  cash_balance numeric not null default 0,

  -- Invoice metrics
  invoice_count integer not null default 0,
  average_invoice_value numeric not null default 0,

  -- Efficiency metrics
  days_sales_outstanding numeric default 0,

  -- Liquidity ratios
  current_ratio numeric default 0,
  quick_ratio numeric default 0,

  -- Growth / burn metrics
  burn_rate numeric default 0,
  runway_months numeric default 0,

  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_kpi_snapshots_user_id on public.kpi_snapshots(user_id);
create index if not exists idx_kpi_snapshots_user_date on public.kpi_snapshots(user_id, snapshot_date desc);
create index if not exists idx_kpi_snapshots_user_period on public.kpi_snapshots(user_id, period_type, snapshot_date desc);

-- Unique constraint to prevent duplicate snapshots per day
create unique index if not exists idx_kpi_snapshots_unique on public.kpi_snapshots(user_id, snapshot_date, period_type);

-- RLS
alter table public.kpi_snapshots enable row level security;

drop policy if exists "Users can view their own snapshots" on public.kpi_snapshots;
create policy "Users can view their own snapshots"
  on public.kpi_snapshots for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own snapshots" on public.kpi_snapshots;
create policy "Users can insert their own snapshots"
  on public.kpi_snapshots for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own snapshots" on public.kpi_snapshots;
create policy "Users can update their own snapshots"
  on public.kpi_snapshots for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own snapshots" on public.kpi_snapshots;
create policy "Users can delete their own snapshots"
  on public.kpi_snapshots for delete
  using (auth.uid() = user_id);

drop policy if exists "Service role can manage all snapshots" on public.kpi_snapshots;
create policy "Service role can manage all snapshots"
  on public.kpi_snapshots for all
  using (auth.role() = 'service_role');

-- ============================================================
-- ai_insights_cache table (for caching AI advice)
-- ============================================================
create table if not exists public.ai_insights_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  prompt_hash text not null,
  response text not null,
  model text not null default 'claude-sonnet-4-20250514',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create index if not exists idx_ai_insights_cache_user on public.ai_insights_cache(user_id, prompt_hash);
create index if not exists idx_ai_insights_cache_expires on public.ai_insights_cache(expires_at);

alter table public.ai_insights_cache enable row level security;

drop policy if exists "Users can view their own AI cache" on public.ai_insights_cache;
create policy "Users can view their own AI cache"
  on public.ai_insights_cache for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own AI cache" on public.ai_insights_cache;
create policy "Users can insert their own AI cache"
  on public.ai_insights_cache for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own AI cache" on public.ai_insights_cache;
create policy "Users can delete their own AI cache"
  on public.ai_insights_cache for delete
  using (auth.uid() = user_id);

drop policy if exists "Service role can manage all AI cache" on public.ai_insights_cache;
create policy "Service role can manage all AI cache"
  on public.ai_insights_cache for all
  using (auth.role() = 'service_role');
