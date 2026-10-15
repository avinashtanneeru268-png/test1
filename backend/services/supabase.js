import { createClient } from '@supabase/supabase-js';

let supabaseClient = null;

/**
 * Checks if Supabase credentials in environment are valid (not default placeholders).
 */
export function isSupabaseConfigured() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  return Boolean(
    url &&
    key &&
    !url.includes('your-project') &&
    !key.includes('your_supabase_') &&
    url.startsWith('https://')
  );
}

/**
 * Gets or initializes the Supabase client instance.
 */
export function getSupabaseClient() {
  if (!isSupabaseConfigured()) {
    return null;
  }

  if (!supabaseClient) {
    const url = process.env.SUPABASE_URL.trim();
    // Prefer service role key for backend operations if provided; fallback to anon key
    const key = (process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY.includes('your_supabase_'))
      ? process.env.SUPABASE_SERVICE_ROLE_KEY.trim()
      : process.env.SUPABASE_ANON_KEY.trim();

    supabaseClient = createClient(url, key, {
      auth: { persistSession: false }
    });
  }

  return supabaseClient;
}

/**
 * Test Supabase connection and table availability.
 */
export async function testSupabaseConnection() {
  if (!isSupabaseConfigured()) {
    return {
      connected: false,
      configured: false,
      tablesReady: false,
      message: 'Supabase URL or Key is using placeholder values in .env.'
    };
  }

  try {
    const client = getSupabaseClient();
    // Try to query conversations table
    const { data, error } = await client.from('conversations').select('id').limit(1);

    if (error) {
      const isMissingTable = error.message.includes('schema cache') || error.code === 'PGRST205' || error.message.includes('does not exist');
      return {
        connected: true,
        configured: true,
        tablesReady: false,
        message: isMissingTable
          ? "Supabase connected, but 'conversations' table not found in schema cache. Run migration SQL in Supabase SQL Editor."
          : `Connected to Supabase, but query failed: ${error.message}`
      };
    }

    return {
      connected: true,
      configured: true,
      tablesReady: true,
      message: 'Successfully connected to Supabase and verified conversations table!'
    };
  } catch (err) {
    return {
      connected: false,
      configured: true,
      tablesReady: false,
      message: `Connection failed: ${err.message}`
    };
  }
}

/**
 * Fetch all conversations ordered by last updated.
 */
export async function getConversations() {
  const client = getSupabaseClient();
  if (!client) return [];

  const { data, error } = await client
    .from('conversations')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) {
    if (!error.message?.includes('schema cache')) {
      console.error('Error fetching conversations from Supabase:', error.message);
    }
    return [];
  }

  return data || [];
}

/**
 * Create a new conversation record.
 */
export async function createConversation(title = 'New Conversation', model = (process.env.OPENAI_MODEL || 'gpt-6-luna')) {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client
    .from('conversations')
    .insert([{ title, model }])
    .select()
    .single();

  if (error) {
    if (error.message?.includes('schema cache') || error.code === 'PGRST205') {
      console.warn('[Bunny AI] Supabase table "conversations" pending creation. Using local storage session.');
    } else {
      console.error('Error creating conversation in Supabase:', error.message);
    }
    return null;
  }

  return data;
}

/**
 * Rename a conversation title.
 */
export async function renameConversation(conversationId, title) {
  const client = getSupabaseClient();
  if (!client || !conversationId) return null;

  const { data, error } = await client
    .from('conversations')
    .update({ title, updated_at: new Date().toISOString() })
    .eq('id', conversationId)
    .select()
    .single();

  if (error) {
    console.error('Error renaming conversation in Supabase:', error.message);
    return null;
  }

  return data;
}

/**
 * Fetch all messages for a specific conversation.
 */
export async function getMessages(conversationId) {
  const client = getSupabaseClient();
  if (!client || !conversationId) return [];

  const { data, error } = await client
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error(`Error fetching messages for conversation ${conversationId}:`, error.message);
    return [];
  }

  return data || [];
}

/**
 * Save a message and touch the updated_at timestamp on the conversation.
 */
export async function saveMessage(conversationId, role, content) {
  const client = getSupabaseClient();
  if (!client || !conversationId) return null;

  const normalizedRole = (role === 'model') ? 'assistant' : role;

  const { data, error } = await client
    .from('messages')
    .insert([{
      conversation_id: conversationId,
      role: normalizedRole,
      content
    }])
    .select()
    .single();

  if (error) {
    console.error('Error saving message to Supabase:', error.message);
    return null;
  }

  // Update conversation updated_at
  await client
    .from('conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId);

  return data;
}

/**
 * Delete a conversation.
 */
export async function deleteConversation(conversationId) {
  const client = getSupabaseClient();
  if (!client || !conversationId) return false;

  const { error } = await client
    .from('conversations')
    .delete()
    .eq('id', conversationId);

  if (error) {
    console.error('Error deleting conversation from Supabase:', error.message);
    return false;
  }

  return true;
}
