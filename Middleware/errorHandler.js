// server/Middleware/errorHandler.js
module.exports = (err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}`, err.stack);
  
  if (err.name === 'ValidationError') {
    const errors = Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v.message]));
    return res.status(400).json({ success: false, errors });
  }
  if (err.name === 'CastError') {
    return res.status(400).json({ success: false, error: 'ID invalide' });
  }
  if (err.code === 11000) {
    return res.status(409).json({ success: false, error: 'Valeur déjà utilisée' });
  }
  
  res.status(err.statusCode || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Erreur serveur' : err.message
  });
};