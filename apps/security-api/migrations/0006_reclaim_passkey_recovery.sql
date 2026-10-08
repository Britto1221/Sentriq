ALTER TABLE webauthn_challenges DROP CONSTRAINT webauthn_challenges_purpose_check;
ALTER TABLE webauthn_challenges ADD CONSTRAINT challenge_purpose
  CHECK (purpose IN ('registration','authentication','step_up','recovery_registration'));
ALTER TABLE webauthn_challenges ADD CONSTRAINT recovery_registration_context
  CHECK (purpose != 'recovery_registration' OR (user_id IS NOT NULL AND session_id IS NULL AND action_id IS NULL AND resource_id IS NULL));

ALTER TABLE recovery_codes ADD CONSTRAINT recovery_code_identity UNIQUE (tenant_id,application_id,user_id,id);

CREATE TABLE reclaim_transactions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  application_id text NOT NULL,
  user_id text,
  account_digest text NOT NULL,
  token_digest text NOT NULL UNIQUE,
  recovery_code_id text,
  state text NOT NULL DEFAULT 'NOT_STARTED',
  failed_attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  CONSTRAINT reclaim_application FOREIGN KEY (tenant_id,application_id)
    REFERENCES applications(tenant_id,id),
  CONSTRAINT reclaim_user FOREIGN KEY (tenant_id,application_id,user_id)
    REFERENCES users(tenant_id,application_id,id),
  CONSTRAINT reclaim_code FOREIGN KEY (tenant_id,application_id,user_id,recovery_code_id)
    REFERENCES recovery_codes(tenant_id,application_id,user_id,id),
  CONSTRAINT reclaim_account_digest CHECK (account_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT reclaim_token_digest CHECK (token_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT reclaim_state CHECK (state IN ('NOT_STARTED','CODE_VERIFIED','ENROLLMENT_PENDING','COMPLETED','EXPIRED','CANCELLED')),
  CONSTRAINT reclaim_failed_attempts CHECK (failed_attempts BETWEEN 0 AND 5),
  CONSTRAINT reclaim_expiry CHECK (expires_at > created_at),
  CONSTRAINT reclaim_code_state CHECK (state NOT IN ('CODE_VERIFIED','ENROLLMENT_PENDING','COMPLETED') OR (user_id IS NOT NULL AND recovery_code_id IS NOT NULL)),
  CONSTRAINT reclaim_code_reference CHECK (state != 'NOT_STARTED' OR recovery_code_id IS NULL),
  CONSTRAINT reclaim_completion CHECK ((state = 'COMPLETED') = (completed_at IS NOT NULL))
);

CREATE INDEX reclaim_transactions_expiry_idx ON reclaim_transactions(expires_at)
  WHERE state IN ('NOT_STARTED','CODE_VERIFIED','ENROLLMENT_PENDING');
CREATE INDEX reclaim_transactions_user_idx ON reclaim_transactions(tenant_id,application_id,user_id,created_at)
  WHERE user_id IS NOT NULL;
