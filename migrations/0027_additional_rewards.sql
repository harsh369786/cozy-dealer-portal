-- Additional (milestone) rewards sit beside the regular catalogue.
-- Dealers pick one fulfilled target; claiming does not spend catalogue points.

ALTER TABLE reward_catalog ADD COLUMN kind TEXT DEFAULT 'standard';

UPDATE reward_catalog SET kind = 'standard' WHERE kind IS NULL OR trim(kind) = '';

INSERT OR IGNORE INTO reward_catalog (id, name, emoji, points_required, active, kind)
VALUES
  ('rw-add-tour', 'International Tour', '✈️', 180000, 1, 'milestone'),
  ('rw-add-tv', '55" Smart TV', '📺', 135000, 1, 'milestone');
