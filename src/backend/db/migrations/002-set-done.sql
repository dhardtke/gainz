ALTER TABLE sets ADD COLUMN done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1));

-- Every set logged before this migration was performed, not planned.
UPDATE sets SET done = 1;
