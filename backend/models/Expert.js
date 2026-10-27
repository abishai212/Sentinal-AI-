const mongoose = require('mongoose');

const expertSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, required: true },
  passwordHash: { type: String, required: true },
  category: { 
    type: String, 
    required: true,
    enum: ['Plumber', 'Electrician', 'Mobile Technician', 'Software Developer', 'Cybersecurity Specialist']
  },
  skills: { type: [String], default: [] },
  experience: { type: Number, required: true, default: 1 },
  serviceArea: { type: String, default: 'Global / Remote' },
  bio: { type: String, default: '' },
  profilePhoto: { type: String, default: '' },
  certificationDoc: { type: String, default: '' },
  approvalStatus: { 
    type: String, 
    enum: ['pending', 'approved', 'suspended'], 
    default: 'pending' 
  },
  isOnline: { type: Boolean, default: false },
  rating: { type: Number, default: 5.0 },
  ratingCount: { type: Number, default: 0 },
  badges: { type: [String], default: ['Verified Specialist'] },
  earningsBalance: { type: Number, default: 0 },
  lat: { type: Number, default: 28.6139 },
  lng: { type: Number, default: 77.2090 },
  reviews: [{
    customerName: String,
    rating: Number,
    comment: String,
    date: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now }
});

// Avoid returning passwordHash in queries
expertSchema.methods.toSafeObject = function() {
  const obj = this.toObject();
  delete obj.passwordHash;
  return obj;
};

module.exports = mongoose.model('Expert', expertSchema);
