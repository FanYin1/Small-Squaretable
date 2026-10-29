ALTER TABLE character_memories DROP CONSTRAINT IF EXISTS unique_memory;
--> statement-breakpoint
DO $$
DECLARE constraint_name text;
BEGIN
  FOR constraint_name IN SELECT conname FROM pg_constraint WHERE conrelid = 'character_memories'::regclass AND contype = 'f' AND confrelid = 'chats'::regclass LOOP
    EXECUTE format('ALTER TABLE character_memories DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;
--> statement-breakpoint
ALTER TABLE character_memories ADD CONSTRAINT character_memories_source_story_fk FOREIGN KEY (source_chat_id) REFERENCES chats(id) ON DELETE CASCADE;
