const mongoose = require("mongoose");

const employeeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  phone: {
    type: String,
    required: true,
    unique: false,
  },
  address: {
    type: String,
    trim: true,
    lowercase: true,
  },
  salaryPerDay: {
    type: Number,
    required: true,
  },
  joiningDate: {
    type: Date,
    required: true,
  },
  assignedProjects: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required:true,
    },
  ],
  dateCreated: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Employee", employeeSchema);
