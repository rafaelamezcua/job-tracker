require('dotenv').config();
const express = require('express');
const app = express();
const db = require('./database');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET;

app.use(express.json());


function authenticateToken(req, res, next) {
    const token = req.headers['authorization'];

    if (!token) {
        return res.json({ error: 'No token provided' });
    }

    try {
        const decoded = jwt.verify(token, SECRET);
        req.userId = decoded.userId;
        next();
    } catch {
        return res.json({ error: 'Invalid token' });
    }
}


app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/landing.html');
});

app.get('/dashboard', (req, res) => {
    res.sendFile(__dirname + '/public/dashboard.html');
});

app.get('/landing', (req, res) => {
    res.sendFile(__dirname + '/public/landing.html');
});

app.get('/login', (req, res) => {
    res.sendFile(__dirname + '/public/login.html');
});

app.get('/calendar', (req, res) => {
    res.sendFile(__dirname + '/public/calendar.html');
});

app.use(express.static('public', { index: false }));

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

app.get('/stats/public', async (req, res) => {
    const result = await db.query('SELECT COUNT(*) AS total FROM applications');
    res.json({ total: parseInt(result.rows[0].total) });
});

app.post('/applications', authenticateToken, async (req, res) => {
    const { company, role, status, date, url, notes, tags } = req.body;
    const result = await db.query(
        'INSERT INTO applications (userId, company, role, status, date, url, notes, tags) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
        [req.userId, company, role, status, date, url, notes, tags || null]
    );
    res.json({ message: 'Application added successfully', id: result.rows[0].id });
});

app.get('/applications', authenticateToken, async (req, res) => {
    const result = await db.query(
        'SELECT * FROM applications WHERE userId = $1',
        [req.userId]
    );
    res.json(result.rows);
});

app.get('/applications/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const result = await db.query(
        'SELECT * FROM applications WHERE id = $1 AND userId = $2',
        [id, req.userId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
});

app.put('/applications/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { company, role, status, date, url, notes, interview_date, tags } = req.body;
    const result = await db.query(
        'UPDATE applications SET company = $1, role = $2, status = $3, date = $4, url = $5, notes = $6, interview_date = $7, tags = $8 WHERE id = $9 AND userId = $10',
        [company, role, status, date, url, notes, interview_date || null, tags || null, id, req.userId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Application updated successfully' });
});

app.delete('/applications/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const result = await db.query(
        'DELETE FROM applications WHERE id = $1 AND userId = $2',
        [id, req.userId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Application deleted successfully' });
});

app.post('/register', async (req, res) => {
    const { email, password, name } = req.body;

    const existing = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existing.rows[0]) {
        return res.json({ error: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await db.query(
        'INSERT INTO users (email, password, name) VALUES ($1, $2, $3) RETURNING id',
        [email, hashedPassword, name]
    );

    res.json({ message: 'Account created!', id: result.rows[0].id });
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user) {
        return res.json({ error: 'Invalid email or password' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
        return res.json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ userId: user.id }, SECRET, { expiresIn: '7d' });
    res.json({ message: 'Logged in!', token: token, name: user.name });
});




