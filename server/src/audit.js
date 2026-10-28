import { run, nowIso } from './db.js';

export function audit(userId, action, entity, entityId, summary, details) {
  run(
    `INSERT INTO audit_log (user_id, action, entity, entity_id, summary, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    userId ?? null,
    action,
    entity,
    entityId ?? null,
    summary ?? null,
    details ? JSON.stringify(details) : null,
    nowIso(),
  );
}
