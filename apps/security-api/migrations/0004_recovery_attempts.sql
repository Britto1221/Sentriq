ALTER TABLE recovery_attempts ADD COLUMN attempt_digest text UNIQUE;
ALTER TABLE recovery_attempts ADD COLUMN expires_at timestamptz;
ALTER TABLE recovery_attempts ADD COLUMN consumed_at timestamptz;
ALTER TABLE recovery_attempts ADD CONSTRAINT recovery_attempt_digest CHECK (attempt_digest ~ '^[a-f0-9]{64}$');
ALTER TABLE recovery_attempts ADD CONSTRAINT recovery_attempt_expiry CHECK (expires_at > occurred_at);
ALTER TABLE recovery_attempts ADD CONSTRAINT recovery_attempt_context CHECK ((attempt_digest IS NULL) = (expires_at IS NULL));
ALTER TABLE recovery_attempts ADD CONSTRAINT recovery_attempt_consumption CHECK (consumed_at IS NULL OR attempt_digest IS NOT NULL);
CREATE INDEX recovery_attempts_expiry_idx ON recovery_attempts(expires_at) WHERE consumed_at IS NULL AND attempt_digest IS NOT NULL;
