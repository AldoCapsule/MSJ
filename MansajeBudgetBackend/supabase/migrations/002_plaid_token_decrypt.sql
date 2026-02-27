-- 002_plaid_token_decrypt.sql
-- Server-side function to decrypt Plaid access tokens
-- Key is read from DB config var 'app.plaid_key' (never passed as SQL argument)
-- Set the key via: ALTER DATABASE postgres SET app.plaid_key = 'your-secret';
-- Security definer + locked search_path prevents search-path hijacking

create or replace function get_plaid_token(p_connection_id uuid)
returns text
language sql
security definer
set search_path = public
as $$
  select pgp_sym_decrypt(
    access_token_encrypted::bytea,
    current_setting('app.plaid_key')
  )
  from plaid_tokens
  where connection_id = p_connection_id;
$$;

-- Revoke from all client roles — only service_role (supabaseAdmin) can call this
revoke execute on function get_plaid_token(uuid) from public, anon, authenticated;
