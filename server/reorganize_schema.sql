-- Create candidate_profiles table
CREATE TABLE IF NOT EXISTS public.candidate_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    material_id UUID UNIQUE NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
    candidate_name TEXT,
    candidate_email TEXT,
    candidate_phone TEXT,
    linkedin TEXT,
    github TEXT,
    portfolio_link TEXT,
    summary TEXT,
    skills TEXT,
    experience TEXT,
    education TEXT,
    projects TEXT,
    certifications TEXT,
    achievements TEXT,
    languages TEXT,
    extracurricular TEXT,
    interests TEXT,
    raw_text_preview TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
