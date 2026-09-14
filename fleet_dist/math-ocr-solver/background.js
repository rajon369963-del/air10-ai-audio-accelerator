// Background Service Worker for CIVEX Math OCR Solver
import { LimbClient } from "./modules/civex-brain-limb-bridge.js";
import { ZeroTrackerTelemetry } from "./modules/zero-tracker-telemetry.js";

const client = new LimbClient({ toolId: "math-ocr-solver" });
const telemetry = new ZeroTrackerTelemetry();

chrome.runtime.onInstalled.addListener(() => {
  client.connect().then(info => {
    console.log("[CIVEX Math OCR Solver] Initialized in " + info.mode + " mode.");
    telemetry.trackMetric("math-ocr-solver", "INSTALL_SUCCESS", 1.0);
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "EXECUTE_MICRO_TOOL") {
    client.executeTask(request.task || "DEFAULT", request.payload || {}).then(res => {
      telemetry.trackMetric("math-ocr-solver", "TASK_EXECUTE", 1.0);
      sendResponse({ success: true, toolId: "math-ocr-solver", result: res });
    });
    return true;
  }
  if (request.type === "TOGGLE_STUDY_MODE") {
    const res = client.toggleStudyMode(request.enabled);
    sendResponse({ success: true, studyModeState: res });
    return true;
  }
});
