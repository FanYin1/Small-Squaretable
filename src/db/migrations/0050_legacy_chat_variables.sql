CREATE TABLE legacy_chat_variables (
  chat_id uuid PRIMARY KEY REFERENCES chats(id) ON DELETE CASCADE,
  "values" jsonb NOT NULL CHECK (jsonb_typeof("values") = 'object')
);
