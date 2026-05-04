// routes/taskRoutes.js
const express = require('express');
const router = express.Router({ mergeParams: true });
const Task = require('../models/Task');
const Workspace = require('../models/Workspace');
const Table = require('../models/Table');
const authenticate = require('../Middleware/authMiddleware');
const mongoose = require('mongoose');

// ── Helper: vérifier accès workspace via tableId ─────────────────────────────
async function checkTableAccess(req, res) {
  const { tableId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(tableId))
    return res.status(400).json({ success: false, error: 'ID table invalide' });

  const table = await Table.findById(tableId);
  if (!table) return res.status(404).json({ success: false, error: 'Table introuvable' });

  const workspace = await Workspace.findById(table.workspace);
  if (!workspace) return res.status(404).json({ success: false, error: 'Workspace introuvable' });

  const isOwner  = workspace.owner.equals(req.user._id);
  const isMember = workspace.members.some(m => m.user.equals(req.user._id));
  if (!isOwner && !isMember)
    return res.status(403).json({ success: false, error: 'Accès non autorisé' });

  return { table, workspace, isOwner };
}

// ── GET /:tableId/tasks ───────────────────────────────────────────────────────
router.get('/:tableId/tasks', authenticate, async (req, res, next) => {
  try {
    const access = await checkTableAccess(req, res);
    if (!access) return;

    const tasks = await Task.find({ tableId: req.params.tableId })
      .sort('position -createdAt')
      .populate('userId', 'name email')
      .populate('assignees', 'name email')
      .populate('comments.userId', 'name email')
      .populate('activity.userId', 'name email');

    res.json({ success: true, data: tasks });
  } catch (err) { next(err); }
});

// ── POST /:tableId/tasks ──────────────────────────────────────────────────────
router.post('/:tableId/tasks', authenticate, async (req, res, next) => {
  try {
    const access = await checkTableAccess(req, res);
    if (!access) return;

    const { title, status = 'todo', color = '#ffffff', deadline = null, priority = 'medium', assignees = [], labels = [] } = req.body;
    if (!title?.trim())
      return res.status(400).json({ success: false, error: 'Titre requis' });

    const position = await Task.countDocuments({ tableId: req.params.tableId });

    const task = await Task.create({
      title: title.trim(),
      tableId: req.params.tableId,
      userId: req.user._id,
      status, color, deadline, priority,
      assignees,
      labels,
      position,
      activity: [{ userId: req.user._id, action: 'created', detail: `Tâche créée` }],
    });

    const populated = await Task.findById(task._id)
      .populate('userId', 'name email')
      .populate('assignees', 'name email')
      .populate('comments.userId', 'name email')
      .populate('activity.userId', 'name email');

    res.status(201).json({ success: true, data: populated });
  } catch (err) { next(err); }
});

// ── PUT /:tableId/tasks/:taskId ───────────────────────────────────────────────
router.put('/:tableId/tasks/:taskId', authenticate, async (req, res, next) => {
  try {
    const access = await checkTableAccess(req, res);
    if (!access) return;

    const { taskId, tableId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(taskId))
      return res.status(400).json({ success: false, error: 'ID tâche invalide' });

    const { title, status, color, position, deadline, priority, assignees, labels } = req.body;

    const current = await Task.findOne({ _id: taskId, tableId });
    if (!current) return res.status(404).json({ success: false, error: 'Tâche introuvable' });

    // Build activity log
    const activityEntry = { userId: req.user._id, action: 'updated', detail: '' };
    if (status && status !== current.status) {
      const LABELS = { todo: 'À faire', doing: 'En cours', done: 'Terminé' };
      activityEntry.action = 'moved';
      activityEntry.detail = `Déplacé de "${LABELS[current.status]}" vers "${LABELS[status]}"`;
    }

    const update = {};
    if (title !== undefined)     update.title    = title.trim();
    if (status !== undefined)    update.status   = status;
    if (color !== undefined)     update.color    = color;
    if (position !== undefined)  update.position = position;
    if (deadline !== undefined)  update.deadline = deadline;
    if (priority !== undefined)  update.priority = priority;
    if (assignees !== undefined) update.assignees = assignees;
    if (labels !== undefined)    update.labels   = labels;

    const task = await Task.findOneAndUpdate(
      { _id: taskId, tableId },
      {
        ...update,
        $push: { activity: activityEntry },
      },
      { new: true, runValidators: true }
    )
      .populate('userId', 'name email')
      .populate('assignees', 'name email')
      .populate('comments.userId', 'name email')
      .populate('activity.userId', 'name email');

    res.json({ success: true, data: task });
  } catch (err) { next(err); }
});

// ── DELETE /:tableId/tasks/:taskId ────────────────────────────────────────────
router.delete('/:tableId/tasks/:taskId', authenticate, async (req, res, next) => {
  try {
    const access = await checkTableAccess(req, res);
    if (!access) return;

    const { taskId, tableId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(taskId))
      return res.status(400).json({ success: false, error: 'ID tâche invalide' });

    const task = await Task.findOneAndDelete({ _id: taskId, tableId });
    if (!task) return res.status(404).json({ success: false, error: 'Tâche introuvable' });

    res.json({ success: true, message: 'Tâche supprimée' });
  } catch (err) { next(err); }
});

// ── POST /:tableId/tasks/:taskId/comments ────────────────────────────────────
router.post('/:tableId/tasks/:taskId/comments', authenticate, async (req, res, next) => {
  try {
    const access = await checkTableAccess(req, res);
    if (!access) return;

    const { taskId, tableId } = req.params;
    const { text } = req.body;
    if (!text?.trim())
      return res.status(400).json({ success: false, error: 'Texte requis' });

    const task = await Task.findOneAndUpdate(
      { _id: taskId, tableId },
      {
        $push: {
          comments: { text: text.trim(), userId: req.user._id },
          activity: { userId: req.user._id, action: 'commented', detail: text.trim().slice(0, 80) },
        }
      },
      { new: true }
    )
      .populate('comments.userId', 'name email')
      .populate('activity.userId', 'name email');

    if (!task) return res.status(404).json({ success: false, error: 'Tâche introuvable' });

    res.status(201).json({ success: true, data: task.comments });
  } catch (err) { next(err); }
});

module.exports = router;