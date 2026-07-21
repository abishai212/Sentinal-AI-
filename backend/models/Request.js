const mongoose = require('mongoose');

const requestSchema = new mongoose.Schema({
  problem: { type: String, required: true },
  type: { type: String, required: true },
  severity: { type: String, required: true },
  analysis: { type: String },
  image: { type: String },
  costEstimate: { type: String },
  status: { type: String, enum: ['pending', 'accepted', 'resolved'], default: 'pending' },
  expertId: { type: mongoose.Schema.Types.ObjectId, ref: 'Expert', default: null },
  customPrice: { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Request', requestSchema);
