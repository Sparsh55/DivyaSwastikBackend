const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const upload = require('../middleware/upload')

const router = express.Router();

// Generate JWT Token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE
  });
};

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post(
  '/login',
  upload.single('loginImage'), // handle optional image upload
  [
    body('username').trim().isLength({ min: 3 }).withMessage('Username is required'),
    body('password').isLength({ min: 4 }).withMessage('Password must be at least 4 characters')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { username, password, deviceId } = req.body;

      const user = await User.findOne({ username, isActive: true });
      if (!user) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      const otp = user.generateOTP();

      // Initialize deviceInfo if undefined
      if (!user.deviceInfo) {
        user.deviceInfo = {};
      }

      // Update device info
      if (deviceId) {
        user.deviceInfo.deviceId = deviceId;
        user.deviceInfo.lastLoginDevice = req.headers['user-agent'] || 'Unknown';
      }

      // If image uploaded, store it
      if (req.file) {
        user.deviceInfo.loginImage = {
          filename: req.file.filename,
          path: req.file.path
        };
      }

      await user.save();

      res.json({
        success: true,
        message: 'OTP sent for verification',
        data: {
          userId: user._id,
          otp: otp,
          expiresAt: user.otp.expiresAt
        }
      });

    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error during login'
      });
    }
  }
);

// @route   POST /api/auth/verify-otp
// @desc    Verify OTP and complete login
// @access  Public
router.post('/verify-otp', [
  body('userId').isMongoId().withMessage('Valid user ID is required'),
  body('otp').isLength({ min: 4, max: 6 }).withMessage('OTP must be 4 to 6 digits') // adjust as per your OTP length
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { userId, otp } = req.body;

    const user = await User.findById(userId);
    if (!user || !user.isActive) {
      return res.status(404).json({
        success: false,
        message: 'User not found or inactive'
      });
    }

    // Use the model method to verify OTP
    const isOtpValid = user.verifyOTP(otp);
    if (!isOtpValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired OTP'
      });
    }

    user.lastLogin = new Date();
    await user.save();

    // Generate JWT token
    const token = generateToken(user._id);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: user._id,
          username: user.username,
          phone: user.phone,
          role: user.role,
          image: user.deviceInfo?.loginImage?.path || null,
          lastLogin: user.lastLogin
        }
      }
    });

  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during OTP verification'
    });
  }
});

router.post('/resend-otp', [
  body('userId').isMongoId().withMessage('Valid user ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { userId } = req.body;

    const user = await User.findById(userId);
    if (!user || !user.isActive) {
      return res.status(404).json({
        success: false,
        message: 'User not found or inactive'
      });
    }

    // Clear previous OTP
    user.otp = undefined;

    // Generate new OTP
    const newOtp = user.generateOTP(); // This updates `user.otp` internally
    await user.save();

    res.json({
      success: true,
      message: 'OTP resent successfully',
      data: {
        userId: user._id,
        otp: newOtp,
        expiresAt: user.otp.expiresAt
      }
    });
  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during resend OTP'
    });
  }
});

// @route   POST /api/auth/logout
// @desc    Logout user
// @access  Private
router.post('/logout', auth, async (req, res) => {
  try {
    // Clear OTP info
    await User.findByIdAndUpdate(req.user._id, {
      $unset: { otp: 1 }
    });

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during logout'
    });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user info
// @access  Private
router.get('/me', auth, (req, res) => {
  res.json({
    success: true,
    data: {
      id: req.user._id,
      username: req.user.username,
      phone: req.user.phone,
      role: req.user.role,
      image: user.deviceInfo?.loginImage || null,
      lastLogin: req.user.lastLogin,
      createdAt: req.user.createdAt
    }
  });
});

module.exports = router;
