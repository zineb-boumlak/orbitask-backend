const express = require('express');
const router = express.Router({ mergeParams: true });
const Table = require('../models/Table');
const Task = require('../models/Task');
const authenticate = require('../Middleware/authMiddleware'); // FIX: M majuscule (cohérent avec le dossier Middleware/)
const checkWorkspaceAccess = require('../Middleware/checkWorkspaceAccess');
const mongoose = require('mongoose');

// ─── GET / — Toutes les tables d'un workspace ─────────────────────────────────
router.get('/', authenticate, checkWorkspaceAccess, async (req, res) => {
  try {
    const tables = await Table.find({ workspace: req.params.workspaceId })
      .sort('-createdAt')
      .populate('userId', 'name email');

    res.json({ success: true, data: tables });
  } catch (err) {
    console.error('Erreur récupération tables:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ─── GET /:tableId — Une table spécifique ────────────────────────────────────
router.get('/:tableId', authenticate, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.tableId)) {
      return res.status(400).json({ success: false, error: 'ID table invalide' });
    }

    const table = await Table.findById(req.params.tableId)
      .populate('userId', 'name email')
      .populate('workspace', 'name');

    if (!table) {
      return res.status(404).json({ success: false, error: 'Table introuvable' });
    }

    res.json({ success: true, data: table });
  } catch (err) {
    console.error('Erreur récupération table:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ─── POST / — Créer une table ─────────────────────────────────────────────────
router.post('/', authenticate, checkWorkspaceAccess, async (req, res) => {
  try {
    if (!req.body.name?.trim()) {
      return res.status(400).json({ success: false, error: 'Nom de table requis' });
    }

    const table = await Table.create({
      name: req.body.name.trim(),
      workspace: req.params.workspaceId,
      userId: req.user._id
    });

    res.status(201).json({ success: true, data: table });
  } catch (err) {
    console.error('Erreur création table:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ─── GET /:tableId/tasks — Tâches d'une table ────────────────────────────────
router.get('/:tableId/tasks', authenticate, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.tableId)) {
      return res.status(400).json({ success: false, error: 'ID table invalide' });
    }

    const tasks = await Task.find({ tableId: req.params.tableId })
      .sort('position -createdAt')
      .populate('userId', 'name email')
      .populate('comments.userId', 'name email');

    res.json({ success: true, data: tasks });
  } catch (err) {
    console.error('Erreur récupération tâches:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

module.exports = router;