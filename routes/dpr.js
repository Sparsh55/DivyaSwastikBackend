const express = require("express");
const router = express.Router();
const Material = require("../models/Material");
const Attendance = require("../models/Attendance");

function getMonthRange(year, month) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  return { start, end };
}

// 1. Material DPR Report API
router.get("/material-report/:projectId", async (req, res) => {
  try {
    const { projectId } = req.params;
    const { month, year } = req.query;
    if (!month || !year)
      return res.status(400).json({ msg: "Month and year required" });

    const { start, end } = getMonthRange(+year, +month);

    const materials = await Material.find({
      projectAssigned: projectId,
    }).lean();

    const report = materials.map((mat) => {
      const additions = [{
        date: mat.date.toISOString().split("T")[0],
        quantity: mat.quantity,
        addedBy: mat.addedBy,
        withinMonth: mat.date >= start && mat.date <= end,
      }];

      const consumptions = (mat.usageHistory || []).map((c) => ({
        date: c.date.toISOString().split("T")[0],
        quantity: c.quantity,
        consumedBy: c.takenBy || "N/A",
        withinMonth: c.date >= start && c.date <= end,
      }));

      const monthlyAdded = mat.date >= start && mat.date <= end ? mat.quantity : 0;
      const monthlyConsumed = consumptions
        .filter((c) => c.withinMonth)
        .reduce((sum, c) => sum + c.quantity, 0);

      return {
        matCode: mat.matCode,
        matName: mat.name,
        remaining: mat.availableQuantity || 0,
        additions,
        consumptions,
        monthlyAdded,
        monthlyConsumed,
      };
    });

    res.json({ materials: report });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server Error" });
  }
});

// 2. Attendance and Salary DPR Report API
router.get("/attendance-report/:projectId", async (req, res) => {
  try {
    const { projectId } = req.params;
    const { month, year } = req.query;
    if (!month || !year)
      return res.status(400).json({ msg: "Month and year required" });

    const { start, end } = getMonthRange(+year, +month);

    const attendances = await Attendance.find({
      date: { $gte: start, $lte: end },
    })
      .populate("employeeId", "name salaryPerDay contact role assignedProjects")
      .lean();

    const empMap = {};

    attendances.forEach((a) => {
      const emp = a.employeeId;

      // Filter by project
     if (!emp || !Array.isArray(emp.assignedProjects) || !emp.assignedProjects.some(p => p.toString() === projectId)) return;

      const eid = emp._id.toString();
      if (!empMap[eid]) {
        empMap[eid] = {
          employee: emp,
          attendance: [],
          present: 0,
          half: 0,
          absent: 0,
          totalSalary: 0,
        };
      }

      empMap[eid].attendance.push({
        date: a.date.toISOString().split("T")[0],
        status: a.status,
        inTime: a.inTime,
        outTime: a.outTime,
        dailyWork: a.work,
      });

      if (a.status === "Present") empMap[eid].present++;
      else if (a.status === "Half Day") empMap[eid].half++;
      else empMap[eid].absent++;
    });

    for (const eid in empMap) {
      const data = empMap[eid];
      const { salaryPerDay } = data.employee;
      data.totalSalary =
        (data.present + 0.5 * data.half) * (salaryPerDay || 0);
    }

    res.json({ employees: Object.values(empMap) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server Error" });
  }
});

module.exports = router;
