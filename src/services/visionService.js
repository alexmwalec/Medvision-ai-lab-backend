import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VISION_SCRIPT = path.join(__dirname, "../../python_ai/vision_processor.py");

export const processImage = async (imagePath) => {
  return new Promise((resolve, reject) => {
    console.log("Starting computer vision processing...");
    
    const python = spawn("python3", [VISION_SCRIPT]);
    let result = "";
    let error = "";

    // Read image and send to Python
    const imageData = fs.readFileSync(imagePath);
    const imageBase64 = imageData.toString('base64');

    const inputData = {
      image: imageBase64,
      operation: "analyze"
    };

    python.stdin.write(JSON.stringify(inputData));
    python.stdin.end();

    python.stdout.on("data", (data) => {
      result += data.toString();
    });

    python.stderr.on("data", (data) => {
      error += data.toString();
    });

    python.on("close", (code) => {
      if (code !== 0) {
        console.error("Vision processing error:", error);
        reject(new Error(error || "Vision processing failed"));
        return;
      }
      
      try {
        const visionResult = JSON.parse(result);
        console.log("Vision processing complete");
        resolve(visionResult);
      } catch (e) {
        console.error("Failed to parse vision result:", result);
        reject(new Error("Invalid response from vision service"));
      }
    });

    setTimeout(() => {
      python.kill();
      reject(new Error("Vision processing timeout (30s)"));
    }, 30000);
  });
};

export const generateHeatmap = async (imagePath, findings) => {
  // calling Python to generate heatmap overlay
  
  return `/heatmap/${path.basename(imagePath, path.extname(imagePath))}.png`;
};