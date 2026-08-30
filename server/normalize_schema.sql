-- Drop existing table if redefining
DROP TABLE IF EXISTS public.candidate_projects CASCADE;
DROP TABLE IF EXISTS public.candidate_education CASCADE;
DROP TABLE IF EXISTS public.candidate_experience CASCADE;
DROP TABLE IF EXISTS public.candidate_skills CASCADE;

-- 1. Main Profile Table (already exists but keeping for completeness)
CREATE TABLE IF NOT EXISTS public.candidate_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    material_id BIGINT UNIQUE NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
    candidate_name TEXT,
    candidate_email TEXT,
    candidate_phone TEXT,
    linkedin TEXT,
    github TEXT,
    portfolio_link TEXT,
    summary TEXT,
    certifications TEXT,
    achievements TEXT,
    languages TEXT,
    extracurricular TEXT,
    interests TEXT,
    raw_text_preview TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Skills Table
CREATE TABLE public.candidate_skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES public.candidate_profiles(id) ON DELETE CASCADE,
    skill_name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Experience Table
CREATE TABLE public.candidate_experience (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES public.candidate_profiles(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Education Table
CREATE TABLE public.candidate_education (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES public.candidate_profiles(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Projects Table
CREATE TABLE public.candidate_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES public.candidate_profiles(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
