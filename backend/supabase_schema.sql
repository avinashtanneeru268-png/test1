-- ==============================================================================
-- Bunny AI Assistant - Supabase Database Schema
-- Run this script in your Supabase Dashboard: SQL Editor -> New Query -> Run
-- ==============================================================================

-- 1. Create Conversations Table
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT 'New Conversation',
  model TEXT DEFAULT 'gpt-6-luna',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create Messages Table
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'model', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create Indexes for High Performance Querying
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- 5. Policies for Public/Anon Access (Default for simple API / Demo usage)
-- Drop existing policies if re-running
DROP POLICY IF EXISTS "Public select conversations" ON conversations;
DROP POLICY IF EXISTS "Public insert conversations" ON conversations;
DROP POLICY IF EXISTS "Public update conversations" ON conversations;
DROP POLICY IF EXISTS "Public delete conversations" ON conversations;

DROP POLICY IF EXISTS "Public select messages" ON messages;
DROP POLICY IF EXISTS "Public insert messages" ON messages;
DROP POLICY IF EXISTS "Public delete messages" ON messages;

-- Allow read/write with anon key
CREATE POLICY "Public select conversations" ON conversations FOR SELECT USING (true);
CREATE POLICY "Public insert conversations" ON conversations FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update conversations" ON conversations FOR UPDATE USING (true);
CREATE POLICY "Public delete conversations" ON conversations FOR DELETE USING (true);

CREATE POLICY "Public select messages" ON messages FOR SELECT USING (true);
CREATE POLICY "Public insert messages" ON messages FOR INSERT WITH CHECK (true);
CREATE POLICY "Public delete messages" ON messages FOR DELETE USING (true);
