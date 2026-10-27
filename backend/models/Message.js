const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  requestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Request', required: true },
  sender: { type: String, enum: ['customer', 'expert'], required: true },
  text: { type: String, required: true },
  isRead: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Message', messageSchema);
