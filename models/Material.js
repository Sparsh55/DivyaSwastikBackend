const mongoose = require('mongoose');

const materialSchema = new mongoose.Schema({
  name:{type:String, required:true},
  matCode: { type: String, required: true },
  quantity: { type: Number, required: true },
  availableQuantity: { type: Number },
  amount: { type: Number },
  date: { type: Date, default: Date.now, required: true },
  document: { type: String },
  addedBy: { type: String, required: true },
  status: {
  type: String,
  enum: ['Available', 'Out of Stock', 'On Hold'],
  default: 'Available'
},
  usageHistory: [{
    takenBy: { type: String },
    quantity: Number,
    date: { type: Date, default: Date.now }
  }],
  projectAssigned: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'Project',
  required: true
}
}, {
  timestamps: true // ✅ Correct location
});

module.exports = mongoose.model('Material', materialSchema);
