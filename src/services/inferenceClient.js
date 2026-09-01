const axios = require("axios");
const FormData = require("form-data");

const INFERENCE_SERVICE_URL = process.env.INFERENCE_SERVICE_URL || "http://localhost:8000";
const REQUEST_TIMEOUT_MS = parseInt(process.env.INFERENCE_TIMEOUT_MS || "60000", 10);
const POLLING_INTERVAL_MS = 2000;

/**
 * Check whether the inference service is up and responding.
 * Useful for a startup check or a /health endpoint on the Node side.
 */
async function checkHealth() {
  try {
    const res = await axios.get(`${INFERENCE_SERVICE_URL}/health`, {
      timeout: 5000,
    });
    return res.data;
  } catch (err) {
    return { status: "unreachable", error: err.message };
  }
}

/**
 * Send an X-ray image buffer to the inference service and poll for completion.
 *
 * @param {Buffer} fileBuffer - raw image bytes (from multer memoryStorage)
 * @param {string} filename - original filename, forwarded for content-type inference
 * @param {string} mimetype - e.g. 'image/png'
 * @param {object} options - { threshold: number, explainTopN: number, externalPatientId: string, patientName: string, ... }
 * @returns {Promise<{findings: Array, explanations: Array}>}
 */
async function predict(fileBuffer, filename, mimetype, options = {}) {
  const { 
    threshold = 0.5, 
    explainTopN = 1,
    externalPatientId = "unknown",
    patientName = "Unknown",
    age = 0,
    gender = "Unknown",
    scanDate = new Date().toISOString(),
    scanType = "Chest X-ray",
    clinicalSymptoms = "",
    clinicalHistory = ""
  } = options;

  const form = new FormData();
  form.append("file", fileBuffer, { filename, contentType: mimetype });
  form.append("externalPatientId", externalPatientId);
  form.append("patientName", patientName);
  form.append("age", age);
  form.append("gender", gender);
  form.append("scanDate", scanDate);
  form.append("scanType", scanType);
  form.append("clinicalSymptoms", clinicalSymptoms);
  form.append("clinicalHistory", clinicalHistory);

  // 1. Submit the job
  const startResponse = await axios.post(
    `${INFERENCE_SERVICE_URL}/predict`,
    form,
    {
      headers: form.getHeaders(),
      params: { threshold, explain_top_n: explainTopN },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: REQUEST_TIMEOUT_MS,
    }
  );

  const { job_id } = startResponse.data;
  if (!job_id) {
    throw new Error("Inference service failed to return a job_id");
  }

  // 2. Poll for completion
  const startTime = Date.now();
  while (Date.now() - startTime < REQUEST_TIMEOUT_MS) {
    const statusResponse = await axios.get(`${INFERENCE_SERVICE_URL}/status/${job_id}`);
    const { status, findings, error } = statusResponse.data;

    if (status === "completed") {
      return findings; // findings is { findings: [...], explanations: [...] } per tasks.py
    } else if (status === "failed") {
      throw new Error(`Inference job failed: ${error || "Unknown error"}`);
    }

    await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL_MS));
  }

  throw new Error("Inference request timed out during polling");
}

module.exports = {
  checkHealth,
  predict,
};