const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  role: {
    type: String,
    enum: ['admin', 'member'],
    default: 'member'
  },
  joinedAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const workspaceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Le nom est obligatoire'],
    trim: true,
    maxlength: [100, 'Le nom ne peut dépasser 100 caractères']
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  description: {
    type: String,
    default: '',
    maxlength: [500, 'La description ne peut dépasser 500 caractères']
  },
  tables: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Table'
  }],
  members: [memberSchema]
}, {
  timestamps: true
});

// Vérifie si un user est membre ou owner
workspaceSchema.methods.hasAccess = function(userId) {
  const isOwner  = this.owner.equals(userId);
  const isMember = this.members.some(m => m.user.equals(userId));
  return isOwner || isMember;
};

module.exports = mongoose.model('Workspace', workspaceSchema);