const express = require("express");
const router = express.Router();
const Employee = require("../models/Employee");
const Project = require("../models/Project");
const { adminAuth } = require("../middleware/auth");

// ✅ Create new employee (with duplicate & project check)
router.post("/", adminAuth, async (req, res) => {
  try {
    const {
      name,
      phone,
      address,
      salaryPerDay,
      joiningDate,
      assignedProjects,
    } = req.body;

    if (!name || !phone || !salaryPerDay || !joiningDate || !assignedProjects) {
      return res.status(400).json({ message: "Required fields missing" });
    }

    // Duplicate name or phone check
    const existing = await Employee.findOne({
      $or: [
        { name: { $regex: new RegExp(`^${name}$`, "i") } },
        { phone },
      ],
    });

    if (existing) {
      return res.status(400).json({ message: "Employee with same name or phone already exists" });
    }

    // Validate assigned project IDs
    if (assignedProjects?.length > 0) {
      const validProjects = await Project.find({ _id: { $in: assignedProjects } });
      if (validProjects.length !== assignedProjects.length) {
        return res.status(400).json({ message: "Invalid project ID(s)" });
      }
    }

    const newEmployee = new Employee({
      name,
      phone,
      address,
      salaryPerDay,
      joiningDate,
      assignedProjects,
    });

    await newEmployee.save();
    res.status(201).json(newEmployee);
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

// ✅ Get all employees
router.get("/", adminAuth, async (req, res) => {
  try {
    const employees = await Employee.find().populate("assignedProjects", "name");
    res.json(employees);
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

// ✅ Get employees by project ID
router.get("/project/:projectId", adminAuth, async (req, res) => {
  try {
    const { projectId } = req.params;

    const employees = await Employee.find({
      assignedProjects: projectId,
    }).populate("assignedProjects", "name");

    res.json(employees);
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

// ✅ Get single employee by ID
router.get("/:id", adminAuth, async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id).populate("assignedProjects", "name");

    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    res.json(employee);
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

// ✅ Update employee
router.put("/:id", adminAuth, async (req, res) => {
  try {
    const { assignedProjects } = req.body;

    // Validate assigned projects if provided
    if (assignedProjects?.length > 0) {
      const validProjects = await Project.find({ _id: { $in: assignedProjects } });
      if (validProjects.length !== assignedProjects.length) {
        return res.status(400).json({ message: "Invalid project ID(s)" });
      }
    }

    const updated = await Employee.findByIdAndUpdate(req.params.id, req.body, { new: true });

    if (!updated) {
      return res.status(404).json({ message: "Employee not found" });
    }

    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

// ✅ Hard delete employee
router.delete("/:id", adminAuth, async (req, res) => {
  try {
    const deleted = await Employee.findByIdAndDelete(req.params.id);

    if (!deleted) {
      return res.status(404).json({ message: "Employee not found" });
    }

    res.json({ message: "Employee permanently deleted" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

module.exports = router;
