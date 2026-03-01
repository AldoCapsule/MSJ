'use strict';
const express = require('express');
const router = express.Router();
const { verifyFirebaseToken } = require('../../middleware/auth');
const { supabaseForUser } = require('../../db');

router.use(verifyFirebaseToken);

const DEFAULTS = {
  current_age: 30,
  retirement_age: 65,
  current_savings: 0,
  monthly_contribution: 500,
  expected_annual_return: 0.07,
  target_amount: 2000000,
};

// GET /v1/retirement
router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabaseForUser(req.accessToken)
      .from('retirement_settings')
      .select('*')
      .eq('user_id', req.uid)
      .maybeSingle();

    if (error) throw error;
    res.json({ user_id: req.uid, ...DEFAULTS, ...(data || {}) });
  } catch (err) {
    next({ status: 500, message: 'Failed to fetch retirement settings' });
  }
});

// PUT /v1/retirement
router.put('/', async (req, res, next) => {
  const allowed = ['current_age', 'retirement_age', 'current_savings',
    'monthly_contribution', 'expected_annual_return', 'target_amount'];
  const updates = { user_id: req.uid };
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = Number(req.body[key]);
  }

  try {
    const { error } = await supabaseForUser(req.accessToken)
      .from('retirement_settings')
      .upsert(updates, { onConflict: 'user_id' });

    if (error) throw error;
    res.json({ ...DEFAULTS, ...updates });
  } catch (err) {
    next({ status: 500, message: 'Failed to save retirement settings' });
  }
});

module.exports = router;
