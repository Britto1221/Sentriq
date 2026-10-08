ALTER TABLE users ADD COLUMN passkey_enrollment_required boolean NOT NULL DEFAULT false;
ALTER TABLE webauthn_challenges ADD COLUMN expected_origin text;
ALTER TABLE webauthn_challenges ADD COLUMN expected_rp_id text;
