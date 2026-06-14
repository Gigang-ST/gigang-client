ALTER TABLE sch_post
  ADD COLUMN post_type text NOT NULL DEFAULT 'general'
  CHECK (post_type IN ('general', 'race_entry', 'event'));
