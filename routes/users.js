const express = require("express");
const { body, validationResult } = require("express-validator");
const User = require("../models/User");
const { auth, adminAuth } = require("../middleware/auth");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
require('dotenv').config();

const router = express.Router();

// Configure nodemailer (Gmail example – configure env vars)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.ADMIN_EMAIL,
    pass: process.env.ADMIN_EMAIL_PASSWORD,
  },
});

// @route   POST /api/users
// @desc    Add a new user (Admin only)
// @access  Private/Admin
router.post(
  "/",
  async (req, res, next) => {
    const userCount = await User.countDocuments();
    if (userCount === 0) {
      return next();
    }
    return adminAuth(req, res, next);
  },
  [
    body("username")
      .trim()
      .isLength({ min: 3 })
      .withMessage("Username must be at least 3 characters"),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters"),
    body("phone")
      .matches(/^[0-9]{10}$/)
      .withMessage("Phone must be 10 digits"),
    body("role")
      .isIn(["admin", "user"])
      .withMessage("Role must be admin or user"),
    body("projectAssigned")
      .notEmpty()
      .withMessage("Project assigned is required"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const { username, password, phone, role, projectAssigned } = req.body;

      // Check if user already exists
      const existingUser = await User.findOne({
        $or: [{ username }, { phone }],
      });

      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: "User with this username or phone already exists",
        });
      }

      // Check if project exists
      const Project = require("../models/Project");
      const projectExists = await Project.findById(projectAssigned);
      if (!projectExists) {
        return res.status(400).json({
          success: false,
          message: "Invalid project selected",
        });
      }

      const user = new User({
        username,
        password,
        phone,
        role,
        projectAssigned,
      });

      await user.save();

      // Send email with plain password
      await transporter.sendMail({
        from: process.env.ADMIN_EMAIL,
        to: 'sparssaxena9654@gmail.com',
        subject: `New user: ${username}`,
        text: `User created with:\n- Username: ${username}\n- Phone: ${phone}\n- Role: ${role}\n- Project: ${project.name}\n- Password: ${password}`,
      });

      res.status(201).json({
        success: true,
        message: "User created successfully",
        data: {
          id: user._id,
          username: user.username,
          phone: user.phone,
          role: user.role,
          projectAssigned: user.projectAssigned,
          createdAt: user.createdAt,
        },
      });
    } catch (error) {
      console.error("User creation error:", error);
      res.status(500).json({
        success: false,
        message: "Server error during user creation",
      });
    }
  }
);

/// @route   GET /api/users
// @desc    Get users (Admin only), optionally filter by project
// @access  Private/Admin
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 10, role, isActive, projectId } = req.query;

    const filter = {};
    if (role) filter.role = role;
    if (isActive !== undefined) filter.isActive = isActive === "true";
    if (projectId) filter.projectAssigned = projectId;

    const users = await User.find(filter)
      .populate("projectAssigned", "name")
      .select("-password -otp")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments(filter);

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          currentPage: Number(page),
          totalPages: Math.ceil(total / limit),
          totalUsers: total,
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1,
        },
      },
    });
  } catch (error) {
    console.error("Get users error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching users",
    });
  }
});
// @route   PUT /api/users/refresh-all
// @desc    Refresh all users (clear OTP, reset login status)
// @access  Private/Admin
router.put("/refresh-all", adminAuth, async (req, res) => {
  try {
    const result = await User.updateMany(
      {},
      {
        $unset: { otp: 1 },
        $set: { lastLogin: null },
      }
    );

    res.json({
      success: true,
      message: "All users refreshed successfully",
      data: {
        modifiedCount: result.modifiedCount,
      },
    });
  } catch (error) {
    console.error("Refresh users error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during user refresh",
    });
  }
});

// @route   PUT /api/users/:id/status
// @desc    Update user status (Admin only)
// @access  Private/Admin
router.put("/:id/status", adminAuth, async (req, res) => {
  try {
    const { isActive } = req.body;

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive },
      { new: true }
    ).select("-password -otp");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      message: `User ${isActive ? "activated" : "deactivated"} successfully`,
      data: user,
    });
  } catch (error) {
    console.error("Update user status error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during status update",
    });
  }
});

// @route   DELETE /api/users/:id
// @desc    Delete a user by ID (Admin only)
// @access  Private/Admin
router.delete("/:id", adminAuth, async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during user deletion",
    });
  }
});

// @route   PUT /api/users/:id
// @desc    Update user info (Admin only)
// @access  Private/Admin
router.put(
  "/:id",
  adminAuth,
  [
    body("username")
      .optional()
      .isLength({ min: 3 })
      .withMessage("Username must be at least 3 characters"),
    body("phone")
      .optional()
      .matches(/^[0-9]{10}$/)
      .withMessage("Phone must be 10 digits"),
    body("role")
      .optional()
      .isIn(["admin", "user"])
      .withMessage("Role must be admin or user"),
    body("projectAssigned")
      .optional()
      .notEmpty()
      .withMessage("Project assigned is required"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const { username, phone, role, projectAssigned } = req.body;

      // Check if projectAssigned is valid (if provided)
      if (projectAssigned) {
        const Project = require("../models/Project");
        const projectExists = await Project.findById(projectAssigned);
        if (!projectExists) {
          return res.status(400).json({
            success: false,
            message: "Invalid project selected",
          });
        }
      }

      const updatedUser = await User.findByIdAndUpdate(
        req.params.id,
        { username, phone, role, projectAssigned },
        { new: true, runValidators: true }
      ).select("-password -otp");

      if (!updatedUser) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      res.json({
        success: true,
        message: "User updated successfully",
        data: updatedUser,
      });
    } catch (error) {
      console.error("Update user error:", error);
      res.status(500).json({
        success: false,
        message: "Server error while updating user",
      });
    }
  }
);

router.put(
  "/:id/reset-password",
  adminAuth,
  body("newPassword").isLength({ min: 6 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ success: false, errors: errors.array() });

    const { id } = req.params;
    const { newPassword } = req.body;

    const user = await User.findById(id);
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    // ✅ Hash the new password using bcrypt
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    user.password = hashedPassword;
    await user.save();

    // Send email to admin with updated password info
    const emailOptions = {
      from: process.env.ADMIN_EMAIL,
      to: 'sparshsaxena9654@gmail.com',
      subject: `Password Reset for ${user.username}`,
      text: `Password was reset for user:\n\nUsername: ${
        user.username
      }\nPhone: ${user.phone}\nRole: ${
        user.role
      }\nNew Password: ${newPassword}\n\nTime: ${new Date().toLocaleString()}`,
    };

    try {
      await transporter.sendMail(emailOptions);
    } catch (err) {
      console.error("Email send error:", err.message);
    }

    return res.json({
      success: true,
      message: "Password reset successfully and email sent to admin",
    });
  }
);
module.exports = router;
