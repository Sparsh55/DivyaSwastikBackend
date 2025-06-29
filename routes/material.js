const express = require("express");
const router = express.Router();
const Material = require("../models/Material");
const multer = require("multer");
const path = require("path");
const { adminAuth } = require("../middleware/auth");
const Project = require("../models/Project");

// Setup multer for document upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});
const upload = multer({ storage: storage });

// Admin adds material
router.post("/add", adminAuth, upload.single("document"), async (req, res) => {
  try {
    const { matCode, quantity, amount, addedBy, date, projectAssigned } =
      req.body;

    const project = await Project.findById(projectAssigned);
    if (!project) {
      return res.status(400).json({ error: "Invalid project selected" });
    }

    const material = new Material({
      matCode,
      quantity,
      availableQuantity: quantity,
      amount,
      document: req.file ? req.file.path : "",
      addedBy,
      date: date ? new Date(date) : new Date(),
      projectAssigned,
    });

    await material.save();
    res.status(201).json(material);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// User takes material
router.post("/take", async (req, res) => {
  try {
    const { matCode, quantity, takenBy, date } = req.body;
    let qtyToTake = Number(quantity);

    // Find all materials with this matCode ordered by oldest date first (FIFO)
    const materials = await Material.find({
      matCode,
      availableQuantity: { $gt: 0 },
    }).sort({ date: 1 });

    if (!materials.length) {
      return res
        .status(404)
        .json({ error: "Material not found or out of stock" });
    }

    // Calculate total available quantity across all documents
    const totalAvailable = materials.reduce(
      (acc, m) => acc + m.availableQuantity,
      0
    );

    if (totalAvailable < qtyToTake) {
      return res.status(400).json({ error: "Not enough material available" });
    }

    // Deduct quantity from multiple documents in FIFO manner
    for (const material of materials) {
      if (qtyToTake <= 0) break;

      if (material.availableQuantity >= qtyToTake) {
        // Deduct remaining qtyToTake from this document
        material.availableQuantity -= qtyToTake;
        material.usageHistory.push({
          takenBy,
          quantity: qtyToTake,
          date: date ? new Date(date) : new Date(),
        });
        await material.save();
        qtyToTake = 0;
      } else {
        // Deduct all availableQuantity from this document and continue
        qtyToTake -= material.availableQuantity;
        material.usageHistory.push({
          takenBy,
          quantity: material.availableQuantity,
          date: date ? new Date(date) : new Date(),
        });
        material.availableQuantity = 0;
        await material.save();
      }
    }

    res.status(200).json({ message: "Material taken successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get materials (with optional matCode filter)
router.get("/", async (req, res) => {
  try {
    const materials = await Material.find({});
    res.status(200).json(materials);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/total-availability", adminAuth, async (req, res) => {
  try {
    const totals = await Material.aggregate([
      {
        $group: {
          _id: "$matCode",
          totalAvailable: { $sum: "$availableQuantity" },
        },
      },
    ]);

    res.status(200).json(totals);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/total-consumed", adminAuth, async (req, res) => {
  try {
    const totals = await Material.aggregate([
      { $unwind: "$usageHistory" },
      {
        $group: {
          _id: "$matCode",
          totalConsumed: { $sum: "$usageHistory.quantity" },
        },
      },
    ]);

    res.status(200).json(totals);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/status/:matCode", adminAuth, async (req, res) => {
  try {
    const { status } = req.body;
    const { matCode } = req.params;

    if (!["available", "on hold", "out of stock"].includes(status)) {
      return res.status(400).json({ error: "Invalid status value" });
    }

    const result = await Material.updateMany(
      { matCode: matCode },
      {
        $set: {
          status: status,
          // If status is out of stock, set availableQuantity to 0 as well
          ...(status === "out of stock" ? { availableQuantity: 0 } : {}),
        },
      }
    );

    if (result.matchedCount === 0) {
      return res
        .status(404)
        .json({ error: "No materials found with this matCode" });
    }

    res
      .status(200)
      .json({
        message: `Status updated for matCode ${matCode}`,
        modifiedCount: result.modifiedCount,
      });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get full material documents grouped by matCode
router.get("/all-details-grouped", async (req, res) => {
  try {
    const materials = await Material.find({}).populate("projectAssigned");

    // Group materials by matCode
    const grouped = materials.reduce((acc, mat) => {
      if (!acc[mat.matCode]) {
        acc[mat.matCode] = [];
      }
      acc[mat.matCode].push(mat);
      return acc;
    }, {});

    // Convert object to array of { matCode, documents }
    const result = Object.entries(grouped).map(([matCode, documents]) => ({
      matCode,
      documents,
    }));

    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const deletedMaterial = await Material.findByIdAndDelete(id);
    if (!deletedMaterial) {
      return res.status(404).json({ error: "Material document not found" });
    }

    res.status(200).json({ message: "Material document deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router.delete("/by-code/:matCode", adminAuth, async (req, res) => {
  try {
    const { matCode } = req.params;

    const result = await Material.deleteMany({ matCode });

    if (result.deletedCount === 0) {
      return res
        .status(404)
        .json({ message: `No materials found with matCode: ${matCode}` });
    }

    res
      .status(200)
      .json({
        message: `Deleted ${result.deletedCount} material(s) with matCode: ${matCode}`,
      });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
