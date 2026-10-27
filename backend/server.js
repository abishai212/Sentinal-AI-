const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const aiEngine = require('./aiEngine');
const { CATEGORIES, normalizeCategory, detectCategoryFromProblem } = require('./categories');
const Expert = require('./models/Expert');
const Request = require('./models/Request');
const Message = require('./models/Message');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const port = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'sentinel_fallback_jwt_secret_key_2026';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || JWT_SECRET;

app.use(cors());
app.use(express.json());

// ─── IN-MEMORY FALLBACK STORE ────────────────────────────────────────────────
let dbConnected = false;
let memExperts = [];
let memRequests = [];
let memMessages = [];
let idCounter = 1000;

function generateId() {
  idCounter += 1;
  return `${Date.now()}-${idCounter}`;
}

mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ai_marketplace', { 
  serverSelectionTimeoutMS: 5000 
})
  .then(() => {
    dbConnected = true;
    console.log('✅ MongoDB connected successfully');
  })
  .catch(err => {
    console.warn('⚠️ MongoDB connection failed. Falling back to resilient IN-MEMORY DATABASE mode.');
    console.warn('Error details:', err.message);
  });

// ─── SEED DEFAULT TEST EXPERTS (In-Memory only if empty) ──────────────────────
async function seedDefaultExpertIfNeeded() {
  const hash = await bcrypt.hash('expert123', 10);
  const sampleExpert = {
    _id: 'sample-expert-101',
    name: 'Sarah Connor',
    email: 'sarah@sentinel.ai',
    phone: '+15551234567',
    passwordHash: hash,
    category: 'Software Developer',
    skills: ['Node.js', 'Debugging', 'React', 'Security Audits'],
    experience: 7,
    serviceArea: 'North America / Remote',
    bio: 'Senior systems engineer specializing in software debugging and cloud architecture.',
    profilePhoto: '',
    approvalStatus: 'approved',
    isOnline: true,
    rating: 4.9,
    ratingCount: 18,
    badges: ['Verified Specialist', 'Top Rated'],
    earningsBalance: 350,
    lat: 28.6139,
    lng: 77.2090,
    reviews: [
      { customerName: 'Alex M.', rating: 5, comment: 'Fixed our async memory leak within minutes. Brilliant!', date: new Date() }
    ],
    createdAt: new Date()
  };
  memExperts.push(sampleExpert);
}
seedDefaultExpertIfNeeded();

// ─── EMAIL & SMS HELPERS (Fail-safe) ──────────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'dummy@gmail.com',
    pass: process.env.EMAIL_PASS || 'dummy123'
  }
});

const sendEmail = async (to, subject, text) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log(`[Notification Fallback: Email to ${to}] Subject: ${subject}`);
    return;
  }
  try {
    await transporter.sendMail({
      from: `"Sentinel AI Services" <${process.env.EMAIL_USER}>`,
      to, subject, text
    });
    console.log(`✅ Email sent to ${to}`);
  } catch (err) {
    console.warn(`[Fail-safe] Email delivery failed: ${err.message}`);
  }
};

let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  try {
    const twilio = require('twilio');
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  } catch (e) {
    console.warn('[Fail-safe] Twilio init skipped:', e.message);
  }
}

const sendSMSAlert = async (toMobile, text) => {
  if (twilioClient && process.env.TWILIO_PHONE_NUMBER) {
    try {
      await twilioClient.messages.create({
        body: text,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: toMobile
      });
      console.log(`✅ SMS alert sent to ${toMobile}`);
    } catch (err) {
      console.warn(`[Fail-safe] SMS delivery failed: ${err.message}`);
    }
  } else {
    console.log(`[Notification Fallback: SMS to ${toMobile}] ${text}`);
  }
};

// ─── STATIC ASSETS & FILE UPLOADS ────────────────────────────────────────────
const publicPath = path.join(__dirname, '../frontend');
const uploadsPath = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsPath)) fs.mkdirSync(uploadsPath, { recursive: true });

app.get('/', (req, res) => {
  res.sendFile(path.join(publicPath, 'landing.html'));
});

app.use(express.static(publicPath, { index: 'landing.html' }));
app.use('/uploads', express.static(uploadsPath));

