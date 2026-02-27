-- 002_plaid_token_decrypt.sql
-- Server-side function to decrypt Plaid access tokens
-- Security definer: runs as the function owner (bypasses RLS)
-- Called only by the Node.js backend via supabaseAdmin.rpc()

create or replace function get_plaid_token(p_connection_id uuid, p_key text)
returns text
language sql
security definer
as $$
  select pgp_sym_decrypt(access_token_encrypted::bytea, p_key)
  from plaid_tokens
  where connection_id = p_connection_id;
$$;

-- Revoke public execute — only service_role can call this
revoke execute on function get_plaid_token(uuid, text) from public;
