import express from "express";
import { upload } from "../upload";
import { analyzeCxr, getPatients, getPatient } from "../controllers/analysisController.js";


const router = express.Router();

router.post("/analyze", upload.single("image"), analyzeCxr);
router.get("/patients", getPatients);
router.get("/patients/:id", getPatient);

export default router;