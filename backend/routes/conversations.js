import express from 'express';
import {
  isSupabaseConfigured,
  testSupabaseConnection,
  getConversations,
  createConversation,
  renameConversation,
  getMessages,
  deleteConversation
} from '../services/supabase.js';

const router = express.Router();

// GET /api/supabase/status - Test Supabase connection
router.get('/supabase/status', async (req, res) => {
  const result = await testSupabaseConnection();
  res.json(result);
});

// GET /api/conversations - List all saved conversations
router.get('/conversations', async (req, res) => {
  if (!isSupabaseConfigured()) {
    return res.json({
      configured: false,
      tablesReady: false,
      conversations: [],
      message: 'Supabase is not configured yet. Set SUPABASE_URL and SUPABASE_ANON_KEY in .env.'
    });
  }

  const status = await testSupabaseConnection();
  if (!status.tablesReady) {
    return res.json({
      configured: true,
      tablesReady: false,
      conversations: [],
      message: status.message
    });
  }

  const conversations = await getConversations();
  res.json({
    configured: true,
    tablesReady: true,
    conversations
  });
});

// POST /api/conversations - Create a new conversation session
router.post('/conversations', async (req, res) => {
  const defaultModel = process.env.OPENAI_MODEL || 'gpt-6-luna';
  const { title = 'New Conversation', model = defaultModel } = req.body || {};

  if (!isSupabaseConfigured()) {
    return res.status(200).json({
      id: 'local_' + Date.now(),
      title,
      model,
      localFallback: true
    });
  }

  const conversation = await createConversation(title, model);

  if (!conversation) {
    // Return graceful 200 local fallback session so frontend never errors out
    return res.status(200).json({
      id: 'local_' + Date.now(),
      title,
      model,
      localFallback: true,
      message: 'Supabase table "conversations" pending creation. Session active in local memory.'
    });
  }

  res.status(201).json(conversation);
});

// PATCH /api/conversations/:id - Rename a conversation
router.patch('/conversations/:id', async (req, res) => {
  if (!isSupabaseConfigured()) {
    return res.status(400).json({ error: 'Supabase is not configured in .env' });
  }

  const { title } = req.body;
  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return res.status(400).json({ error: 'Field "title" is required.' });
  }

  const updated = await renameConversation(req.params.id, title.trim());
  if (!updated) {
    return res.status(500).json({ error: 'Failed to rename conversation in Supabase' });
  }

  res.json({ success: true, conversation: updated });
});

// GET /api/conversations/:id/messages - Retrieve message history
router.get('/conversations/:id/messages', async (req, res) => {
  if (!isSupabaseConfigured()) {
    return res.json([]);
  }

  const messages = await getMessages(req.params.id);
  res.json(messages);
});

// DELETE /api/conversations/:id - Remove a conversation
router.delete('/conversations/:id', async (req, res) => {
  if (!isSupabaseConfigured()) {
    return res.status(400).json({ error: 'Supabase is not configured in .env' });
  }

  const success = await deleteConversation(req.params.id);
  if (!success) {
    return res.status(500).json({ error: 'Failed to delete conversation' });
  }

  res.json({ success: true, id: req.params.id });
});

export default router;
