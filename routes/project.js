const express = require("express");
const { body, validationResult } = require("express-validator");
const Project = require("../models/Project");
const { auth } = require("../middleware/auth");

const router = express.Router();

// @route   POST /api/projects
// @desc    Create a new project
// @access  Private
router.post(
  "/",
  auth,
  [
    body("name")
      .trim()
      .isLength({ min: 1 })
      .withMessage("Project name is required"),
    body("description")
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage("Description must be less than 500 characters"),
    body("date")
      .optional()
      .isISO8601()
      .withMessage("Date must be valid ISO date"),
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

      const { name, description, date } = req.body;
      const existingProject = await Project.findOne({
        name: name.trim(),
        isActive: true,
        createdBy: req.user._id,
      });

      if (existingProject) {
        return res.status(400).json({
          success: false,
          message: "A project with this name already exists.",
        });
      }

      const project = new Project({
        name,
        description,
        date: date || new Date(),
        createdBy: req.user._id,
      });

      await project.save();
      await project.populate("createdBy", "username");

      res.status(201).json({
        success: true,
        message: "Project created successfully",
        data: project,
      });
    } catch (error) {
      console.error("Project creation error:", error);
      res.status(500).json({
        success: false,
        message: "Server error during project creation",
      });
    }
  }
);

// @route   GET /api/projects
// @desc    Get all projects (with pagination and filters)
// @access  Private
router.get("/", auth, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      search,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const filter = {};

    // Add status filter
    if (status) filter.status = status;

    // Add search filter
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    // For regular users, only show their projects
    if (req.user.role !== "admin") {
      filter.createdBy = req.user._id;
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === "desc" ? -1 : 1;

    const pageNumber = parseInt(page, 10);
    const limitNumber = parseInt(limit, 10);

    const projects = await Project.find(filter)
      .populate("createdBy", "username")
      .sort(sortOptions)
      .limit(limitNumber)
      .skip((pageNumber - 1) * limitNumber);

    const total = await Project.countDocuments(filter);

    res.json({
      success: true,
      data: {
        projects,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalProjects: total,
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1,
        },
      },
    });
  } catch (error) {
    console.error("Get projects error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching projects",
    });
  }
});

// @route   GET /api/projects/:id
// @desc    Get single project
// @access  Private
router.get("/:id", auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id).populate(
      "createdBy",
      "username"
    );

    if (!project || !project.isActive) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Check if user can access this project
    if (
      req.user.role !== "admin" &&
      project.createdBy._id.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    res.json({
      success: true,
      data: project,
    });
  } catch (error) {
    console.error("Get project error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching project",
    });
  }
});

// @route   PUT /api/projects/:id
// @desc    Update project
// @access  Private
router.put(
  "/:id",
  auth,
  [
    body("name")
      .optional()
      .trim()
      .isLength({ min: 1 })
      .withMessage("Project name cannot be empty"),
    body("description")
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage("Description must be less than 500 characters"),
    body("status")
      .optional()
      .isIn(["active", "completed", "on-hold", "cancelled"])
      .withMessage("Invalid status"),
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

      const project = await Project.findById(req.params.id);

      if (!project) {
        return res.status(404).json({
          success: false,
          message: "Project not found",
        });
      }

      // Check if user can update this project
      if (
        req.user.role !== "admin" &&
        project.createdBy.toString() !== req.user._id.toString()
      ) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }

      const allowedUpdates = ["name", "description", "status", "date"];
      const updates = {};

      Object.keys(req.body).forEach((key) => {
        if (allowedUpdates.includes(key)) {
          updates[key] = req.body[key];
        }
      });

      const updatedProject = await Project.findByIdAndUpdate(
        req.params.id,
        updates,
        { new: true, runValidators: true }
      ).populate("createdBy", "username");

      res.json({
        success: true,
        message: "Project updated successfully",
        data: updatedProject,
      });
    } catch (error) {
      console.error("Update project error:", error);
      res.status(500).json({
        success: false,
        message: "Server error during project update",
      });
    }
  }
);

// @route   DELETE /api/projects/:id
// @desc    Delete project (soft delete)
// @access  Private
router.delete("/:id", auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Check if user can delete this project
    if (
      req.user.role !== "admin" &&
      project.createdBy.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    await Project.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: "Project deleted successfully",
    });
  } catch (error) {
    console.error("Delete project error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during project deletion",
    });
  }
});

// @route   PATCH /api/projects/:id/status
// @desc    Change project status
// @access  Private
router.patch(
  "/:id/status",
  auth,
  [
    body("status")
      .notEmpty()
      .withMessage("Status is required")
      .isIn(["active", "completed", "on-hold", "cancelled"])
      .withMessage("Invalid status"),
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

      const project = await Project.findById(req.params.id);

      if (!project) {
        return res.status(404).json({
          success: false,
          message: "Project not found",
        });
      }

      // Check if user can update this project
      if (
        req.user.role !== "admin" &&
        project.createdBy.toString() !== req.user._id.toString()
      ) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }

      const { status } = req.body;

      // Check if status is actually changing
      if (project.status === status) {
        return res.status(400).json({
          success: false,
          message: "Project already has this status",
        });
      }

      project.status = status;
      await project.save();
      await project.populate("createdBy", "username");

      res.json({
        success: true,
        message: "Project status updated successfully",
        data: project,
      });
    } catch (error) {
      console.error("Update project status error:", error);
      res.status(500).json({
        success: false,
        message: "Server error during project status update",
      });
    }
  }
);

module.exports = router;
