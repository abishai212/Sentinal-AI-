require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const twilio = require('twilio');

const aiEngine = require('./aiEngine');
const Expert = require('./models/Expert');
const Request = require('./models/Request');
const Message = require('./models/Message');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ─── DATABASE CONNECTION & FALLBACK ──────────────────────────────────────────
let dbConnected = false;
let memExperts = [];
let memRequests = [];
let memMessages = [];

mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ai_marketplace')
  .then(() => {
    dbConnected = true;
    console.log('✅ MongoDB connected successfully');
  })
  .catch(err => {
    console.warn('⚠️ MongoDB connection failed. Falling back to IN-MEMORY DATABASE mode.');
    console.warn('Error details:', err.message);
  });

// ─── NODEMAILER SETUP ────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'dummy@gmail.com',
    pass: process.env.EMAIL_PASS || 'dummy123'
  }
});

const sendEmail = async (to, subject, text) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log(`[Mock Email] To: ${to} | Subject: ${subject} \nContent: ${text}`);
    return;
  }
  try {
    await transporter.sendMail({
      from: `"Sentinal AI Marketplace" <${process.env.EMAIL_USER}>`,
      to, subject, text
    });
    console.log(`✅ Email sent to ${to}`);
  } catch (err) {
    console.error(`❌ Email failed to ${to}:`, err.message);
  }
};

const sendSMS = async (to, text) => {
  const sid = process.env.TWILIO_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const fromNum = process.env.TWILIO_PHONE_NUM;

  if (!sid || !token || sid.includes('here') || token.includes('here') || !to) {
    console.log(`[Mock SMS] To: ${to} | Content: ${text}`);
    return;
  }
  try {
    const client = twilio(sid, token);
    await client.messages.create({
      body: text,
      to: to,
      from: fromNum
    });
    console.log(`✅ SMS sent to ${to}`);
  } catch (err) {
    console.error(`❌ SMS failed to ${to}:`, err.message);
  }
};

// ─── STATIC FILES & MULTER ───────────────────────────────────────────────────
const publicPath = path.join(__dirname, '../frontend');
const uploadsPath = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsPath)) fs.mkdirSync(uploadsPath, { recursive: true });

app.use(express.static(publicPath));
app.use('/uploads', express.static(uploadsPath));

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsPath),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
  })
});

// ─── AI ROUTES ───────────────────────────────────────────────────────────────
app.post('/analyze', upload.single('imageInput'), (req, res) => {
  let result;
  const { textInput } = req.body;
  if (req.file) {
    result = aiEngine.analyzeHardware(req.file.originalname);
    result.data.imageUrl = `/uploads/${req.file.filename}`;
  } else if (textInput) {
    result = aiEngine.analyzeCode(textInput);
  } else {
    return res.status(400).json({ error: 'Please provide input.' });
  }
  setTimeout(() => res.json(result), 1500);
});

app.post('/chat', (req, res) => {
  const { query, data } = req.body;
  const result = aiEngine.chat(query, data);
  setTimeout(() => res.json(result), 1200);
});

// ─── MARKETPLACE API ROUTES ──────────────────────────────────────────────────

