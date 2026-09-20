-- Migration: Add prompt_template field to characters table
-- Date: 2026-03-02
-- Description: Adds support for different prompt templates (Alpaca, ChatML, Vicuna, etc.)

ALTER TABLE characters
ADD COLUMN IF NOT EXISTS prompt_template VARCHAR(50) DEFAULT 'default';

COMMENT ON COLUMN characters.prompt_template IS 'Prompt template format (default, alpaca, chatml, vicuna, llama2)';
