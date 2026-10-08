CREATE TABLE tenants (
  id text PRIMARY KEY,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE applications (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  origins jsonb NOT NULL,
  rp_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id)
);
CREATE TABLE application_api_keys (
  id text PRIMARY KEY, tenant_id text NOT NULL, application_id text NOT NULL,
  digest text NOT NULL UNIQUE CHECK (digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz, revoked_at timestamptz,
  FOREIGN KEY (tenant_id,application_id) REFERENCES applications(tenant_id,id)
);
CREATE TABLE users (
  id text PRIMARY KEY, tenant_id text NOT NULL, application_id text NOT NULL,
  email text NOT NULL CHECK (email = lower(trim(email)) AND length(email) BETWEEN 3 AND 254),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 100),
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user','developer','admin')),
  created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz,
  UNIQUE (tenant_id,application_id,id), UNIQUE (tenant_id,application_id,email),
  FOREIGN KEY (tenant_id,application_id) REFERENCES applications(tenant_id,id)
);
CREATE TABLE password_credentials (
  tenant_id text NOT NULL, application_id text NOT NULL, user_id text PRIMARY KEY,
  password_hash text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,application_id,user_id) REFERENCES users(tenant_id,application_id,id)
);
CREATE TABLE webauthn_credentials (
  id text PRIMARY KEY, tenant_id text NOT NULL, application_id text NOT NULL, user_id text NOT NULL,
  credential_id text NOT NULL, public_key text NOT NULL,
  counter bigint NOT NULL DEFAULT 0 CHECK (counter >= 0),
  transports jsonb NOT NULL DEFAULT '[]', device_type text NOT NULL, backed_up boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,application_id,credential_id),
  FOREIGN KEY (tenant_id,application_id,user_id) REFERENCES users(tenant_id,application_id,id)
);
CREATE TABLE sessions (
  id text PRIMARY KEY, tenant_id text NOT NULL, application_id text NOT NULL, user_id text NOT NULL,
  token_digest text NOT NULL UNIQUE CHECK (token_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz,
  expires_at timestamptz NOT NULL CHECK (expires_at > created_at), revoked_at timestamptz, device_label text,
  UNIQUE (tenant_id,application_id,user_id,id), UNIQUE (tenant_id,application_id,id),
  FOREIGN KEY (tenant_id,application_id,user_id) REFERENCES users(tenant_id,application_id,id)
);
CREATE TABLE protected_actions (
  id text PRIMARY KEY, tenant_id text NOT NULL, application_id text NOT NULL,
  action_id text NOT NULL, description text NOT NULL DEFAULT '', enabled boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_id,application_id,action_id),
  FOREIGN KEY (tenant_id,application_id) REFERENCES applications(tenant_id,id)
);
CREATE TABLE policies (
  id text PRIMARY KEY, tenant_id text NOT NULL, application_id text NOT NULL, action_id text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('ALLOW','CONTEXTUAL_RISK','STEP_UP','DENY')),
  version integer NOT NULL CHECK (version > 0), enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,application_id,action_id,version),
  FOREIGN KEY (tenant_id,application_id,action_id) REFERENCES protected_actions(tenant_id,application_id,action_id)
);
CREATE TABLE user_resources (
  id text PRIMARY KEY, tenant_id text NOT NULL, application_id text NOT NULL, user_id text NOT NULL,
  kind text NOT NULL, data jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,application_id,user_id,id),
  FOREIGN KEY (tenant_id,application_id,user_id) REFERENCES users(tenant_id,application_id,id)
);
CREATE TABLE webauthn_challenges (
  id text PRIMARY KEY, tenant_id text NOT NULL, application_id text NOT NULL,
  user_id text, session_id text, purpose text NOT NULL CHECK (purpose IN ('registration','authentication','step_up')),
  challenge text NOT NULL UNIQUE, action_id text, resource_id text,
  created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL CHECK (expires_at > created_at), consumed_at timestamptz,
  CHECK (session_id IS NULL OR user_id IS NOT NULL),
  CHECK (purpose != 'step_up' OR (user_id IS NOT NULL AND session_id IS NOT NULL AND action_id IS NOT NULL AND resource_id IS NOT NULL)),
  CHECK ((action_id IS NULL) = (resource_id IS NULL)),
  UNIQUE (tenant_id,application_id,user_id,session_id,action_id,resource_id,id),
  FOREIGN KEY (tenant_id,application_id) REFERENCES applications(tenant_id,id),
  FOREIGN KEY (tenant_id,application_id,user_id) REFERENCES users(tenant_id,application_id,id),
  FOREIGN KEY (tenant_id,application_id,user_id,session_id) REFERENCES sessions(tenant_id,application_id,user_id,id),
  FOREIGN KEY (tenant_id,application_id,action_id) REFERENCES protected_actions(tenant_id,application_id,action_id),
  FOREIGN KEY (tenant_id,application_id,user_id,resource_id) REFERENCES user_resources(tenant_id,application_id,user_id,id)
);
CREATE TABLE step_up_grants (
  id text PRIMARY KEY, tenant_id text NOT NULL, application_id text NOT NULL, user_id text NOT NULL,
  session_id text NOT NULL, challenge_id text NOT NULL UNIQUE, action_id text NOT NULL, resource_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL CHECK (expires_at > created_at), consumed_at timestamptz,
  FOREIGN KEY (tenant_id,application_id,user_id,session_id,action_id,resource_id,challenge_id)
    REFERENCES webauthn_challenges(tenant_id,application_id,user_id,session_id,action_id,resource_id,id)
);
CREATE TABLE recovery_codes (
  id text PRIMARY KEY, tenant_id text NOT NULL, application_id text NOT NULL, user_id text NOT NULL,
  verifier text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), consumed_at timestamptz,
  FOREIGN KEY (tenant_id,application_id,user_id) REFERENCES users(tenant_id,application_id,id)
);
CREATE TABLE recovery_attempts (
  id text PRIMARY KEY, tenant_id text NOT NULL, application_id text NOT NULL, user_id text,
  account_digest text NOT NULL CHECK (account_digest ~ '^[a-f0-9]{64}$'),
  outcome text NOT NULL CHECK (outcome IN ('started','failed','completed')),
  occurred_at timestamptz NOT NULL DEFAULT now(), correlation_id text NOT NULL,
  FOREIGN KEY (tenant_id,application_id) REFERENCES applications(tenant_id,id),
  FOREIGN KEY (tenant_id,application_id,user_id) REFERENCES users(tenant_id,application_id,id)
);
CREATE TABLE audit_events (
  id text PRIMARY KEY, tenant_id text NOT NULL, application_id text NOT NULL, subject_id text, session_id text,
  type text NOT NULL, outcome text NOT NULL CHECK (outcome IN ('SUCCESS','FAILURE','REQUIRED','DENIED','REVOKED','INFO')),
  action_id text, policy_version integer CHECK (policy_version > 0), risk_score integer CHECK (risk_score BETWEEN 0 AND 100),
  signal_codes jsonb NOT NULL DEFAULT '[]', reason_code text NOT NULL CHECK (reason_code ~ '^[a-z0-9_]{1,80}$'),
  correlation_id text NOT NULL, simulated boolean NOT NULL DEFAULT false, occurred_at timestamptz NOT NULL DEFAULT now(),
  CHECK (session_id IS NULL OR subject_id IS NOT NULL),
  FOREIGN KEY (tenant_id,application_id) REFERENCES applications(tenant_id,id),
  FOREIGN KEY (tenant_id,application_id,subject_id) REFERENCES users(tenant_id,application_id,id),
  FOREIGN KEY (tenant_id,application_id,subject_id,session_id) REFERENCES sessions(tenant_id,application_id,user_id,id)
);
CREATE TABLE ai_usage (
  id text PRIMARY KEY, tenant_id text NOT NULL, application_id text NOT NULL, user_id text NOT NULL,
  request_digest text NOT NULL CHECK (request_digest ~ '^[a-f0-9]{64}$'), model text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0 CHECK (input_tokens >= 0), output_tokens integer NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  estimated_cost_micros bigint CHECK (estimated_cost_micros >= 0), pricing_date date,
  status text NOT NULL CHECK (status IN ('pending','completed','failed')), result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
  UNIQUE (tenant_id,application_id,user_id,request_digest),
  FOREIGN KEY (tenant_id,application_id,user_id) REFERENCES users(tenant_id,application_id,id)
);
CREATE INDEX sessions_owner_idx ON sessions(tenant_id,application_id,user_id);
CREATE INDEX challenges_expiry_idx ON webauthn_challenges(expires_at) WHERE consumed_at IS NULL;
CREATE INDEX grants_expiry_idx ON step_up_grants(expires_at) WHERE consumed_at IS NULL;
CREATE INDEX audit_scope_time_idx ON audit_events(tenant_id,application_id,occurred_at);
CREATE INDEX recovery_attempts_scope_idx ON recovery_attempts(tenant_id,application_id,account_digest,occurred_at);
CREATE FUNCTION reject_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'audit events are append-only'; END;
$$;
CREATE TRIGGER audit_events_immutable BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();
