-- 004_store_plaid_token.sql
-- Encrypts and stores a Plaid access token
-- Called by service_role only

create or replace function store_plaid_token(
  p_connection_id uuid,
  p_user_id uuid,
  p_token text
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into plaid_tokens (connection_id, user_id, access_token_encrypted)
  values (
    p_connection_id,
    p_user_id,
    pgp_sym_encrypt(p_token, current_setting('app.plaid_key'))
  )
  on conflict (connection_id) do update
    set access_token_encrypted = pgp_sym_encrypt(p_token, current_setting('app.plaid_key'));
$$;

revoke execute on function store_plaid_token(uuid, uuid, text) from public, anon, authenticated;
