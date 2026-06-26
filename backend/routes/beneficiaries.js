const express = require('express');
const router = express.Router();
const { dbAll, dbGet, dbRun } = require('../utils/helpers');
const { memberAuthRequired } = require('../middleware/auth');

// GET /api/member/me/beneficiaries
router.get('/', memberAuthRequired, async (req, res) => {
    try {
        const rows = await dbAll('SELECT * FROM member_beneficiaries WHERE memberId = ?', [req.member.id]);
        res.json({ beneficiaries: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/member/me/beneficiaries (Add or Update)
router.post('/', memberAuthRequired, async (req, res) => {
    const { id, name, relationship, phone, allocationPercentage, idNumber } = req.body;
    if (!name || !relationship) {
        return res.status(400).json({ error: 'Name and relationship are required.' });
    }

    try {
        if (id) {
            // Update
            await dbRun(
                'UPDATE member_beneficiaries SET name = ?, relationship = ?, phone = ?, allocationPercentage = ?, idNumber = ? WHERE id = ? AND memberId = ?',
                [name, relationship, phone, allocationPercentage || 0, idNumber, id, req.member.id]
            );
            res.json({ message: 'Beneficiary updated successfully.' });
        } else {
            // Add
            const r = await dbRun(
                'INSERT INTO member_beneficiaries (memberId, name, relationship, phone, allocationPercentage, idNumber) VALUES (?, ?, ?, ?, ?, ?)',
                [req.member.id, name, relationship, phone, allocationPercentage || 0, idNumber]
            );
            res.json({ id: r.lastID, message: 'Beneficiary added successfully.' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/member/me/beneficiaries/:id
router.delete('/:id', memberAuthRequired, async (req, res) => {
    try {
        await dbRun('DELETE FROM member_beneficiaries WHERE id = ? AND memberId = ?', [req.params.id, req.member.id]);
        res.json({ message: 'Beneficiary removed.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
