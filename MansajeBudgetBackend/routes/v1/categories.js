const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const { verifyFirebaseToken } = require('../../middleware/auth');

const db = () => admin.firestore();

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

// Seed system categories for a new user if collection is empty
async function ensureSystemCategories(uid) {
  const col = db().collection('users').doc(uid).collection('categories');
  const existing = await col.where('is_system', '==', true).limit(1).get();
  if (!existing.empty) return;

  const batch = db().batch();
  for (const cat of SYSTEM_CATEGORIES) {
    const ref = col.doc();
    batch.set(ref, {
      id: ref.id,
      user_id: uid,
      parent_id: null,
      is_system: true,
      is_hidden: false,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      ...cat,
    });
  }
  await batch.commit();
}

// GET /v1/categories
router.get('/', async (req, res, next) => {
  try {
    await ensureSystemCategories(req.uid);
    const snap = await db().collection('users').doc(req.uid)
      .collection('categories')
      .orderBy('name')
      .get();
    const categories = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ categories });
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
    const ref = db().collection('users').doc(req.uid).collection('categories').doc();
    const category = {
      id: ref.id,
      user_id: req.uid,
      name,
      parent_id: parent_id || null,
      type,
      is_system: false,
      is_hidden: is_hidden || false,
      icon: icon || 'tag.fill',
      color: color || '#868E96',
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    };
    await ref.set(category);
    res.status(201).json({ category });
  } catch (err) {
    console.error('[CATEGORIES] POST error:', err.message);
    next({ status: 500, message: 'Failed to create category' });
  }
});

// PATCH /v1/categories/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const ref = db().collection('users').doc(req.uid).collection('categories').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Category not found' });

    const updates = {};
    const allowed = ['name', 'parent_id', 'type', 'is_hidden', 'icon', 'color'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    await ref.update({ ...updates, updated_at: admin.firestore.FieldValue.serverTimestamp() });
    res.json({ category: { id: snap.id, ...snap.data(), ...updates } });
  } catch (err) {
    console.error('[CATEGORIES] PATCH error:', err.message);
    next({ status: 500, message: 'Failed to update category' });
  }
});

// DELETE /v1/categories/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const ref = db().collection('users').doc(req.uid).collection('categories').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Category not found' });
    if (snap.data().is_system) return res.status(403).json({ error: 'Cannot delete system categories' });
    await ref.delete();
    res.json({ success: true });
  } catch (err) {
    console.error('[CATEGORIES] DELETE error:', err.message);
    next({ status: 500, message: 'Failed to delete category' });
  }
});

module.exports = router;
