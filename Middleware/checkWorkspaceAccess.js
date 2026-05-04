const Workspace = require('../models/Workspace');
const mongoose = require('mongoose');

module.exports = async (req, res, next) => {
  try {
    const workspaceId = req.params.workspaceId || req.params.id;

    if (!workspaceId || !mongoose.Types.ObjectId.isValid(workspaceId)) {
      return res.status(400).json({ success: false, error: 'ID workspace invalide' });
    }

    const workspace = await Workspace.findById(workspaceId)
      .populate('owner', 'name email')
      .populate('members.user', 'name email');

    if (!workspace) {
      return res.status(404).json({ success: false, error: 'Workspace introuvable' });
    }

    const isOwner = workspace.owner._id.equals(req.user._id);
    const isMember = workspace.members.some(m => m.user && m.user._id.equals(req.user._id));

    if (!isOwner && !isMember) {
      return res.status(403).json({ success: false, error: 'Accès non autorisé' });
    }

    req.workspace = workspace;
    next();
  } catch (err) {
    console.error('checkWorkspaceAccess error:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
};