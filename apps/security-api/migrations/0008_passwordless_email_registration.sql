ALTER TABLE users ADD COLUMN email_verified_at timestamptz;
ALTER TABLE webauthn_challenges ADD COLUMN account_digest text;
ALTER TABLE webauthn_challenges ADD CONSTRAINT challenge_account_digest
  CHECK (account_digest IS NULL OR account_digest ~ '^[a-f0-9]{64}$');

CREATE TABLE email_verification_transactions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  application_id text NOT NULL,
  user_id text,
  email text NOT NULL,
  account_digest text NOT NULL,
  verification_digest text NOT NULL,
  registration_digest text NOT NULL UNIQUE,
  state text NOT NULL DEFAULT 'PENDING',
  failed_attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  verified_at timestamptz,
  completed_at timestamptz,
  CONSTRAINT email_verification_application FOREIGN KEY (tenant_id,application_id)
    REFERENCES applications(tenant_id,id),
  CONSTRAINT email_verification_user FOREIGN KEY (tenant_id,application_id,user_id)
    REFERENCES users(tenant_id,application_id,id),
  CONSTRAINT email_verification_email CHECK (email=lower(trim(email)) AND length(email) BETWEEN 3 AND 254),
  CONSTRAINT email_verification_account_digest CHECK (account_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT email_verification_code_digest CHECK (verification_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT email_verification_registration_digest CHECK (registration_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT email_verification_state CHECK (state IN ('PENDING','VERIFIED','COMPLETED','EXPIRED','CANCELLED')),
  CONSTRAINT email_verification_attempts CHECK (failed_attempts BETWEEN 0 AND 5),
  CONSTRAINT email_verification_expiry CHECK (expires_at>created_at),
  CONSTRAINT email_verification_verified CHECK ((state IN ('VERIFIED','COMPLETED')) = (verified_at IS NOT NULL)),
  CONSTRAINT email_verification_completed CHECK ((state='COMPLETED') = (completed_at IS NOT NULL))
);
CREATE UNIQUE INDEX email_verification_active_email_idx
  ON email_verification_transactions(tenant_id,application_id,email)
  WHERE state IN ('PENDING','VERIFIED');
CREATE INDEX email_verification_expiry_idx ON email_verification_transactions(expires_at)
  WHERE state IN ('PENDING','VERIFIED');

-- Keep legacy hashes intact but unreachable while avoiding data loss during upgrade.
ALTER TABLE password_credentials RENAME TO retired_password_credentials;