const uploadExtensionByMime = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp'
};
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsPath),
    filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}${uploadExtensionByMime[file.mimetype] || '.img'}`)
  }),
  limits: { fileSize: 10 * 1024 * 1024 }
});

// ─── AUTHENTICATION HELPERS & MIDDLEWARE ──────────────────────────────────────
const generateToken = (expert) => {
  return jwt.sign(
    { id: expert._id.toString(), email: expert.email, category: expert.category },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
};

const requireExpertAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Authentication required. Please log in.' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    let expert = null;
    if (dbConnected) {
      expert = await Expert.findById(decoded.id);
    } else {
      expert = memExperts.find(e => e._id.toString() === decoded.id.toString());
    }

    if (!expert) {
      return res.status(401).json({ success: false, error: 'Expert account not found.' });
    }

    req.expert = expert;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Session expired or invalid token. Please log in again.' });
  }
};

function safeCompare(value, expected) {
  const actual = Buffer.from(String(value || ''));
  const target = Buffer.from(String(expected || ''));
  if (actual.length !== target.length) return false;
  try {
    return crypto.timingSafeEqual(actual, target);
  } catch (err) {
    return actual.toString() === target.toString();
  }
}

function generateAdminToken() {
  return jwt.sign({ role: 'admin', username: ADMIN_USERNAME }, ADMIN_JWT_SECRET, { expiresIn: '8h' });
}

const requireAdminAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Admin authentication required.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, ADMIN_JWT_SECRET);
    if (decoded.role !== 'admin' || decoded.username !== ADMIN_USERNAME) {
      return res.status(403).json({ success: false, error: 'Invalid admin session.' });
    }

    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Admin session is invalid or expired.' });
  }
};

// Login rate limiter (basic IP memory map)
const loginAttempts = new Map();
function checkLoginRateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const record = loginAttempts.get(ip) || { count: 0, resetTime: now + 60000 };
  if (now > record.resetTime) {
    record.count = 0;
    record.resetTime = now + 60000;
  }
  record.count += 1;
  loginAttempts.set(ip, record);
  if (record.count > 10) {
    return res.status(429).json({ success: false, error: 'Too many login attempts. Please wait a minute and try again.' });
  }
  next();
}

// ─── AI DIAGNOSTIC APIS ──────────────────────────────────────────────────────
app.post('/analyze', upload.single('imageInput'), async (req, res) => {
  try {
    const { textInput } = req.body || {};
    const hasText = typeof textInput === 'string' ? textInput.trim() : '';

    if (!req.file && !hasText) {
      return res.status(400).json({ success: false, error: 'Please provide either code/text logs or an image file.' });
    }

    const text = hasText || '';
    const aiResult = await aiEngine.aiDiagnose({
      text,
      imagePath: req.file ? req.file.path : null,
      mimeType: req.file ? req.file.mimetype : null,
      hintName: req.file ? req.file.originalname : null
    });

    if (req.file && aiResult && aiResult.data) {
      aiResult.data.imageUrl = `/uploads/${req.file.filename}`;
    }

    if (aiResult && aiResult.data && !aiResult.data.recommendedCategory) {
      aiResult.data.recommendedCategory = detectCategoryFromProblem(aiResult.data.problem, aiResult.data.type || aiResult.data.domain || 'General');
    }

    return res.json(aiResult);
  } catch (error) {
    console.warn('[AI analyze route] AI diagnosis failed; using local evidence signatures.');
    const fallback = await aiEngine.fallbackDiagnosis({
      text: String(req.body?.textInput || ''),
      imagePath: req.file ? req.file.path : null,
      hintName: req.file ? req.file.originalname : null
    });
    if (req.file && fallback && fallback.data) {
      fallback.data.imageUrl = `/uploads/${req.file.filename}`;
    }
    return res.json(fallback);
  }
});

app.post('/chat', async (req, res) => {
  const { query, data } = req.body;
  try {
    const result = await aiEngine.chat(query, data);
    setTimeout(() => res.json(result), 500);
  } catch (error) {
    const fallback = { success: true, data: { response: 'I am Sentinel AI Problem Solver. Describe your hardware failure or software error.' } };
    setTimeout(() => res.json(fallback), 500);
  }
});

// ─── SHARED CATEGORIES API ───────────────────────────────────────────────────
app.get('/api/categories', (req, res) => {
  res.json({ success: true, categories: CATEGORIES });
});

app.get('/api/ai/status', (req, res) => {
  const remoteAddress = req.socket.remoteAddress || '';
  const isLocal = ['::1', '127.0.0.1', '::ffff:127.0.0.1'].includes(remoteAddress);
  const authHeader = req.headers.authorization || '';
  let isAdmin = false;
  if (authHeader.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(authHeader.split(' ')[1], ADMIN_JWT_SECRET);
      isAdmin = decoded.role === 'admin' && decoded.username === ADMIN_USERNAME;
    } catch {
      isAdmin = false;
    }
  }
  if (!isLocal && !isAdmin) {
    return res.status(403).json({ success: false, error: 'Admin access or a localhost connection is required.' });
  }
  const status = aiEngine.getStatus();
  res.json({ success: true, ...status });
});

// ─── CUSTOMER REQUEST FLOW ───────────────────────────────────────────────────
app.post('/api/customer/request', async (req, res) => {
  try {
    const { 
      problem, 
      type, 
      category: explicitCategory, 
      severity, 
      analysis, 
      image, 
      costEstimate,
      customerToken: incomingToken,
      customerName,
      customerLat,
      customerLng 
    } = req.body;

    if (!problem) {
      return res.status(400).json({ success: false, error: 'Problem description is required.' });
    }

    const determinedCategory = explicitCategory && CATEGORIES.includes(explicitCategory)
      ? explicitCategory
      : detectCategoryFromProblem(problem, type);

    const customerToken = incomingToken || `cust_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    let savedReq = null;
    let selectedExpert = null;

    // Expert Matching: approved, online, matching category
    if (dbConnected) {
      const candidates = await Expert.find({
        category: determinedCategory,
        approvalStatus: 'approved',
        isOnline: true
      });
      if (candidates.length > 0) {
        selectedExpert = candidates[Math.floor(Math.random() * candidates.length)];
      }

      savedReq = new Request({
        problem,
        type: type || 'General',
        category: determinedCategory,
        severity: severity || 'Medium',
        analysis: analysis || '',
        image: image || null,
        costEstimate: costEstimate || 'Varies',
        status: 'pending',
        customerToken,
        customerName: customerName || 'Verified Customer',
        customerLat: customerLat || 28.6139,
        customerLng: customerLng || 77.2090,
        expertId: selectedExpert ? selectedExpert._id : null,
        diagnosticData: req.body.diagnosticData || null
      });
      await savedReq.save();
    } else {
      const candidates = memExperts.filter(e => 
        e.category === determinedCategory && 
        e.approvalStatus === 'approved' && 
        e.isOnline === true
      );
      if (candidates.length > 0) {
        selectedExpert = candidates[Math.floor(Math.random() * candidates.length)];
      }

      savedReq = {
        _id: generateId(),
        problem,
        type: type || 'General',
        category: determinedCategory,
        severity: severity || 'Medium',
        analysis: analysis || '',
        image: image || null,
        costEstimate: costEstimate || 'Varies',
        status: 'pending',
        customerToken,
        customerName: customerName || 'Verified Customer',
        customerLat: customerLat || 28.6139,
        customerLng: customerLng || 77.2090,
        expertId: selectedExpert ? selectedExpert._id.toString() : null,
        diagnosticData: req.body.diagnosticData || null,
        paymentStatus: 'unpaid',
        paymentAmount: 0,
        invoiceNo: null,
        rating: null,
        reviewText: null,
        createdAt: new Date()
      };
      memRequests.push(savedReq);
    }

    const reqPayload = {
      ... (savedReq.toObject ? savedReq.toObject() : savedReq),
      _id: savedReq._id.toString()
    };

    // Real-Time Delivery: Emit new_request to category room and matching expert's personal room
    io.to(`category:${determinedCategory}`).emit('new_request', {
      request: reqPayload,
      category: determinedCategory
    });

    if (selectedExpert) {
      const expertIdStr = selectedExpert._id.toString();
      io.to(`expert:${expertIdStr}`).emit('new_request', {
        request: reqPayload,
        assignedToYou: true
      });

      sendEmail(
        selectedExpert.email,
        `New ${determinedCategory} Request: ${problem}`,
        `Hello ${selectedExpert.name},\n\nA new job matching your expertise has been submitted:\n\nProblem: ${problem}\nSeverity: ${severity}\nEstimated: ${costEstimate}\n\nPlease check your Sentinel AI Expert Portal to review and accept.`
      );
      sendSMSAlert(
        selectedExpert.phone,
        `[Sentinel AI] New ${determinedCategory} job: "${problem}". Open your portal to accept.`
      );
    }

    res.json({
      success: true,
      request: reqPayload,
      customerToken,
      assignedExpert: selectedExpert ? (selectedExpert.toSafeObject ? selectedExpert.toSafeObject() : selectedExpert) : null
    });
  } catch (err) {
    console.error('Request creation error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Reopen / resume active customer request by token
app.get('/api/customer/active-request', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.json({ success: true, request: null });

    let request = null;
    let messages = [];

    if (dbConnected) {
      request = await Request.findOne({ customerToken: token }).sort({ createdAt: -1 }).populate('expertId');
      if (request) {
        messages = await Message.find({ requestId: request._id.toString() }).sort('timestamp');
      }
    } else {
      request = memRequests.filter(r => r.customerToken === token).sort((a,b) => b.createdAt - a.createdAt)[0];
      if (request) {
        messages = memMessages.filter(m => m.requestId === request._id.toString());
        if (request.expertId && typeof request.expertId === 'string') {
          const exp = memExperts.find(e => e._id.toString() === request.expertId);
          request = { ...request, expertId: exp || null };
        }
      }
    }

    res.json({ success: true, request: request || null, messages: messages || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── EXPERT AUTHENTICATION ROUTES ────────────────────────────────────────────
app.post('/api/expert/signup', async (req, res) => {
  try {
    const { name, email, phone, password, category, experience, serviceArea, bio, skills } = req.body;

    if (!name || !email || !phone || !password || !category) {
      return res.status(400).json({ success: false, error: 'Please fill in all required registration fields.' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(cleanEmail)) {
      return res.status(400).json({ success: false, error: 'Please provide a valid email address.' });
    }

    const selectedCategory = String(category).trim();
    if (!CATEGORIES.includes(selectedCategory)) {
      return res.status(400).json({ success: false, error: 'Please choose a valid category from the shared specialist list.' });
    }

    const normalizedCat = normalizeCategory(selectedCategory);

    if (dbConnected) {
      const existing = await Expert.findOne({ email: cleanEmail });
      if (existing) {
        return res.status(409).json({ success: false, error: 'An expert with this email already exists. Please log in.' });
      }
      const passwordHash = await bcrypt.hash(password, 10);
      const expert = new Expert({
        name: name.trim(),
        email: cleanEmail,
        phone: phone.trim(),
        passwordHash,
        category: normalizedCat,
        experience: Number(experience) || 1,
        serviceArea: serviceArea || 'Remote / Local',
        bio: bio || '',
        skills: Array.isArray(skills) ? skills : (skills ? skills.split(',').map(s=>s.trim()) : []),
        approvalStatus: 'pending',
        isOnline: false
      });
      await expert.save();

      return res.json({
        success: true,
        message: 'Account created successfully. Awaiting administrative verification.',
        expert: expert.toSafeObject()
      });
    } else {
      const existing = memExperts.find(e => e.email === cleanEmail);
      if (existing) {
        return res.status(409).json({ success: false, error: 'An expert with this email already exists.' });
      }
      const passwordHash = await bcrypt.hash(password, 10);
      const expert = {
        _id: generateId(),
        name: name.trim(),
        email: cleanEmail,
        phone: phone.trim(),
        passwordHash,
        category: normalizedCat,
        experience: Number(experience) || 1,
        serviceArea: serviceArea || 'Remote / Local',
        bio: bio || '',
        skills: Array.isArray(skills) ? skills : (skills ? skills.split(',').map(s=>s.trim()) : []),
        approvalStatus: 'pending',
        isOnline: false,
        rating: 5.0,
        ratingCount: 0,
        badges: ['New Specialist'],
        earningsBalance: 0,
        lat: 28.6139,
        lng: 77.2090,
        reviews: [],
        createdAt: new Date()
      };
      memExperts.push(expert);
      const safe = { ...expert };
      delete safe.passwordHash;
      return res.json({
        success: true,
        message: 'Account created. Pending review.',
        expert: safe
      });
    }
  } catch (err) {
    console.error('Expert signup error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/expert/login', checkLoginRateLimit, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required.' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    let expert = null;

    if (dbConnected) {
      expert = await Expert.findOne({ email: cleanEmail });
    } else {
      expert = memExperts.find(e => e.email === cleanEmail);
    }

    if (!expert) {
      return res.status(401).json({ success: false, error: 'Invalid email or password.' });
    }

    const isMatch = await bcrypt.compare(password, expert.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid email or password.' });
    }

    const token = generateToken(expert);
    const safeExpert = expert.toSafeObject ? expert.toSafeObject() : { ...expert };
    delete safeExpert.passwordHash;

    res.json({
      success: true,
      token,
      expert: safeExpert
    });
  } catch (err) {
    console.error('Expert login error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/expert/me', requireExpertAuth, async (req, res) => {
  const safe = req.expert.toSafeObject ? req.expert.toSafeObject() : { ...req.expert };
  delete safe.passwordHash;
  res.json({ success: true, expert: safe });
});

app.put('/api/expert/me', requireExpertAuth, async (req, res) => {
  try {
    const { name, phone, serviceArea, bio, skills, isOnline } = req.body;
    const expert = req.expert;

    // Disallow going online if not approved
    if (isOnline === true && expert.approvalStatus !== 'approved') {
      return res.status(403).json({
        success: false,
        error: 'Your account is under verification. You cannot go online until approved by an administrator.'
      });
    }

    if (name !== undefined) expert.name = name.trim();
    if (phone !== undefined) expert.phone = phone.trim();
    if (serviceArea !== undefined) expert.serviceArea = serviceArea;
    if (bio !== undefined) expert.bio = bio;
    if (skills !== undefined) {
      expert.skills = Array.isArray(skills) ? skills : skills.split(',').map(s=>s.trim());
    }
    if (isOnline !== undefined) expert.isOnline = Boolean(isOnline);

    if (dbConnected) {
      await expert.save();
    }

    // Broadcast status change to sockets
    io.emit('status_change', { expertId: expert._id.toString(), isOnline: expert.isOnline });

    const safe = expert.toSafeObject ? expert.toSafeObject() : { ...expert };
    delete safe.passwordHash;
    res.json({ success: true, expert: safe });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── FILTERED REQUEST FEED FOR LOGGED-IN EXPERT ──────────────────────────────
app.get('/api/requests', requireExpertAuth, async (req, res) => {
  try {
    const expert = req.expert;
    const expertIdStr = expert._id.toString();
    const expertCategory = expert.category;

    let requests = [];

    if (dbConnected) {
      requests = await Request.find({
        $or: [
          { expertId: expert._id },
          { category: expertCategory, status: 'pending' }
        ]
      })
        .sort({ createdAt: -1 })
        .limit(50)
        .populate('expertId');
    } else {
      requests = memRequests
        .filter(r => {
          const reqExpertId = r.expertId ? r.expertId.toString() : null;
          return reqExpertId === expertIdStr || (r.category === expertCategory && r.status === 'pending');
        })
        .sort((a,b) => b.createdAt - a.createdAt)
        .slice(0, 50);

      // Hydrate expertId
      requests = requests.map(r => {
        if (r.expertId && typeof r.expertId === 'string') {
          const exp = memExperts.find(e => e._id.toString() === r.expertId);
          return { ...r, expertId: exp || null };
        }
        return r;
      });
    }

    res.json({ success: true, requests });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Single request query
app.get('/api/request/:id', async (req, res) => {
  try {
    const reqId = req.params.id;
    let request = null;
    let messages = [];

    if (dbConnected) {
      request = await Request.findById(reqId).populate('expertId');
      if (request) {
        messages = await Message.find({ requestId: reqId }).sort('timestamp');
      }
    } else {
      request = memRequests.find(r => r._id.toString() === reqId.toString());
      if (request) {
        messages = memMessages.filter(m => m.requestId.toString() === reqId.toString());
        if (request.expertId && typeof request.expertId === 'string') {
          const exp = memExperts.find(e => e._id.toString() === request.expertId);
          request = { ...request, expertId: exp || null };
        }
      }
    }

    if (!request) {
      return res.status(404).json({ success: false, error: 'Request not found.' });
    }

    res.json({ success: true, request, messages: messages || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── ATOMIC ACCEPT & LIFECYCLE ACTION ────────────────────────────────────────
app.post('/api/request/:id/action', requireExpertAuth, async (req, res) => {
  try {
    const { action, price } = req.body;
    const expert = req.expert;
    const reqId = req.params.id;

    if (dbConnected) {
      const current = await Request.findById(reqId);
      if (!current) {
        return res.status(404).json({ success: false, error: 'Request not found.' });
      }

      if (action === 'accept') {
        if (current.status !== 'pending') {
          return res.status(409).json({ 
            success: false, 
            error: 'This request has already been claimed by another specialist.' 
          });
        }
        current.status = 'accepted';
        current.expertId = expert._id;
        if (price) current.customPrice = price;
        await current.save();

        const updated = await Request.findById(reqId).populate('expertId');
        io.to(reqId).emit('request_updated', { request: updated, expert: expert.toSafeObject() });
        io.to(`category:${current.category}`).emit('request_claimed', { requestId: reqId });

        return res.json({ success: true, request: updated });
      } else if (action === 'start') {
        current.status = 'in_progress';
        await current.save();
        io.to(reqId).emit('request_updated', { request: current, expert: expert.toSafeObject() });
        return res.json({ success: true, request: current });
      } else if (action === 'resolve') {
        current.status = 'resolved';
        await current.save();
        io.to(reqId).emit('request_updated', { request: current, expert: expert.toSafeObject() });
        return res.json({ success: true, request: current });
      }
    } else {
      // In-Memory atomic check
      const current = memRequests.find(r => r._id.toString() === reqId.toString());
      if (!current) {
        return res.status(404).json({ success: false, error: 'Request not found.' });
      }

      if (action === 'accept') {
        if (current.status !== 'pending') {
          return res.status(409).json({ 
            success: false, 
            error: 'This request has already been claimed by another specialist.' 
          });
        }
        current.status = 'accepted';
        current.expertId = expert._id.toString();
        if (price) current.customPrice = price;

        const safeExpert = { ...expert };
        delete safeExpert.passwordHash;
        const populated = { ...current, expertId: safeExpert };

        io.to(reqId).emit('request_updated', { request: populated, expert: safeExpert });
        io.to(`category:${current.category}`).emit('request_claimed', { requestId: reqId });

        return res.json({ success: true, request: populated });
      } else if (action === 'start') {
        current.status = 'in_progress';
        io.to(reqId).emit('request_updated', { request: current });
        return res.json({ success: true, request: current });
      } else if (action === 'resolve') {
        current.status = 'resolved';
        io.to(reqId).emit('request_updated', { request: current });
        return res.json({ success: true, request: current });
      }
    }

    res.status(400).json({ success: false, error: 'Invalid action provided.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── ESCROW PAYMENT APIS ─────────────────────────────────────────────────────
app.post('/api/request/:id/pay', async (req, res) => {
  try {
    const { amount } = req.body;
    const reqId = req.params.id;
    const invoiceNo = `INV-${Date.now().toString().slice(-6)}`;

    let request = null;
    let expert = null;

    if (dbConnected) {
      request = await Request.findById(reqId);
      if (!request) return res.status(404).json({ success: false, error: 'Request not found' });
      request.paymentStatus = 'escrow_held';
      request.paymentAmount = Number(amount) || 50;
      request.invoiceNo = invoiceNo;
      request.status = 'in_progress';
      await request.save();

      expert = await Expert.findById(request.expertId);
      const populated = await Request.findById(reqId).populate('expertId');
      io.to(reqId).emit('request_updated', { request: populated, expert });
    } else {
      request = memRequests.find(r => r._id.toString() === reqId.toString());
      if (!request) return res.status(404).json({ success: false, error: 'Request not found' });
      request.paymentStatus = 'escrow_held';
      request.paymentAmount = Number(amount) || 50;
      request.invoiceNo = invoiceNo;
      request.status = 'in_progress';

      expert = memExperts.find(e => e._id.toString() === (request.expertId ? request.expertId.toString() : ''));
      io.to(reqId).emit('request_updated', { request, expert });
    }

    res.json({ success: true, request, invoiceNo });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/request/:id/release-payment', async (req, res) => {
  try {
    const reqId = req.params.id;
    let request = null;

    if (dbConnected) {
      request = await Request.findById(reqId);
      if (!request) return res.status(404).json({ success: false, error: 'Request not found' });
      request.paymentStatus = 'released';
      request.status = 'resolved';
      await request.save();

      if (request.expertId) {
        await Expert.findByIdAndUpdate(request.expertId, {
          $inc: { earningsBalance: request.paymentAmount || 0 }
        });
      }

      const populated = await Request.findById(reqId).populate('expertId');
      io.to(reqId).emit('request_updated', { request: populated });
    } else {
      request = memRequests.find(r => r._id.toString() === reqId.toString());
      if (!request) return res.status(404).json({ success: false, error: 'Request not found' });
      request.paymentStatus = 'released';
      request.status = 'resolved';

      if (request.expertId) {
        const exp = memExperts.find(e => e._id.toString() === request.expertId.toString());
        if (exp) {
          exp.earningsBalance = (exp.earningsBalance || 0) + (request.paymentAmount || 0);
        }
      }
      io.to(reqId).emit('request_updated', { request });
    }

    res.json({ success: true, request });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/request/:id/rate', async (req, res) => {
  try {
    const { rating, comment, customerName } = req.body;
    const reqId = req.params.id;

    let request = null;
    let expert = null;

    if (dbConnected) {
      request = await Request.findById(reqId);
      if (!request) return res.status(404).json({ success: false, error: 'Request not found' });
      request.rating = Number(rating);
      request.reviewText = comment || '';
      await request.save();

      if (request.expertId) {
        expert = await Expert.findById(request.expertId);
        if (expert) {
          const totalRating = (expert.rating * expert.ratingCount) + Number(rating);
          expert.ratingCount += 1;
          expert.rating = Number((totalRating / expert.ratingCount).toFixed(1));
          expert.reviews.push({ customerName: customerName || 'Customer', rating: Number(rating), comment });
          if (expert.rating >= 4.7 && !expert.badges.includes('Top Rated')) {
            expert.badges.push('Top Rated');
          }
          await expert.save();
        }
      }
    } else {
      request = memRequests.find(r => r._id.toString() === reqId.toString());
      if (request) {
        request.rating = Number(rating);
        request.reviewText = comment || '';
        expert = memExperts.find(e => e._id.toString() === (request.expertId ? request.expertId.toString() : ''));
        if (expert) {
          const totalRating = (expert.rating * expert.ratingCount) + Number(rating);
          expert.ratingCount += 1;
          expert.rating = Number((totalRating / expert.ratingCount).toFixed(1));
          if (!expert.reviews) expert.reviews = [];
          expert.reviews.push({ customerName: customerName || 'Customer', rating: Number(rating), comment, date: new Date() });
          if (expert.rating >= 4.7 && !expert.badges.includes('Top Rated')) {
            expert.badges.push('Top Rated');
          }
        }
      }
    }

    res.json({ success: true, request, expert });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── ADMIN DASHBOARD APIS ────────────────────────────────────────────────────
app.post('/admin/login', (req, res) => {
  const { username, password } = req.body || {};

  if (!safeCompare(username || '', ADMIN_USERNAME) || !safeCompare(password || '', ADMIN_PASSWORD)) {
    return res.status(401).json({ success: false, error: 'Invalid admin credentials.' });
  }

  const token = generateAdminToken();
  return res.json({ success: true, token, admin: { username: ADMIN_USERNAME } });
});

app.get('/admin/me', requireAdminAuth, (req, res) => {
  res.json({ success: true, admin: { username: ADMIN_USERNAME } });
});

app.get('/admin/stats', requireAdminAuth, async (req, res) => {
  try {
    let experts = 0, requests = 0, messages = 0, pending = 0;
    if (dbConnected) {
      [experts, requests, messages, pending] = await Promise.all([
        Expert.countDocuments(),
        Request.countDocuments(),
        Message.countDocuments(),
        Request.countDocuments({ status: 'pending' })
      ]);
    } else {
      experts = memExperts.length;
      requests = memRequests.length;
      messages = memMessages.length;
      pending = memRequests.filter(r => r.status === 'pending').length;
    }
    res.json({ success: true, stats: { experts, requests, messages, pending } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/admin/experts', requireAdminAuth, async (req, res) => {
  try {
    let experts = [];
    if (dbConnected) {
      experts = await Expert.find().sort({ createdAt: -1 });
      experts = experts.map(e => e.toSafeObject());
    } else {
      experts = [...memExperts].reverse().map(e => {
        const copy = { ...e };
        delete copy.passwordHash;
        return copy;
      });
    }
    res.json({ success: true, experts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/admin/requests', requireAdminAuth, async (req, res) => {
  try {
    let requests = [];
    if (dbConnected) {
      requests = await Request.find().sort({ createdAt: -1 }).populate('expertId', 'name category email');
    } else {
      requests = [...memRequests].reverse().map(r => {
        if (r.expertId && typeof r.expertId === 'string') {
          const exp = memExperts.find(e => e._id.toString() === r.expertId);
          return { ...r, expertId: exp ? { name: exp.name, category: exp.category, email: exp.email } : null };
        }
        return r;
      });
    }
    res.json({ success: true, requests });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/admin/tickets', requireAdminAuth, async (req, res) => {
  try {
    return res.json({ success: true, requests: await Promise.resolve([]) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/admin/messages', requireAdminAuth, async (req, res) => {
  try {
    let messages = [];
    if (dbConnected) {
      messages = await Message.find().sort({ timestamp: -1 }).limit(100);
    } else {
      messages = [...memMessages].reverse().slice(0, 100);
    }
    res.json({ success: true, messages });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/admin/expert/:id/status', requireAdminAuth, async (req, res) => {
  try {
    const { status } = req.body; // 'approved' | 'suspended' | 'pending'
    const expertId = req.params.id;

    if (!['approved', 'suspended', 'pending'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }

    let expert = null;
    if (dbConnected) {
      expert = await Expert.findById(expertId);
      if (expert) {
        expert.approvalStatus = status;
        if (status !== 'approved') expert.isOnline = false;
        await expert.save();
        expert = expert.toSafeObject();
      }
    } else {
      expert = memExperts.find(e => e._id.toString() === expertId.toString());
      if (expert) {
        expert.approvalStatus = status;
        if (status !== 'approved') expert.isOnline = false;
      }
    }

    if (!expert) return res.status(404).json({ success: false, error: 'Expert not found' });
    res.json({ success: true, expert });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/admin/expert/:id/approve', requireAdminAuth, async (req, res) => {
  try {
    const expertId = req.params.id;
    let expert = null;

    if (dbConnected) {
      expert = await Expert.findById(expertId);
      if (expert) {
        expert.approvalStatus = 'approved';
        expert.isOnline = expert.isOnline && expert.approvalStatus === 'approved';
        await expert.save();
      }
    } else {
      expert = memExperts.find(e => e._id.toString() === expertId.toString());
      if (expert) {
        expert.approvalStatus = 'approved';
        expert.isOnline = !!expert.isOnline;
      }
    }

    if (!expert) {
      return res.status(404).json({ success: false, error: 'Expert not found' });
    }

    res.json({ success: true, expert: expert.toSafeObject ? expert.toSafeObject() : expert });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/admin/expert/:id/suspend', requireAdminAuth, async (req, res) => {
  try {
    const expertId = req.params.id;
    let expert = null;

    if (dbConnected) {
      expert = await Expert.findById(expertId);
      if (expert) {
        expert.approvalStatus = 'suspended';
        expert.isOnline = false;
        await expert.save();
      }
    } else {
      expert = memExperts.find(e => e._id.toString() === expertId.toString());
      if (expert) {
        expert.approvalStatus = 'suspended';
        expert.isOnline = false;
      }
    }

    if (!expert) {
      return res.status(404).json({ success: false, error: 'Expert not found' });
    }

    res.json({ success: true, expert: expert.toSafeObject ? expert.toSafeObject() : expert });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/admin/expert/:id', requireAdminAuth, async (req, res) => {
  try {
    const expertId = req.params.id;
    if (dbConnected) {
      await Expert.findByIdAndDelete(expertId);
    } else {
      memExperts = memExperts.filter(e => e._id.toString() !== expertId.toString());
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/admin/request/:id', requireAdminAuth, async (req, res) => {
  try {
    const reqId = req.params.id;
    if (dbConnected) {
      await Request.findByIdAndDelete(reqId);
      await Message.deleteMany({ requestId: reqId });
    } else {
      memRequests = memRequests.filter(r => r._id.toString() !== reqId.toString());
      memMessages = memMessages.filter(m => m.requestId.toString() !== reqId.toString());
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── SOCKET.IO REAL-TIME & WEBRTC SIGNALING ──────────────────────────────────
io.on('connection', (socket) => {
  // Join authenticated expert channel & category rooms
  socket.on('expert_init', (data) => {
    if (data && data.expertId) {
      socket.join(`expert:${data.expertId}`);
      if (data.category) {
        socket.join(`category:${data.category}`);
      }
    }
  });

  socket.on('join_request', async (payload) => {
    // Supports either plain string requestId or object { requestId, customerToken, expertId }
    const requestId = typeof payload === 'object' ? payload.requestId : payload;
    if (requestId) {
      socket.join(requestId.toString());
    }
  });

  socket.on('send_message', async (data) => {
    // data: { requestId, sender, text }
    if (!data || !data.requestId || !data.text) return;
    try {
      let msgObj = null;
      if (dbConnected) {
        msgObj = new Message({
          requestId: data.requestId,
          sender: data.sender || 'customer',
          text: data.text
        });
        await msgObj.save();
      } else {
        msgObj = {
          _id: generateId(),
          requestId: data.requestId.toString(),
          sender: data.sender || 'customer',
          text: data.text,
          timestamp: new Date()
        };
        memMessages.push(msgObj);
      }
      io.to(data.requestId.toString()).emit('receive_message', msgObj);
    } catch (err) {
      console.error('Socket message save error:', err);
    }
  });

  socket.on('user_typing', (data) => {
    if (data && data.requestId) {
      socket.to(data.requestId.toString()).emit('user_typing', data);
    }
  });

  // WebRTC P2P Video Signaling
  socket.on('webrtc_offer', (data) => {
    if (data && data.requestId) socket.to(data.requestId.toString()).emit('webrtc_offer', data);
  });
  socket.on('webrtc_answer', (data) => {
    if (data && data.requestId) socket.to(data.requestId.toString()).emit('webrtc_answer', data);
  });
  socket.on('webrtc_ice_candidate', (data) => {
    if (data && data.requestId) socket.to(data.requestId.toString()).emit('webrtc_ice_candidate', data);
  });
  socket.on('webrtc_end_call', (data) => {
    if (data && data.requestId) socket.to(data.requestId.toString()).emit('webrtc_end_call', data);
  });
  socket.on('webrtc_toggle_media', (data) => {
    if (data && data.requestId) socket.to(data.requestId.toString()).emit('webrtc_toggle_media', data);
  });
});

// Fallback to landing page for web navigation
app.use((req, res) => {
  res.sendFile(path.join(publicPath, 'landing.html'));
});

server.listen(port, () => {
  console.log(`🚀 Sentinel AI Server actively running on http://localhost:${port}`);
});
