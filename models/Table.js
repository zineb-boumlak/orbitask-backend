const mongoose = require('mongoose');

// models/Table.js
const tableSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Le nom de la table est requis'],
    trim: true,
    maxlength: [100, 'Le nom ne peut pas dépasser 100 caractères']
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  workspace: {  // Champ unifié - toujours utiliser 'workspace'
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace', 
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Table', tableSchema);