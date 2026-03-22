require('dotenv').config();
const express = require('express');
const app = express();
const db = require('./database');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const SECRET = process.env.JWT_SECRET;

if (!SECRET || SECRET.length < 32) {
    console.error('FATAL: JWT_SECRET is missing or too short. Set a strong 32+ character secret in your .env file.');
    process.exit(1);
}

// Security headers (CSP disabled — site uses inline scripts for animations)
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

app.use(express.json({ limit: '10kb' }));

// Rate limiting: auth endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    message: { error: 'Too many attempts. Please try again in 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false
});

// Rate limiting: general API
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: { error: 'Too many requests. Please slow down.' },
    standardHeaders: true,
    legacyHeaders: false
});

// Input validation helpers
function isValidEmail(email) {
    return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function isValidString(val, maxLen = 500) {
    return typeof val === 'string' && val.trim().length > 0 && val.length <= maxLen;
}

function isValidUrl(val) {
    if (!val) return true; // optional field
    if (typeof val !== 'string' || val.length > 2048) return false;
    try {
        const u = new URL(val);
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
        return false;
    }
}

const VALID_STATUSES = ['Applied', 'Interview', 'Offer', 'Rejected', 'Withdrawn', 'Saved'];

function authenticateToken(req, res, next) {
    const token = req.headers['authorization'];

    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }

    try {
        const decoded = jwt.verify(token, SECRET);
        req.userId = decoded.userId;
        next();
    } catch {
        return res.status(401).json({ error: 'Invalid token' });
    }
}


app.get('/', (_req, res) => {
    res.sendFile(__dirname + '/public/landing.html');
});

app.get('/dashboard', (_req, res) => {
    res.sendFile(__dirname + '/public/dashboard.html');
});

app.get('/landing', (_req, res) => {
    res.sendFile(__dirname + '/public/landing.html');
});

app.get('/login', (_req, res) => {
    res.sendFile(__dirname + '/public/login.html');
});

app.get('/calendar', (_req, res) => {
    res.sendFile(__dirname + '/public/calendar.html');
});

app.get('/quick-save', (_req, res) => {
    res.sendFile(__dirname + '/public/quick-save.html');
});

app.use(express.static('public', { index: false }));

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