// 1. Expert Registration
app.post('/api/expert/register', async (req, res) => {
  try {
    const { name, email, mobile, skill, location, experience } = req.body;
    let expert = null;

    if (dbConnected) {
      expert = await Expert.findOne({ email });
      if (!expert) {
        expert = new Expert({ name, email, mobile, skill, location, experience, isOnline: true });
        await expert.save();
        await sendEmail(email, 'Welcome to Sentinal AI Experts', `Hi ${name}, your expert account has been successfully created!`);
      } else {
        expert.isOnline = true;
        await expert.save();
      }
    } else {
      // In-Memory Fallback
      expert = memExperts.find(e => e.email === email);
      if (!expert) {
        expert = { _id: Date.now().toString(), name, email, mobile, skill, location, experience, isOnline: true, isApproved: true, createdAt: new Date() };
        memExperts.push(expert);
        await sendEmail(email, 'Welcome to Sentinal AI Experts (Fallback Mode)', `Hi ${name}, your expert account has been created locally!`);
      } else {
        expert.isOnline = true;
      }
    }
    res.json({ success: true, expert });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 1b. Expert Login
app.post('/api/expert/login', async (req, res) => {
  try {
    const { email } = req.body;
    let expert = null;

    if (dbConnected) {
      expert = await Expert.findOne({ email });
      if (expert) {
        expert.isOnline = true;
        await expert.save();
      }
    } else {
      expert = memExperts.find(e => e.email === email);
      if (expert) {
        expert.isOnline = true;
      }
    }

    if (!expert) {
      return res.status(404).json({ error: 'Expert email not found. Please register first.' });
    }

    res.json({ success: true, expert });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 1c. Expert Verification (Retrieve profile / check session validity)
app.get('/api/expert/:id', async (req, res) => {
  try {
    let expert = null;
    if (dbConnected) {
      expert = await Expert.findById(req.params.id);
    } else {
      expert = memExperts.find(e => e._id === req.params.id);
    }
    if (!expert) {
      return res.status(404).json({ success: false, error: 'Expert not found.' });
    }
    res.json({ success: true, expert });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Customer Request -> Match Expert
app.post('/api/customer/request', async (req, res) => {
  try {
    const { problem, type, severity, analysis, image, costEstimate } = req.body;
    let querySkill = 'All';
    const rawProblem = String(problem).toLowerCase();
    
    // Auto Category Detection
    if (rawProblem.includes('pipe') || rawProblem.includes('leak')) querySkill = 'Plumber';
    else if (rawProblem.includes('wire') || rawProblem.includes('plug') || rawProblem.includes('circuit') || rawProblem.includes('burnt')) querySkill = 'Electrician';
    else if (rawProblem.includes('screen') || rawProblem.includes('phone') || rawProblem.includes('mobile')) querySkill = 'Mobile Technician';
    else if (type === 'Software' || type === 'Software System' || rawProblem.includes('code') || rawProblem.includes('error')) querySkill = 'Software Developer';
    else if (rawProblem.includes('ransomware') || type === 'Cybersecurity') querySkill = 'Cybersecurity';

    // Find best expert
    let selectedExpert = null;
    if (dbConnected) {
      const experts = await Expert.find({ $or: [{ skill: querySkill }, { skill: 'All' }], isOnline: true, isApproved: true });
      if (experts.length > 0) selectedExpert = experts[Math.floor(Math.random() * experts.length)];
    } else {
      const experts = memExperts.filter(e => (e.skill === querySkill || e.skill === 'All') && e.isOnline && e.isApproved);
      if (experts.length > 0) selectedExpert = experts[Math.floor(Math.random() * experts.length)];
    }

    let savedReq = null;
    if (dbConnected) {
      savedReq = new Request({ problem, type, severity, analysis, image, costEstimate, expertId: selectedExpert ? selectedExpert._id : null, status: 'pending' });
      await savedReq.save();
    } else {
      savedReq = {
        _id: Date.now().toString(),
        problem, type, severity, analysis, image, costEstimate,
        expertId: selectedExpert ? selectedExpert : null, // Store full object in memory mapped
        status: 'pending',
        createdAt: new Date()
      };
      memRequests.push(savedReq);
    }

    if (selectedExpert) {
      await sendEmail(selectedExpert.email, 'New Task Assigned: Sentinal AI', `Hello ${selectedExpert.name},\n\nA new problem has been assigned to you:\n\nProblem: ${problem}\nCategory: ${querySkill}\n\nPlease log in to your expert dashboard to assist the user.`);
      await sendSMS(selectedExpert.mobile, `Sentinal AI: A new task "${problem}" (Category: ${querySkill}) has been assigned to you. Please check your dashboard.`);
      
      // Real-time socket notification to specific expert
      const expertIdStr = selectedExpert._id ? selectedExpert._id.toString() : selectedExpert.toString();
      io.to(`expert_${expertIdStr}`).emit('new_request', { request: savedReq });
    }

    // Broadcast to the skill group
    io.to(`skill_${querySkill}`).emit('new_request_available', { request: savedReq });

    res.json({ success: true, request: savedReq, assignedExpert: selectedExpert });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 3. Expert Fetch Feed
app.get('/api/requests', async (req, res) => {
  try {
    let requests = [];
    if (dbConnected) {
      requests = await Request.find().sort({ createdAt: -1 }).populate('expertId');
    } else {
      requests = memRequests.sort((a,b) => b.createdAt - a.createdAt);
    }
    res.json({ success: true, requests });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// 4. Fetch Single Request
app.get('/api/request/:id', async (req, res) => {
  try {
    let request, messages;
    if (dbConnected) {
      request = await Request.findById(req.params.id).populate('expertId');
      messages = await Message.find({ requestId: req.params.id }).sort('timestamp');
    } else {
      request = memRequests.find(r => r._id === req.params.id);
      messages = memMessages.filter(m => m.requestId === req.params.id);
    }
    res.json({ success: true, request, messages: messages || [] });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// 5. Expert Action
app.post('/api/request/:id/action', async (req, res) => {
  try {
    const { action, expertId, price } = req.body;
    let request = null;

    if (dbConnected) {
      request = await Request.findById(req.params.id);
      if (!request) return res.status(404).json({ error: 'Not found' });

      if (action === 'accept') {
        request.status = 'accepted';
        request.expertId = expertId;
        if (price) request.customPrice = price;
      } else if (action === 'resolve') {
        request.status = 'resolved';
      }
      await request.save();
      const expert = await Expert.findById(request.expertId);
      io.to(request._id.toString()).emit('request_updated', { request, expert });
    } else {
      // In-Memory
      request = memRequests.find(r => r._id === req.params.id);
      if (!request) return res.status(404).json({ error: 'Not found' });
      if (action === 'accept') {
        request.status = 'accepted';
        request.expertId = memExperts.find(e => e._id === expertId);
        if (price) request.customPrice = price;
      } else if (action === 'resolve') {
        request.status = 'resolved';
      }
      io.to(request._id.toString()).emit('request_updated', { request, expert: request.expertId });
    }
    res.json({ success: true, request });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ─── ADMIN ROUTES (Fallback Enabled) ─────────────────────────────────────────

app.get('/admin/stats', async (req, res) => {
  try {
    let experts=0, requests=0, messages=0;
    if (dbConnected) {
      [experts, requests, messages] = await Promise.all([ Expert.countDocuments(), Request.countDocuments(), Message.countDocuments() ]);
    } else {
      experts = memExperts.length; requests = memRequests.length; messages = memMessages.length;
    }
    res.json({ success: true, stats: { experts, requests, messages } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/admin/experts', async (req, res) => {
  try {
    res.json({ success: true, experts: dbConnected ? await Expert.find().sort({ createdAt: -1 }) : [...memExperts].reverse() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/admin/requests', async (req, res) => {
  try {
    res.json({ success: true, requests: dbConnected ? await Request.find().sort({ createdAt: -1 }).populate('expertId', 'name skill') : [...memRequests].reverse() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/admin/messages', async (req, res) => {
  try {
    res.json({ success: true, messages: dbConnected ? await Message.find().sort({ timestamp: -1 }).populate('requestId', 'problem') : [...memMessages].reverse() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/admin/expert/:id/approve', async (req, res) => {
  try {
    let expert;
    if (dbConnected) {
      expert = await Expert.findById(req.params.id);
      if(expert) { expert.isApproved = !expert.isApproved; await expert.save(); }
    } else {
      expert = memExperts.find(e => e._id === req.params.id);
      if(expert) expert.isApproved = !expert.isApproved;
    }
    res.json({ success: true, expert });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/admin/expert/:id', async (req, res) => {
  try {
    if (dbConnected) await Expert.findByIdAndDelete(req.params.id);
    else memExperts = memExperts.filter(e => e._id !== req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/admin/request/:id', async (req, res) => {
  try {
    if (dbConnected) {
      await Request.findByIdAndDelete(req.params.id);
      await Message.deleteMany({ requestId: req.params.id });
    } else {
      memRequests = memRequests.filter(r => r._id !== req.params.id);
      memMessages = memMessages.filter(m => m.requestId !== req.params.id);
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/admin/request/:id/resolve', async (req, res) => {
  try {
    let request;
    if (dbConnected) {
      request = await Request.findByIdAndUpdate(req.params.id, { status: 'resolved' }, { new: true });
    } else {
      request = memRequests.find(r => r._id === req.params.id);
      if(request) request.status = 'resolved';
    }
    if (request) io.to(request._id.toString()).emit('request_updated', { request });
    res.json({ success: true, request });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── SOCKET.IO ───────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  socket.on('join_request', (requestId) => {
    socket.join(requestId);
  });

  socket.on('expert_login', (data) => {
    if (data.expertId) {
      socket.join(`expert_${data.expertId}`);
      console.log(`Expert socket joined room: expert_${data.expertId}`);
    }
    if (data.skill) {
      socket.join(`skill_${data.skill}`);
      console.log(`Expert socket joined room: skill_${data.skill}`);
    }
  });

  socket.on('send_message', async (data) => {
    // data: { requestId, sender, text }
    let msgObj = null;
    try {
      if (dbConnected) {
        msgObj = new Message(data);
        await msgObj.save();
      } else {
        msgObj = { _id: Date.now().toString(), requestId: data.requestId, sender: data.sender, text: data.text, timestamp: new Date() };
        memMessages.push(msgObj);
      }
      
      // Emit to request room
      io.to(data.requestId).emit('receive_message', msgObj);

      // Also notify the specific expert in their personal room
      let request = null;
      if (dbConnected) {
        request = await Request.findById(data.requestId);
      } else {
        request = memRequests.find(r => r._id === data.requestId);
      }

      if (request) {
        const expertId = request.expertId?._id || request.expertId;
        if (expertId) {
          const expertIdStr = expertId.toString();
          io.to(`expert_${expertIdStr}`).emit('receive_message', msgObj);
        }
      }
    } catch(err) { console.error('Message save error:', err); }
  });

  socket.on('user_typing', (data) => {
    socket.to(data.requestId).emit('user_typing', data);
  });

  socket.on('expert_status_change', async (data) => {
    try {
      if(dbConnected) {
        await Expert.findByIdAndUpdate(data.expertId, { isOnline: data.isOnline });
      } else {
        const e = memExperts.find(exp => exp._id === data.expertId);
        if(e) e.isOnline = data.isOnline;
      }
      io.emit('status_change', data);
    } catch(err){}
  });
});

// ─── CATCH-ALL ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.sendFile(path.join(publicPath, 'landing.html'));
});

server.listen(port, () => {
  console.log(`🚀 Backend running on port ${port}`);
});
