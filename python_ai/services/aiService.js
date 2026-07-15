import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PYTHON_SCRIPT = path.join(__dirname, "../../python_ai/main.py");

export const analyzeWithAI = (patientData) => {
  return new Promise((resolve, reject) => {
    const python = spawn("python3", [PYTHON_SCRIPT]);
    let result = "";
    let error = "";

    python.stdin.write(JSON.stringify(patientData));
    python.stdin.end();

    python.stdout.on("data", (data) => {
      result += data.toString();
    });

    python.stderr.on("data", (data) => {
      error += data.toString();
    });

    python.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(error || "Python process failed"));
        return;
      }
      try {
        resolve(JSON.parse(result));
      } catch (e) {
        reject(new Error("Invalid response from AI"));
      }
    });

    setTimeout(() => {
      python.kill();
      reject(new Error("AI analysis timeout (30s)"));
    }, 30000);
  });
};