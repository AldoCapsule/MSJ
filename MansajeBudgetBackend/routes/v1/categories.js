'use strict';
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { verifyFirebaseToken } = require('../../middleware/auth');
const { supabaseForUser } = require('../../db');

// Default system categories seeded on first call if missing
const SYSTEM_CATEGORIES = [
  { name: 'Income',            type: 'income',   icon: 'dollarsign.circle.fill', color: '#2F9E44' },
  { name: 'Food & Dining',     type: 'expense',  icon: 'fork.knife',             color: '#FF6B6B' },
  { name: 'Groceries',         type: 'expense',  icon: 'cart.fill',              color: '#51CF66' },
  { name: 'Transportation',    type: 'expense',  icon: 'car.fill',               color: '#339AF0' },
  { name: 'Shopping',          type: 'expense',  icon: 'bag.fill',               color: '#20C997' },
  { name: 'Bills & Utilities', type: 'expense',  icon: 'bolt.fill',              color: '#FCC419' },
  { name: 'Entertainment',     type: 'expense',  icon: 'tv.fill',                color: '#FF922B' },
  { name: 'Health',            type: 'expense',  icon: 'heart.fill',             color: '#F06595' },
  { name: 'Travel',            type: 'expense',  icon: 'airplane',               color: '#4DABF7' },
  { name: 'Education',         type: 'expense',  icon: 'book.fill',              color: '#A9E34B' },
  { name: 'Personal Care',     type: 'expense',  icon: 'person.fill',            color: '#CC5DE8' },
  { name: 'Gifts',             type: 'expense',  icon: 'gift.fill',              color: '#FF6B9D' },
  { name: 'Investments',       type: 'expense',  icon: 'chart.line.uptrend.xyaxis', color: '#845EF7' },
  { name: 'Fees',              type: 'expense',  icon: 'exclamationmark.circle.fill', color: '#FA5252' },
  { name: 'Taxes',             type: 'expense',  icon: 'doc.text.fill',          color: '#868E96' },
  { name: 'Transfer',          type: 'transfer', icon: 'arrow.left.arrow.right', color: '#ADB5BD' },
  { name: 'Uncategorized',     type: 'expense',  icon: 'ellipsis.circle.fill',   color: '#CED4DA' },
];

router.use(verifyFirebaseToken);

async function ensureSystemCategories(accessToken, uid) {
  const { data } = await supabaseForUser(accessToken)
    .from('categories')
    .select('id')
    .eq('is_system', true)
    .limit(1);
  if (data && data.length > 0) return;

  const rows = SYSTEM_CATEGORIES.map(cat => ({
    id: uuidv4(),
    user_id: uid,
    parent_id: null,
    is_system: true,
    is_hidden: false,
    ...cat,
  }));
  await supabaseForUser(accessToken).from('categories').insert(rows);
}

// GET /v1/categories
router.get('/', async (req, res, next) => {
  try {
    await ensureSystemCategories(req.accessToken, req.uid);
    const { data, error } = await supabaseForUser(req.accessToken)
      .from('categories')
      .select('*')
      .order('name');
    if (error) return res.status(500).json({ error: 'Database error' });
    res.json({ categories: data });
  } catch (err) {
    console.error('[CATEGORIES] GET error:', err.message);
    next({ status: 500, message: 'Failed to fetch categories' });
  }
});

// POST /v1/categories
router.post('/', async (req, res, next) => {
  const { name, parent_id, type, is_hidden, icon, color } = req.body;
  if (!name || !type) {
    return res.status(400).json({ error: 'name and type are required' });
  }
  if (!['income', 'expense', 'transfer'].includes(type)) {
    return res.status(400).json({ error: 'type must be income, expense, or transfer' });
  }
  try {
    const { data, error } = await supabaseForUser(req.accessToken)
      .from('categories')
      .insert({
        id: uuidv4(),
        user_id: req.uid,
        name,
        parent_id: parent_id || null,
        type,
        is_system: false,
        is_hidden: is_hidden || false,
        icon: icon || 'tag.fill',
        color: color || '#868E96',
      })
      .select()
      .single();
    if (error) return res.status(500).json({ error: 'Database error' });
    res.status(201).json({ category: data });
  } catch (err) {
    console.error('[CATEGORIES] POST error:', err.message);
    next({ status: 500, message: 'Failed to create category' });
  }
});

// PATCH /v1/categories/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const allowed = ['name', 'parent_id', 'type', 'is_hidden', 'icon', 'color'];
    const updates = { updated_at: new Date().toISOString() };
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const { data, error } = await supabaseForUser(req.accessToken)
      .from('categories')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error?.code === 'PGRST116') return res.status(404).json({ error: 'Category not found' });
    if (error) return res.status(500).json({ error: 'Database error' });
    res.json({ category: data });
  } catch (err) {
    console.error('[CATEGORIES] PATCH error:', err.message);
    next({ status: 500, message: 'Failed to update category' });
  }
});

// DELETE /v1/categories/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { data, error: fetchErr } = await supabaseForUser(req.accessToken)
      .from('categories')
      .select('is_system')
      .eq('id', req.params.id)
      .single();
    if (fetchErr?.code === 'PGRST116') return res.status(404).json({ error: 'Category not found' });
    if (fetchErr) return res.status(500).json({ error: 'Database error' });
    if (data.is_system) return res.status(403).json({ error: 'Cannot delete system categories' });

    const { error } = await supabaseForUser(req.accessToken)
      .from('categories')
      .delete()
      .eq('id', req.params.id);
    if (error) return res.status(500).json({ error: 'Database error' });
    res.json({ success: true });
  } catch (err) {
    console.error('[CATEGORIES] DELETE error:', err.message);
    next({ status: 500, message: 'Failed to delete category' });
  }
});

module.exports = router;
