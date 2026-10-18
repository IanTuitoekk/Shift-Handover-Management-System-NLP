-- Sign in with Google. Safe to run more than once.
-- google_sub: Google's stable account id ("sub" claim), set on first Google sign-in or when an
--   existing account confirms its password to link. Cleared when an account is anonymised.
-- password_hash becomes optional: accounts created through Google have no password until the
--   person sets one with "Forgot password?".
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub VARCHAR(255);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub) WHERE google_sub IS NOT NULL;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
