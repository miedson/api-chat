-- Ajuste organization_id e assignee_id conforme seu ambiente.
INSERT INTO inboxes (organization_id, name, created_at, updated_at)
VALUES (1, 'Inbox Padrão', NOW(), NOW())
ON CONFLICT DO NOTHING;

INSERT INTO contacts (organization_id, name, external_id, created_at, updated_at)
VALUES (1, 'Contato Demo', 'demo-1', NOW(), NOW())
ON CONFLICT DO NOTHING;

INSERT INTO conversations (
  organization_id,
  inbox_id,
  contact_id,
  status,
  assignee_id,
  last_message_at,
  last_activity_at,
  created_at,
  updated_at
)
SELECT 1, i.id, c.id, 'open', NULL, NOW(), NOW(), NOW(), NOW()
FROM inboxes i
JOIN contacts c ON c.organization_id = i.organization_id
WHERE i.organization_id = 1
  AND i.name = 'Inbox Padrão'
  AND c.external_id = 'demo-1'
  AND NOT EXISTS (
    SELECT 1 FROM conversations cv
    WHERE cv.organization_id = 1
      AND cv.inbox_id = i.id
      AND cv.contact_id = c.id
  );
