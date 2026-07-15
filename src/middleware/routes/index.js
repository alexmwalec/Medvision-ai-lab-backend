import express from "express";
import { upload } from "../upload";
import { analyzeCxr, getPatients, getPatient } from "../controllers/analysisController.js";


const router = express.Router();

router.get("/", (req, res) => {
  res.json({
    name: "MedVision API",
    version: "2.0.0",
    endpoints: ["/analyze", "/patients", "/patients/:id"],
  });
});

router.post("/analyze", upload.single("image"), analyzeCxr);
router.get("/patients", getPatients);
router.get("/patients/:id", getPatient);

export default router;