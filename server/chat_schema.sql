-- 1. Create friendships table
CREATE TABLE IF NOT EXISTS public.friendships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_username TEXT NOT NULL REFERENCES public.profiles(username) ON DELETE CASCADE,
    friend_username TEXT NOT NULL REFERENCES public.profiles(username) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_username, friend_username)
);

-- 2. Create messages table
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_username TEXT NOT NULL REFERENCES public.profiles(username) ON DELETE CASCADE,
    receiver_username TEXT NOT NULL REFERENCES public.profiles(username) ON DELETE CASCADE,
    content TEXT,
    file_url TEXT,
    file_name TEXT,
    file_size BIGINT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS and add basic security
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Simple permissive policy for development (allow server-side Admin client full bypass)
CREATE POLICY "Allow admin and server bypass" ON public.friendships FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow admin and server bypass messages" ON public.messages FOR ALL USING (true) WITH CHECK (true);
