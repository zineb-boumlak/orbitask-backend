const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authMiddleware = async (req, res, next) => {
  try {
    let token;

    // Priorité au cookie httpOnly, fallback sur le header Authorization
    if (req.cookies?.token) {
      token = req.cookies.token;
    } else if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Authentification requise'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Utilisateur introuvable'
      });
    }

    if (!user.active) {
      return res.status(401).json({
        success: false,
        error: 'Compte désactivé'
      });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expired'
      });
    }
    return res.status(401).json({
      success: false,
      error: 'Token invalide'
    });
  }
};

module.exports = authMiddleware;