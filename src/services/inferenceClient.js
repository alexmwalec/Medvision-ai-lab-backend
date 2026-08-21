const axios = require("axios");
const FormData = require("form-data");

const INFERENCE_SERVICE_URL = process.env.INFERENCE_SERVICE_URL || "http://localhost:8000";
const REQUEST_TIMEOUT_MS = parseInt(process.env.INFERENCE_TIMEOUT_MS || "60000", 10);

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
 * Send an X-ray image buffer to the inference service and get back
 * predictions + Grad-CAM explanations.
 *
 * @param {Buffer} fileBuffer - raw image bytes (from multer memoryStorage)
 * @param {string} filename - original filename, forwarded for content-type inference
 * @param {string} mimetype - e.g. 'image/png'
 * @param {object} options - { threshold: number, explainTopN: number }
 * @returns {Promise<{findings: Array, explanations: Array}>}
 */
async function predict(fileBuffer, filename, mimetype, options = {}) {
  const { threshold = 0.5, explainTopN = 1 } = options;

  const form = new FormData();
  form.append("file", fileBuffer, { filename, contentType: mimetype });

  const response = await axios.post(
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

  return response.data; // { findings, explanations }
}

module.exports = {
  checkHealth,
  predict,
};