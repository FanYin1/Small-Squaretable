-- Add character filter fields to worldbook_entries
-- Character filters allow entries to be activated only for specific characters

ALTER TABLE worldbook_entries
ADD COLUMN IF NOT EXISTS character_filter jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS scan_depth integer,
ADD COLUMN IF NOT EXISTS context_percentage integer CHECK (context_percentage >= 0 AND context_percentage <= 100);

-- Add index for character filter queries
CREATE INDEX IF NOT EXISTS idx_worldbook_entries_character_filter
ON worldbook_entries USING gin(character_filter);

-- Add comment
COMMENT ON COLUMN worldbook_entries.character_filter IS 'Array of character IDs that this entry applies to. Empty array means applies to all characters.';
COMMENT ON COLUMN worldbook_entries.scan_depth IS 'Number of recent messages to scan for keywords. NULL means scan all messages.';
COMMENT ON COLUMN worldbook_entries.context_percentage IS 'Maximum percentage of context budget this entry can use. NULL means no limit.';
