const express = require("express");
const router = express.Router();
const Attendance = require("../models/Attendance");
const moment = require("moment");

// POST: Mark attendance
router.post("/", async (req, res) => {
  try {
    const { employeeId, status, inTime, outTime, work, date } = req.body;
    // Check if attendance already exists for the same day
    const normalizedDate = moment(date).startOf("day").toDate();
    const existing = await Attendance.findOne({
      employeeId,
      date: {
        $gte: normalizedDate,
        $lt: moment(normalizedDate).add(1, "day").toDate(),
      },
    });
    if (existing) {
      return res
        .status(400)
        .json({ message: "Attendance already marked for this date" });
    }
    const newAttendance = new Attendance({
      employeeId,
      status,
      inTime,
      outTime,
      work,
      date:normalizedDate,
    });

    await newAttendance.save();
    res.status(201).json({ message: "Attendance recorded" });
  } catch (error) {
    res.status(500).json({ message: "Failed to save attendance", error });
  }
});

// Optional: GET all attendance
router.get("/", async (req, res) => {
  try {
    const records = await Attendance.find().populate("employeeId", "name");
    res.json(records);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch attendance" });
  }
});

router.get("/grouped", async (req, res) => {
  try {
    const allAttendance = await Attendance.find()
      .populate("employeeId", "name phone joinedDate assignedProjects") // ✅ populate more fields
      .lean();
    const grouped = {};

    allAttendance.forEach((record) => {
      const emp = record.employeeId;
      if (!emp) return;

      if (!grouped[emp._id]) {
        grouped[emp._id] = {
          employeeId: emp._id,
          name: emp.name,
          phone: emp.phone || "-",
          joinedDate: emp?.joinedDate || "-",
          project: emp?.assignedProjects || "-",
          records: [],
        };
      }

      grouped[emp._id].records.push({
        date: record.date,
        status: record.status,
        inTime: record.inTime || "-",
        outTime: record.outTime || "-",
        work: record.work || "-",
      });
    });

    res.json(Object.values(grouped));
  } catch (error) {
    console.error("Error in /grouped route:", error);
    res
      .status(500)
      .json({ message: "Failed to group attendance", error: error.message });
  }
});

module.exports = router;
