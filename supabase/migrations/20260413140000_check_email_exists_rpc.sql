-- Efficient email existence check for invite flow.
-- Replaces the previous approach of listing all auth users (which only
-- returned the first page and broke for instances with >50 users).
CREATE OR REPLACE FUNCTION public.check_email_exists(email_to_check text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users WHERE lower(email) = lower(email_to_check)
  );
$$;

-- Only callable by service role — prevents email enumeration via PostgREST.
REVOKE EXECUTE ON FUNCTION public.check_email_exists(text) FROM anon, authenticated;
