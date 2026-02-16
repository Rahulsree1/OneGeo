-- Run this if your `files` table already exists and you need to add status/important/processed.
-- PostgreSQL:
ALTER TABLE files ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'active';
ALTER TABLE files ADD COLUMN IF NOT EXISTS is_important BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE files ADD COLUMN IF NOT EXISTS processed BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS ix_files_status ON files (status);
