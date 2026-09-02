-- Indexes for complaint list/count queries filtered by distributor and by status.
-- Complaint lists are scoped by distributor and dealer stats count open complaints by status,
-- so these avoid full scans on a growing complaints table.

CREATE INDEX IF NOT EXISTS idx_complaints_distributor ON complaints(distributor_id);
CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);
