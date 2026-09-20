-- Add recursive scanning fields to worldbook_entries
-- Enables hierarchical lore structures

ALTER TABLE worldbook_entries
ADD COLUMN IF NOT EXISTS recursive BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS prevent_recursion BOOLEAN DEFAULT FALSE;

-- Add comment
COMMENT ON COLUMN worldbook_entries.recursive IS 'If true, this entry content will be scanned for other keywords when triggered';
COMMENT ON COLUMN worldbook_entries.prevent_recursion IS 'If true, this entry will not be triggered by recursive scans';
