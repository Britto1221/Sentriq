ALTER TABLE webauthn_credentials
  ADD COLUMN display_name text NOT NULL DEFAULT 'Passkey';

ALTER TABLE webauthn_credentials
  ADD CONSTRAINT credential_display_name
  CHECK (length(trim(display_name)) BETWEEN 1 AND 60);

INSERT INTO user_resources(id,tenant_id,application_id,user_id,kind,data)
SELECT 'passkey-' || id,tenant_id,application_id,user_id,'passkey',jsonb_build_object('credentialRecordId',id,'revoked',false)
FROM webauthn_credentials
ON CONFLICT (id) DO NOTHING;
