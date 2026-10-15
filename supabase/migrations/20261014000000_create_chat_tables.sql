-- ==============================================================================
-- Supabase Migration: 20261014000000_create_chat_tables.sql
-- Description: Creates conversations and messages tables with RLS and indexes.
-- ==============================================================================

-- Ensure UUID generation functions are available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Create Conversations Table
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT 'New Conversation',
  model TEXT DEFAULT 'gpt-6-luna',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Create Messages Table
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'model', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Create Indexes for High Performance
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON public.conversations(updated_at DESC);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- 5. Row Level Security Policies (Allow Public / Anon Client Access)
DROP POLICY IF EXISTS "Public select conversations" ON public.conversations;
DROP POLICY IF EXISTS "Public insert conversations" ON public.conversations;
DROP POLICY IF EXISTS "Public update conversations" ON public.conversations;
DROP POLICY IF EXISTS "Public delete conversations" ON public.conversations;

DROP POLICY IF EXISTS "Public select messages" ON public.messages;
DROP POLICY IF EXISTS "Public insert messages" ON public.messages;
DROP POLICY IF EXISTS "Public delete messages" ON public.messages;

CREATE POLICY "Public select conversations" ON public.conversations FOR SELECT USING (true);
CREATE POLICY "Public insert conversations" ON public.conversations FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update conversations" ON public.conversations FOR UPDATE USING (true);
CREATE POLICY "Public delete conversations" ON public.conversations FOR DELETE USING (true);

CREATE POLICY "Public select messages" ON public.messages FOR SELECT USING (true);
CREATE POLICY "Public insert messages" ON public.messages FOR INSERT WITH CHECK (true);
CREATE POLICY "Public delete messages" ON public.messages FOR DELETE USING (true);
