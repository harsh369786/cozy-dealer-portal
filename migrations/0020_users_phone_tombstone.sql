-- Free phone numbers on soft-deleted users (users.phone has a table-level UNIQUE constraint).
UPDATE users
SET phone = phone || '#deleted#' || id
WHERE deleted_at IS NOT NULL
  AND phone NOT LIKE '%#deleted#%';
