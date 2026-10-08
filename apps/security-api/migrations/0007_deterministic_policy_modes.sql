-- Convert obsolete contextual policies to the stricter explicit verification path.
UPDATE policies SET mode='STEP_UP' WHERE mode='CONTEXTUAL_RISK';
ALTER TABLE policies DROP CONSTRAINT policies_mode_check;
ALTER TABLE policies ADD CONSTRAINT policies_mode_check CHECK (mode IN ('ALLOW','STEP_UP','DENY'));
