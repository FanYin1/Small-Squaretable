ALTER TABLE story_events DROP CONSTRAINT story_events_status_check;
ALTER TABLE story_events ADD CONSTRAINT story_events_status_check CHECK (status IN ('confirmed', 'interrupted', 'proposed'));
