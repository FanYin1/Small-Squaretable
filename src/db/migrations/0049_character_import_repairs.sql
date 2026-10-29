CREATE TABLE character_import_repairs (
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  review_fingerprint varchar(64) NOT NULL,
  book_id uuid NOT NULL,
  entry_count integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (character_id, review_fingerprint),
  CONSTRAINT character_import_repairs_fingerprint CHECK (review_fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT character_import_repairs_entries CHECK (entry_count > 0)
);
