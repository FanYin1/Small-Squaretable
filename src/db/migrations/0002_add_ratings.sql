-- Create ratings table for 5-dimension character ratings
CREATE TABLE "ratings" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "character_id" uuid NOT NULL REFERENCES "characters"("id") ON DELETE CASCADE,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,

    -- Five rating dimensions (1-5 stars)
    "quality" integer NOT NULL CHECK ("quality" BETWEEN 1 AND 5),
    "creativity" integer NOT NULL CHECK ("creativity" BETWEEN 1 AND 5),
    "interactivity" integer NOT NULL CHECK ("interactivity" BETWEEN 1 AND 5),
    "accuracy" integer NOT NULL CHECK ("accuracy" BETWEEN 1 AND 5),
    "entertainment" integer NOT NULL CHECK ("entertainment" BETWEEN 1 AND 5),

    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,

    -- Each user can only rate a character once
    UNIQUE("character_id", "user_id")
);

-- Create indexes for performance
CREATE INDEX "ratings_character_id_idx" ON "ratings"("character_id");
CREATE INDEX "ratings_user_id_idx" ON "ratings"("user_id");

-- Extend characters table with rating average columns
ALTER TABLE "characters"
ADD COLUMN "rating_quality_avg" decimal(3,2),
ADD COLUMN "rating_creativity_avg" decimal(3,2),
ADD COLUMN "rating_interactivity_avg" decimal(3,2),
ADD COLUMN "rating_accuracy_avg" decimal(3,2),
ADD COLUMN "rating_entertainment_avg" decimal(3,2),
ADD COLUMN "rating_overall_avg" decimal(3,2);

-- Note: rating_count already exists in characters table
