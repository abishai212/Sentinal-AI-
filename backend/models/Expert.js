const mongoose = require('mongoose');

const expertSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  mobile: { type: String, required: true },
  skill: { type: String, required: true },
  location: { type: String, required: true },
  experience: { type: Number, required: true },
  isOnline: { type: Boolean, default: true },
  isApproved: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Expert', expertSchema);
