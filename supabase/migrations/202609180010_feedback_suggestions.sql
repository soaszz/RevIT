-- Migration: Add Feedback and Suggestions Table
-- Description: Table for users to submit feedback directly from the app

CREATE TABLE public.feedback (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    message text NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- Policy: Users can insert their own feedback
CREATE POLICY "Users can insert their own feedback"
ON public.feedback
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can view their own feedback (optional, but good practice)
CREATE POLICY "Users can view their own feedback"
ON public.feedback
FOR SELECT 
TO authenticated
USING (auth.uid() = user_id);

-- Admin viewing is handled by Supabase dashboard (service_role overrides RLS)
