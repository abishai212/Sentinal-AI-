# Universal AI Problem Solver (Sentinal AI) 🤖⚙️

A full-stack, hybrid AI-and-Human marketplace application designed to diagnose and solve physical hardware issues and digital software defects.

---

## ✨ Features

- 🔍 **AI Hardware Diagnosis**: Analyze uploaded images of damaged components (leaks, burnt wiring, cracked displays, ransomware, BSOD).
- 💻 **AI Software Debugger**: Paste error logs, stack traces, or code snippets for root-cause analysis, step-by-step fixes, and code optimizations.
- 💬 **Contextual AI Assistant**: Dynamic Q&A follow-up chatbot for diagnostic results.
- 🛠️ **Human Expert Marketplace**: Automatically classifies issue domains (Plumber, Electrician, Mobile Technician, Software Developer, Cybersecurity) and dispatches real-time requests to qualified field experts.
- ⚡ **Real-Time Communication**: Socket.IO bi-directional chat, typing status, and custom price negotiations between customer and expert.
- 🔔 **Multi-Channel Notifications**: Real-time email (Nodemailer) and SMS alerts (Twilio).
- 🛡️ **Admin Panel**: Full control center to monitor system metrics, manage user/expert permissions, and resolve requests.
- 💾 **Dual Data Persistence Mode**: Automatic failover to In-Memory storage if MongoDB database is disconnected.

---

## 🛠️ Tech Stack

- **Backend**: Node.js, Express.js, Socket.IO, Multer, Mongoose (MongoDB), Nodemailer, Twilio SDK
- **Frontend**: HTML5, Modern Glassmorphism CSS3, JavaScript (ES6+), Socket.IO Client
- **Database**: MongoDB (Local or Atlas) with fallback to local memory arrays

---

## 🚀 Getting Started

### Prerequisites

- Node.js (v16+)
- MongoDB (Optional, in-memory fallback enabled)

### Installation

1. **Clone repository**:
   ```bash
   git clone https://github.com/abishai212/universal-ai-problem-solver.git
   cd universal-ai-problem-solver
   ```

2. **Install backend dependencies**:
   ```bash
   cd backend
   npm install
   ```

3. **Configure Environment Variables**:
   Create a `.env` file in the `backend/` directory:
   ```env
   PORT=3000
   MONGO_URI=mongodb://127.0.0.1:27017/ai_marketplace
   EMAIL_USER=your_email@gmail.com
   EMAIL_PASS=your_app_password
   TWILIO_SID=your_twilio_sid
   TWILIO_AUTH_TOKEN=your_twilio_token
   TWILIO_PHONE_NUM=+1234567890
   ```

4. **Run the server**:
   ```bash
   npm start
   # or node server.js
   ```

5. **Access the application**:
   Open browser at `http://localhost:3000` or navigate to `http://localhost:3000/landing.html`.

---

## 👥 Roles & Interfaces

- **Customer Dashboard**: `http://localhost:3000/index.html`
- **Expert Dashboard**: `http://localhost:3000/expert.html`
- **Admin Panel**: `http://localhost:3000/admin.html`
