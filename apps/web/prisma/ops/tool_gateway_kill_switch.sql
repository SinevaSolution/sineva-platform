-- Operator-only: run with the administrative database role, never the app role.
-- psql "$ADMIN_DATABASE_URL" -v scope=provider -v target=gmail -v enabled=true -v actor=operator-id -f tool_gateway_kill_switch.sql
\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE gateway_switch_input (
  scope TEXT NOT NULL CHECK (scope IN ('provider', 'freeze', 'read_only', 'specialist')),
  target TEXT NOT NULL CHECK (length(target) BETWEEN 1 AND 128),
  enabled BOOLEAN NOT NULL,
  actor TEXT NOT NULL CHECK (length(actor) BETWEEN 1 AND 128)
) ON COMMIT DROP;
INSERT INTO gateway_switch_input VALUES (:'scope', :'target', :'enabled'::boolean, :'actor');
WITH changed AS (
  INSERT INTO platform.kill_switches (scope, target, enabled, enabled_by)
  SELECT scope, target, enabled, actor FROM gateway_switch_input
  ON CONFLICT (scope, target) DO UPDATE SET enabled = EXCLUDED.enabled,
    enabled_by = EXCLUDED.enabled_by, enabled_at = now(), updated_at = now()
  RETURNING id, scope, target, enabled, enabled_by
)
INSERT INTO platform.audit_events (workspace_id, actor_type, actor_id, action, target_type, target_id, outcome, metadata)
SELECT CASE WHEN scope IN ('freeze', 'read_only') AND target <> '*' THEN target::uuid ELSE NULL END,
  'system', enabled_by, 'security.kill_switch_changed', 'kill_switch', id::text, 'allowed',
  jsonb_build_object('scope', scope, 'target', target, 'enabled', enabled)
FROM changed;
COMMIT;
