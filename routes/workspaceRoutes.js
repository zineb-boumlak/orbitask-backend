const express = require('express');
const router = express.Router();
const Workspace = require('../models/Workspace');
const Table = require('../models/Table');
const User = require('../models/User');
const Task = require('../models/Task');
const authenticate = require('../Middleware/authMiddleware');
const checkWorkspaceAccess = require('../Middleware/checkWorkspaceAccess');
const mongoose = require('mongoose');

// ─── Validation ──────────────────────────────────────────────────────────────
const validateWorkspaceInput = (data) => {
  const errors = {};
  if (!data.name || data.name.trim() === '') {
    errors.name = 'Le nom est requis';
  } else if (data.name.length > 100) {
    errors.name = 'Le nom ne peut dépasser 100 caractères';
  }
  if (data.description && data.description.length > 500) {
    errors.description = 'La description ne peut dépasser 500 caractères';
  }
  return { errors, isValid: Object.keys(errors).length === 0 };
};

// ─── POST / — Créer un workspace ─────────────────────────────────────────────
router.post('/', authenticate, async (req, res) => {
  try {
    const { errors, isValid } = validateWorkspaceInput(req.body);
    if (!isValid) return res.status(400).json({ success: false, errors });

    const workspace = new Workspace({
      name: req.body.name.trim(),
      description: req.body.description?.trim() || '',
      owner: req.user._id,
      members: [{ user: req.user._id, role: 'admin' }]
    });

    await workspace.save();

    const defaultTable = await Table.create({
      name: 'Première Table',
      workspace: workspace._id,
      userId: req.user._id
    });

    const populated = await Workspace.findById(workspace._id)
      .populate('owner', 'name email')
      .populate('members.user', 'name email');

    res.status(201).json({
      success: true,
      data: { ...populated.toObject(), defaultTable }
    });
  } catch (err) {
    console.error('Erreur création workspace:', err);
    if (err instanceof mongoose.Error.ValidationError) {
      const errors = Object.fromEntries(
        Object.entries(err.errors).map(([k, v]) => [k, v.message])
      );
      return res.status(400).json({ success: false, errors });
    }
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ─── GET / — Tous les workspaces de l'utilisateur ────────────────────────────
router.get('/', authenticate, async (req, res) => {
  try {
    const workspaces = await Workspace.find({
      $or: [{ owner: req.user._id }, { 'members.user': req.user._id }]
    })
      .populate('owner', 'name email')
      .populate('members.user', 'name email')
      .sort('-updatedAt');

    res.json({ success: true, data: workspaces });
  } catch (err) {
    console.error('Erreur récupération workspaces:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ─── GET /:id — Un workspace par ID ──────────────────────────────────────────
router.get('/:id', authenticate, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    const workspace = await Workspace.findById(req.params.id)
      .populate('owner', 'name email')
      .populate('members.user', 'name email');

    if (!workspace) {
      return res.status(404).json({ success: false, error: 'Workspace introuvable' });
    }
    if (!workspace.hasAccess(req.user._id)) {
      return res.status(403).json({ success: false, error: 'Accès non autorisé' });
    }

    res.json({ success: true, data: workspace });
  } catch (err) {
    console.error('Erreur récupération workspace:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ─── GET /:workspaceId/members — Membres ─────────────────────────────────────
router.get('/:workspaceId/members', authenticate, checkWorkspaceAccess, async (req, res) => {
  try {
    const workspace = req.workspace;

    const ownerEntry = {
      user: workspace.owner,
      role: 'admin',
      joinedAt: workspace.createdAt
    };

    const membersList = workspace.members
      .filter(m => !m.user._id.equals(workspace.owner._id))
      .map(m => ({ user: m.user, role: m.role, joinedAt: m.joinedAt }));

    res.json({ success: true, data: [ownerEntry, ...membersList] });
  } catch (err) {
    console.error('Erreur membres:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ─── POST /:workspaceId/invite — Inviter un membre ───────────────────────────
router.post('/:workspaceId/invite', authenticate, async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { email } = req.body;

    if (!mongoose.Types.ObjectId.isValid(workspaceId)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email requis' });
    }

    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return res.status(404).json({ success: false, error: 'Workspace introuvable' });
    }
    if (!workspace.owner.equals(req.user._id)) {
      return res.status(403).json({ success: false, error: 'Seul le propriétaire peut inviter' });
    }

    const userToInvite = await User.findOne({ email: email.trim().toLowerCase() });
    if (!userToInvite) {
      return res.status(404).json({ success: false, error: 'Utilisateur introuvable' });
    }

    const isAlreadyMember = workspace.members.some(m => m.user.equals(userToInvite._id));
    const isOwner = workspace.owner.equals(userToInvite._id);
    if (isAlreadyMember || isOwner) {
      return res.status(400).json({ success: false, error: 'Utilisateur déjà membre' });
    }

    workspace.members.push({ user: userToInvite._id, role: 'member' });
    await workspace.save();

    const populated = await Workspace.findById(workspace._id)
      .populate('owner', 'name email')
      .populate('members.user', 'name email');

    res.json({ success: true, message: 'Membre ajouté', data: populated });
  } catch (err) {
    console.error('Erreur invitation:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ─── GET /:workspaceId/tables ─────────────────────────────────────────────────
router.get('/:workspaceId/tables', authenticate, checkWorkspaceAccess, async (req, res) => {
  try {
    const tables = await Table.find({ workspace: req.params.workspaceId })
      .sort('-createdAt')
      .populate('userId', 'name email');

    res.json({ success: true, data: tables });
  } catch (err) {
    console.error('Erreur tables:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ─── POST /:workspaceId/tables ────────────────────────────────────────────────
router.post('/:workspaceId/tables', authenticate, checkWorkspaceAccess, async (req, res) => {
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

// ─── PUT /:workspaceId/tables/:tableId ───────────────────────────────────────
router.put('/:workspaceId/tables/:tableId', authenticate, checkWorkspaceAccess, async (req, res) => {
  try {
    if (!req.body.name?.trim()) {
      return res.status(400).json({ success: false, error: 'Nom requis' });
    }
    if (!mongoose.Types.ObjectId.isValid(req.params.tableId)) {
      return res.status(400).json({ success: false, error: 'ID table invalide' });
    }

    const table = await Table.findOneAndUpdate(
      { _id: req.params.tableId, workspace: req.params.workspaceId },
      { name: req.body.name.trim() },
      { new: true, runValidators: true }
    );

    if (!table) {
      return res.status(404).json({ success: false, error: 'Table introuvable' });
    }

    res.json({ success: true, data: table });
  } catch (err) {
    console.error('Erreur mise à jour table:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ─── DELETE /:workspaceId/tables/:tableId ────────────────────────────────────
router.delete('/:workspaceId/tables/:tableId', authenticate, checkWorkspaceAccess, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.tableId)) {
      return res.status(400).json({ success: false, error: 'ID table invalide' });
    }

    const workspace = req.workspace;
    if (!workspace.owner._id.equals(req.user._id)) {
      return res.status(403).json({ success: false, error: 'Seul le propriétaire peut supprimer' });
    }

    const table = await Table.findOne({
      _id: req.params.tableId,
      workspace: req.params.workspaceId
    });

    if (!table) {
      return res.status(404).json({ success: false, error: 'Table introuvable' });
    }

    await Task.deleteMany({ tableId: table._id });
    await Table.findByIdAndDelete(req.params.tableId);

    res.json({ success: true, message: 'Table supprimée' });
  } catch (err) {
    console.error('Erreur suppression table:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

module.exports = router;