app.get('/stats/public', apiLimiter, async (_req, res) => {
    try {
        const result = await db.query('SELECT COUNT(*) AS total FROM applications');
        res.json({ total: parseInt(result.rows[0].total) });
    } catch {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/applications', apiLimiter, authenticateToken, async (req, res) => {
    const { company, role, status, date, url, notes, tags, salary } = req.body;

    if (!isValidString(company, 200)) return res.status(400).json({ error: 'Invalid company name' });
    if (!isValidString(role, 200)) return res.status(400).json({ error: 'Invalid role' });
    if (!status || !VALID_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    if (!isValidString(date, 30)) return res.status(400).json({ error: 'Invalid date' });
    if (!isValidUrl(url)) return res.status(400).json({ error: 'Invalid URL — must start with http:// or https://' });
    if (notes && typeof notes !== 'string') return res.status(400).json({ error: 'Invalid notes' });
    if (notes && notes.length > 5000) return res.status(400).json({ error: 'Notes too long (max 5000 characters)' });
    if (tags && typeof tags !== 'string') return res.status(400).json({ error: 'Invalid tags' });
    if (tags && tags.length > 500) return res.status(400).json({ error: 'Tags too long' });
    if (salary && typeof salary !== 'string') return res.status(400).json({ error: 'Invalid salary' });
    if (salary && salary.length > 100) return res.status(400).json({ error: 'Salary too long' });

    try {
        const result = await db.query(
            'INSERT INTO applications (userId, company, role, status, date, url, notes, tags, salary) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id',
            [req.userId, company.trim(), role.trim(), status, date, url || null, notes || null, tags || null, salary || null]
        );
        res.json({ message: 'Application added successfully', id: result.rows[0].id });
    } catch {
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/applications', apiLimiter, authenticateToken, async (req, res) => {
    try {
        const result = await db.query(
            'SELECT * FROM applications WHERE userId = $1',
            [req.userId]
        );
        res.json(result.rows);
    } catch {
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/applications/:id', apiLimiter, authenticateToken, async (req, res) => {
    const { id } = req.params;
    if (isNaN(parseInt(id))) return res.status(400).json({ error: 'Invalid ID' });

    try {
        const result = await db.query(
            'SELECT * FROM applications WHERE id = $1 AND userId = $2',
            [id, req.userId]
        );
        if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
        res.json(result.rows[0]);
    } catch {
        res.status(500).json({ error: 'Server error' });
    }
});

app.put('/applications/:id', apiLimiter, authenticateToken, async (req, res) => {
    const { id } = req.params;
    if (isNaN(parseInt(id))) return res.status(400).json({ error: 'Invalid ID' });

    const { company, role, status, date, url, notes, interview_date, tags, salary } = req.body;

    if (!isValidString(company, 200)) return res.status(400).json({ error: 'Invalid company name' });
    if (!isValidString(role, 200)) return res.status(400).json({ error: 'Invalid role' });
    if (!status || !VALID_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    if (!isValidString(date, 30)) return res.status(400).json({ error: 'Invalid date' });
    if (!isValidUrl(url)) return res.status(400).json({ error: 'Invalid URL — must start with http:// or https://' });
    if (notes && typeof notes !== 'string') return res.status(400).json({ error: 'Invalid notes' });
    if (notes && notes.length > 5000) return res.status(400).json({ error: 'Notes too long (max 5000 characters)' });
    if (tags && typeof tags !== 'string') return res.status(400).json({ error: 'Invalid tags' });
    if (tags && tags.length > 500) return res.status(400).json({ error: 'Tags too long' });
    if (salary && typeof salary !== 'string') return res.status(400).json({ error: 'Invalid salary' });
    if (salary && salary.length > 100) return res.status(400).json({ error: 'Salary too long' });

    try {
        const result = await db.query(
            'UPDATE applications SET company = $1, role = $2, status = $3, date = $4, url = $5, notes = $6, interview_date = $7, tags = $8, salary = $9 WHERE id = $10 AND userId = $11',
            [company.trim(), role.trim(), status, date, url || null, notes || null, interview_date || null, tags || null, salary || null, id, req.userId]
        );
        if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
        res.json({ message: 'Application updated successfully' });
    } catch {
        res.status(500).json({ error: 'Server error' });
    }
});

app.delete('/applications/:id', apiLimiter, authenticateToken, async (req, res) => {
    const { id } = req.params;
    if (isNaN(parseInt(id))) return res.status(400).json({ error: 'Invalid ID' });

    try {
        const result = await db.query(
            'DELETE FROM applications WHERE id = $1 AND userId = $2',
            [id, req.userId]
        );
        if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
        res.json({ message: 'Application deleted successfully' });
    } catch {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/register', authLimiter, async (req, res) => {
    const { email, password, name } = req.body;

    if (!isValidEmail(email)) return res.status(400).json({ error: 'Invalid email address' });
    if (!name || typeof name !== 'string' || name.trim().length < 1 || name.length > 100) {
        return res.status(400).json({ error: 'Name is required (max 100 characters)' });
    }
    if (!password || typeof password !== 'string' || password.length < 8 || password.length > 128) {
        return res.status(400).json({ error: 'Password must be 8–128 characters' });
    }

    try {
        const existing = await db.query('SELECT id FROM users WHERE LOWER(email) = $1', [email.toLowerCase()]);
        if (existing.rows[0]) {
            return res.status(409).json({ error: 'Email already registered' });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const result = await db.query(
            'INSERT INTO users (email, password, name) VALUES ($1, $2, $3) RETURNING id',
            [email.toLowerCase(), hashedPassword, name.trim()]
        );

        res.status(201).json({ message: 'Account created!', id: result.rows[0].id });
    } catch {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/login', authLimiter, async (req, res) => {
    const { email, password } = req.body;

    if (!isValidEmail(email) || !password) {
        return res.status(400).json({ error: 'Invalid email or password' });
    }

    try {
        const result = await db.query('SELECT * FROM users WHERE LOWER(email) = $1', [email.toLowerCase()]);
        const user = result.rows[0];
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const token = jwt.sign({ userId: user.id }, SECRET, { expiresIn: '7d' });
        res.json({ message: 'Logged in!', token: token, name: user.name });
    } catch {
        res.status(500).json({ error: 'Server error' });
    }
});
