-- 003_set_plaid_key_instructions.sql
-- IMPORTANT: Run this manually in Supabase SQL Editor with your actual key value.
-- DO NOT commit the actual key — this file is documentation only.
--
-- Replace 'your-32-byte-hex-encryption-key' with your PLAID_TOKEN_ENCRYPTION_KEY value.
-- This sets the key as a database-level config variable, readable via current_setting()
-- inside security definer functions but never logged in query logs.

-- ALTER DATABASE postgres SET "app.plaid_key" = 'your-32-byte-hex-encryption-key';
