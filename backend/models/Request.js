const mongoose = require('mongoose');

const requestSchema = new mongoose.Schema({
  problem: { type: String, required: true },
  type: { type: String, required: true },
  category: { 
    type: String, 
    required: true, 
    default: 'Software Developer',
    enum: ['Plumber', 'Electrician', 'Mobile Technician', 'Software Developer', 'Cybersecurity Specialist'] 
  },
  severity: { type: String, required: true },
  analysis: { type: String, default: '' },
  image: { type: String, default: null },
  costEstimate: { type: String, default: 'Varies' },
  status: { 
    type: String, 
    enum: ['pending', 'accepted', 'in_progress', 'resolved'], 
    default: 'pending' 
  },
  customerToken: { type: String, required: true },
  customerName: { type: String, default: 'Customer' },
  customerLat: { type: Number, default: 28.6139 },
  customerLng: { type: Number, default: 77.2090 },
  expertId: { type: mongoose.Schema.Types.ObjectId, ref: 'Expert', default: null },
  customPrice: { type: String, default: null },
  paymentStatus: { 
    type: String, 
    enum: ['unpaid', 'escrow_held', 'released'], 
    default: 'unpaid' 
  },
  paymentAmount: { type: Number, default: 0 },
  invoiceNo: { type: String, default: null },
  rating: { type: Number, default: null },
  reviewText: { type: String, default: null },
  diagnosticData: { type: mongoose.Schema.Types.Mixed, default: null },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Request', requestSchema);
