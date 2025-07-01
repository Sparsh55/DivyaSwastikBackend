const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    phone: {
      type: String,
      required: true,
      unique: true,
      match: /^[0-9]{10}$/,
    },
    role: {
      type: String,
      enum: ["admin", "user"],
      default: "user",
    },
    otp: {
      code: String,
      expiresAt: Date,
      verified: {
        type: Boolean,
        default: false,
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: Date,
    deviceInfo: {
      deviceId: String,
      lastLoginDevice: String,
      loginImage: {
        filename: String,
        path: String,
      },
    },
    projectAssigned: {
      type: mongoose.Schema.Types.ObjectId, // or mongoose.Schema.Types.ObjectId if referencing Project model
      ref: "Project",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Generate OTP (hardcoded for testing)
userSchema.methods.generateOTP = function () {
  const otp = "1234"; // Hardcoded for testing
  this.otp = {
    code: otp,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
    verified: false,
  };
  return otp;
};

userSchema.methods.verifyOTP = function (inputOtp) {
  if (this.otp.verified) return false;
  if (this.otp.expiresAt < new Date()) return false;
  if (this.otp.code === inputOtp) {
    this.otp.verified = true;
    return true;
  }
  return false;
};

module.exports = mongoose.model("User", userSchema);
