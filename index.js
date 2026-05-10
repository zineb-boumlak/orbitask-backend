require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');

const User = require('./models/User');
const taskRoutes = require('./routes/taskRoutes');
const workspaceRoutes = require('./routes/workspaceRoutes');
const tableRoutes = require('./routes/tables');

if (!process.env.JWT_SECRET) {
  console.error('❌ JWT_SECRET est requis');
  process.exit(1);
}

const app = express();

const allowedOrigins = [
  'https://orbitask-frontend.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
];

const corsOptions = {
  origin: (origin, callback) => {
    // allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS bloqué pour: ${origin}`), false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};

// CORS EN PREMIER — avant helmet et tout le reste
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // preflight explicite

// Helmet APRES cors
app.use(helmet({ crossOriginResourcePolicy: false, crossOriginOpenerPolicy: false }));
app.use(mongoSanitize());
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

// ─── Connexion MongoDB ────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/orbitask')
  .then(() => console.log('✅ MongoDB connecté'))
  .catch(err => { console.error('❌ Erreur MongoDB:', err); process.exit(1); });

// ─── Rate limiting ────────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, error: 'Trop de tentatives, réessayez dans 15 minutes' }
});

// ─── Utilitaire JWT ──────────────────────────────────────────────────────────
const generateToken = (id) => jwt.sign(
  { id },
  process.env.JWT_SECRET,
  { expiresIn: process.env.JWT_EXPIRE || '24h' }
);

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000
};

// ─── Route : Inscription ──────────────────────────────────────────────────────
app.post('/register', authLimiter, async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ success: false, error: 'Tous les champs sont requis' });
    if (password.length < 8)
      return res.status(400).json({ success: false, error: 'Mot de passe : 8 caractères minimum' });

    const existing = await User.findOne({ email: email.trim().toLowerCase() });
    if (existing)
      return res.status(409).json({ success: false, error: 'Email déjà utilisé' });

    const user = await User.create({ name: name.trim(), email: email.trim().toLowerCase(), password });
    const token = generateToken(user._id);

    res.status(201).cookie('token', token, cookieOptions).json({
      success: true, token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    console.error('Erreur inscription:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ─── Route : Connexion ────────────────────────────────────────────────────────
app.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ success: false, error: 'Email et mot de passe requis' });

    const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+password');
    if (!user || !(await user.comparePassword(password)))
      return res.status(401).json({ success: false, error: 'Identifiants incorrects' });
    if (!user.active)
      return res.status(401).json({ success: false, error: 'Compte désactivé' });

    const token = generateToken(user._id);
    res.status(200).cookie('token', token, cookieOptions).json({
      success: true, token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    console.error('Erreur connexion:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ─── Route : Déconnexion ──────────────────────────────────────────────────────
app.post('/logout', (req, res) => {
  res.clearCookie('token', { ...cookieOptions, maxAge: 0 }).json({ success: true, message: 'Déconnecté' });
});

// ─── Routes API ───────────────────────────────────────────────────────────────
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/tables', tableRoutes);
app.use('/api/tables', taskRoutes);

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.all('*', (req, res) => {
  res.status(404).json({ success: false, error: `Route ${req.originalUrl} introuvable` });
});

// ─── Erreurs globales ─────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Erreur serveur:', err.stack);
  res.status(500).json({ success: false, error: 'Erreur serveur interne' });
});

// ─── Démarrage ────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 Serveur sur http://localhost:${PORT}`));