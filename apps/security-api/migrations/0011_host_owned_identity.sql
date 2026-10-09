-- Stop using email as an account key while preserving existing optional profile values.
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users RENAME COLUMN email_verified_at TO retired_email_verified_at;

-- Retire the old verification records without deleting persisted audit-adjacent state.
ALTER TABLE email_verification_transactions RENAME TO retired_email_verification_transactions;

CREATE TABLE passkey_enrollment_transactions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  application_id text NOT NULL,
  user_id text NOT NULL,
  token_digest text NOT NULL UNIQUE,
  state text NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  CONSTRAINT passkey_enrollment_application FOREIGN KEY (tenant_id,application_id)
    REFERENCES applications(tenant_id,id),
  CONSTRAINT passkey_enrollment_user FOREIGN KEY (tenant_id,application_id,user_id)
    REFERENCES users(tenant_id,application_id,id),
  CONSTRAINT passkey_enrollment_digest CHECK (token_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT passkey_enrollment_state CHECK (state IN ('PENDING','COMPLETED','EXPIRED','CANCELLED')),
  CONSTRAINT passkey_enrollment_expiry CHECK (expires_at>created_at),
  CONSTRAINT passkey_enrollment_completed CHECK ((state='COMPLETED') = (completed_at IS NOT NULL))
);
CREATE INDEX passkey_enrollment_expiry_idx ON passkey_enrollment_transactions(expires_at)
  WHERE state='PENDING';

ALTER TABLE device_link_requests RENAME COLUMN email_digest TO account_digest;
ALTER TABLE device_link_requests RENAME CONSTRAINT device_link_email_digest TO device_link_account_digest;
