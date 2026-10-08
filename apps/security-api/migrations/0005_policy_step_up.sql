-- Old foundation grants have no bearer proof and cannot authorize an evaluation.
ALTER TABLE webauthn_challenges ADD COLUMN policy_version integer CHECK (policy_version > 0);
ALTER TABLE step_up_grants ADD COLUMN grant_digest text UNIQUE CHECK (grant_digest ~ '^[a-f0-9]{64}$');
ALTER TABLE step_up_grants ADD COLUMN policy_version integer CHECK (policy_version > 0);
ALTER TABLE step_up_grants ADD CONSTRAINT grant_proof_context CHECK ((grant_digest IS NULL) = (policy_version IS NULL));
ALTER TABLE audit_events ADD COLUMN decision text CHECK (decision IN ('ALLOW','STEP_UP','DENY'));
ALTER TABLE audit_events ADD COLUMN resource_id text;
ALTER TABLE audit_events ADD CONSTRAINT audit_resource_owner FOREIGN KEY (tenant_id,application_id,subject_id,resource_id) REFERENCES user_resources(tenant_id,application_id,user_id,id);
ALTER TABLE audit_events ADD CONSTRAINT audit_resource_subject CHECK (resource_id IS NULL OR subject_id IS NOT NULL);
CREATE INDEX audit_failures_owner_idx ON audit_events(tenant_id,application_id,subject_id,occurred_at) WHERE outcome='FAILURE';
