-- Migration 034: Fix extension_data updated_at trigger
-- The original trigger references update_updated_at() which does not exist.
-- The correct function is public.update_updated_at_column().
-- Wrapped in DO block in case extension_data table does not yet exist.

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'extension_data'
  ) then
    drop trigger if exists extension_data_updated_at on public.extension_data;

    create trigger extension_data_updated_at
      before update on public.extension_data
      for each row execute function public.update_updated_at_column();
  end if;
end;
$$;
