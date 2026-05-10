require('dotenv').config();
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

app.use(cors());
app.use(express.json({ limit: '80mb' }));
app.use(express.urlencoded({ extended: true, limit: '80mb' }));
app.use(express.static(path.join(__dirname, 'public')));

mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/isaac_portfolio')
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err.message));

const commentSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  text: { type: String, required: true, trim: true },
  time: { type: Date, default: Date.now }
});

const projectSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  category: { type: String, required: true, trim: true },
  desc: { type: String, default: '', trim: true },
  emoji: { type: String, default: '✨' },
  media: {
    type: { type: String, enum: ['youtube', 'video', 'image', null], default: null },
    data: { type: String, default: null }
  },
  likesCount: { type: Number, default: 0 },
  comments: [commentSchema]
}, { timestamps: true });

projectSchema.set('toJSON', {
  virtuals: true,
  transform: (_, ret) => {
    ret.id = ret._id.toString();
    ret.commentsCount = ret.comments ? ret.comments.length : 0;
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

const hireRequestSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true },
  service: { type: String, required: true, trim: true },
  budget: { type: String, default: '', trim: true },
  message: { type: String, required: true, trim: true },
  status: { type: String, enum: ['new', 'read', 'contacted', 'closed'], default: 'new' }
}, { timestamps: true });

const counterSchema = new mongoose.Schema({
  key: { type: String, unique: true },
  value: { type: Number, default: 0 }
});

const Project = mongoose.model('Project', projectSchema);
const HireRequest = mongoose.model('HireRequest', hireRequestSchema);
const Counter = mongoose.model('Counter', counterSchema);

async function sendHireEmailAlert(hire) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, ALERT_EMAIL } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !ALERT_EMAIL) {
    console.log('ℹ️ Email alert skipped: SMTP variables not configured');
    return;
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });

  const safe = (value) => String(value || '').replace(/[<>]/g, '');
  await transporter.sendMail({
    from: `"Isaac Portfolio" <${SMTP_USER}>`,
    to: ALERT_EMAIL,
    replyTo: safe(hire.email),
    subject: `New Hire Request: ${safe(hire.service)} — ${safe(hire.name)}`,
    text:
`New hire request from your portfolio website:

Name: ${safe(hire.name)}
Email: ${safe(hire.email)}
Service: ${safe(hire.service)}
Budget: ${safe(hire.budget) || 'Not provided'}

Message:
${safe(hire.message)}

Open your admin dashboard:
${process.env.PUBLIC_SITE_URL || ''}`,
    html:
`<h2>New Hire Request</h2>
<p><b>Name:</b> ${safe(hire.name)}</p>
<p><b>Email:</b> ${safe(hire.email)}</p>
<p><b>Service:</b> ${safe(hire.service)}</p>
<p><b>Budget:</b> ${safe(hire.budget) || 'Not provided'}</p>
<p><b>Message:</b></p>
<p>${safe(hire.message).replace(/\n/g, '<br>')}</p>`
  });
}

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Missing token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }
}

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (username === process.env.ADMIN_USER && password === process.env.ADMIN_PASS) {
    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({ token });
  }
  res.status(401).json({ message: 'Invalid username or password' });
});

app.get('/api/projects', async (_req, res) => {
  const projects = await Project.find().sort({ createdAt: -1 });
  res.json(projects);
});

app.post('/api/projects', auth, async (req, res) => {
  const project = await Project.create(req.body);
  res.status(201).json(project);
});

app.patch('/api/projects/:id', auth, async (req, res) => {
  const project = await Project.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!project) return res.status(404).json({ message: 'Project not found' });
  res.json(project);
});

app.delete('/api/projects/:id', auth, async (req, res) => {
  const deleted = await Project.findByIdAndDelete(req.params.id);
  if (!deleted) return res.status(404).json({ message: 'Project not found' });
  res.json({ ok: true });
});

app.post('/api/projects/:id/like', async (req, res) => {
  const delta = req.body.liked ? 1 : -1;
  const project = await Project.findByIdAndUpdate(
    req.params.id,
    { $inc: { likesCount: delta } },
    { new: true }
  );
  if (!project) return res.status(404).json({ message: 'Project not found' });
  if (project.likesCount < 0) {
    project.likesCount = 0;
    await project.save();
  }
  res.json({ likesCount: project.likesCount });
});

app.get('/api/projects/:id/comments', async (req, res) => {
  const project = await Project.findById(req.params.id);
  if (!project) return res.status(404).json({ message: 'Project not found' });
  res.json(project.comments.sort((a, b) => a.time - b.time));
});

app.post('/api/projects/:id/comments', async (req, res) => {
  const { name, text } = req.body;
  if (!name || !text) return res.status(400).json({ message: 'Name and comment are required' });
  const project = await Project.findById(req.params.id);
  if (!project) return res.status(404).json({ message: 'Project not found' });
  project.comments.push({ name, text });
  await project.save();
  res.status(201).json(project.comments[project.comments.length - 1]);
});

app.post('/api/hire', async (req, res) => {
  const { name, email, service, message } = req.body;
  if (!name || !email || !service || !message) return res.status(400).json({ message: 'Missing required fields' });
  const saved = await HireRequest.create(req.body);
  sendHireEmailAlert(saved).catch(err => console.error('Email alert error:', err.message));
  res.status(201).json({ ok: true, id: saved._id });
});

app.get('/api/hire', auth, async (_req, res) => {
  const requests = await HireRequest.find().sort({ createdAt: -1 });
  res.json(requests);
});

app.get('/api/hire/stats', auth, async (_req, res) => {
  const [total, unread, contacted] = await Promise.all([
    HireRequest.countDocuments(),
    HireRequest.countDocuments({ status: 'new' }),
    HireRequest.countDocuments({ status: 'contacted' })
  ]);
  res.json({ total, unread, contacted });
});

app.patch('/api/hire/:id', auth, async (req, res) => {
  const allowed = ['new', 'read', 'contacted', 'closed'];
  const status = req.body.status;
  if (!allowed.includes(status)) return res.status(400).json({ message: 'Invalid status' });
  const request = await HireRequest.findByIdAndUpdate(req.params.id, { status }, { new: true });
  if (!request) return res.status(404).json({ message: 'Hire request not found' });
  res.json(request);
});

app.delete('/api/hire/:id', auth, async (req, res) => {
  const deleted = await HireRequest.findByIdAndDelete(req.params.id);
  if (!deleted) return res.status(404).json({ message: 'Hire request not found' });
  res.json({ ok: true });
});

app.post('/api/views', async (_req, res) => {
  const counter = await Counter.findOneAndUpdate(
    { key: 'views' },
    { $inc: { value: 1 } },
    { upsert: true, new: true }
  );
  res.json({ views: counter.value });
});

app.get('/api/views', async (_req, res) => {
  const counter = await Counter.findOne({ key: 'views' });
  res.json({ views: counter ? counter.value : 0 });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
