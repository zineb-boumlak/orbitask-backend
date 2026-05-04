// models/Task.js
const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  text:      { type: String, required: true, trim: true },
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
});

const activitySchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  action:    { type: String, required: true }, // 'moved', 'assigned', 'commented', 'created'
  detail:    { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});

const taskSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Le titre est obligatoire'],
    trim: true,
    maxlength: [200, 'Le titre ne peut dépasser 200 caractères'],
  },
  status: {
    type: String,
    enum: ['todo', 'doing', 'done'],
    default: 'todo',
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium',
  },
  color: { type: String, default: '#ffffff' },
  position: { type: Number, default: 0 },
  deadline: { type: Date, default: null },

  // ── Labels ────────────────────────────────────────────────────────────────
  labels: [{
    name:  { type: String, required: true, trim: true },
    color: { type: String, default: '#7c3aed' },
  }],

  // ── Assignees ─────────────────────────────────────────────────────────────
  assignees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  // ── Relations ─────────────────────────────────────────────────────────────
  tableId: { type: mongoose.Schema.Types.ObjectId, ref: 'Table', required: true },
  userId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // ── Social ────────────────────────────────────────────────────────────────
  comments: [commentSchema],
  activity: [activitySchema],
}, { timestamps: true });

module.exports = mongoose.model('Task', taskSchema);