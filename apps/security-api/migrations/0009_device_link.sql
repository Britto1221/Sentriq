CREATE TABLE device_link_requests (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  application_id text NOT NULL,
  user_id text,
  email_digest text NOT NULL,
  token_digest text NOT NULL UNIQUE,
  comparison_code text NOT NULL,
  state text NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  approved_at timestamptz,
  approval_session_id text,
  approval_challenge_id text,
  approval_challenge text,
  approval_expected_origin text,
  approval_expected_rp_id text,
  approval_expires_at timestamptz,
  registration_challenge_id text,
  registration_challenge text,
  registration_expected_origin text,
  registration_expected_rp_id text,
  registration_expires_at timestamptz,
  completed_at timestamptz,
  CONSTRAINT device_link_application FOREIGN KEY (tenant_id,application_id)
    REFERENCES applications(tenant_id,id),
  CONSTRAINT device_link_user FOREIGN KEY (tenant_id,application_id,user_id)
    REFERENCES users(tenant_id,application_id,id),
  CONSTRAINT device_link_approver_session FOREIGN KEY (tenant_id,application_id,user_id,approval_session_id)
    REFERENCES sessions(tenant_id,application_id,user_id,id),
  CONSTRAINT device_link_email_digest CHECK (email_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT device_link_token_digest CHECK (token_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT device_link_comparison_code CHECK (comparison_code ~ '^[A-Z2-9]{6}$'),
  CONSTRAINT device_link_state CHECK (state IN ('PENDING','APPROVED','REJECTED','COMPLETED','EXPIRED','CANCELLED')),
  CONSTRAINT device_link_expiry CHECK (expires_at>created_at),
  CONSTRAINT device_link_approval_state CHECK ((approval_session_id IS NULL) = (approval_challenge_id IS NULL)
    AND (approval_challenge_id IS NULL) = (approval_challenge IS NULL)
    AND (approval_challenge IS NULL) = (approval_expected_origin IS NULL)
    AND (approval_expected_origin IS NULL) = (approval_expected_rp_id IS NULL)
    AND (approval_challenge IS NULL) = (approval_expires_at IS NULL)),
  CONSTRAINT device_link_registration_state CHECK ((registration_challenge_id IS NULL) = (registration_challenge IS NULL)
    AND (registration_challenge IS NULL) = (registration_expected_origin IS NULL)
    AND (registration_expected_origin IS NULL) = (registration_expected_rp_id IS NULL)
    AND (registration_challenge IS NULL) = (registration_expires_at IS NULL)),
  CONSTRAINT device_link_completed CHECK ((state='COMPLETED') = (completed_at IS NOT NULL)),
  CONSTRAINT device_link_approved_user CHECK (state NOT IN ('APPROVED','COMPLETED') OR (user_id IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE INDEX device_link_pending_user_idx ON device_link_requests(tenant_id,application_id,user_id,created_at)
  WHERE state='PENDING' AND user_id IS NOT NULL;
CREATE INDEX device_link_expiry_idx ON device_link_requests(expires_at)
  WHERE state IN ('PENDING','APPROVED');
