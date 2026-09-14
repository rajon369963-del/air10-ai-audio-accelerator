// Background Service Worker for CIVEX ZeroTracker Guard
import { LimbClient } from "./modules/civex-brain-limb-bridge.js";
import { ZeroTrackerTelemetry } from "./modules/zero-tracker-telemetry.js";

const client = new LimbClient({ toolId: "zerotracker-guard" });
const telemetry = new ZeroTrackerTelemetry();

chrome.runtime.onInstalled.addListener(() => {
  client.connect().then(info => {
    console.log("[CIVEX ZeroTracker Guard] Initialized in " + info.mode + " mode.");
    telemetry.trackMetric("zerotracker-guard", "INSTALL_SUCCESS", 1.0);
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "EXECUTE_MICRO_TOOL") {
    client.executeTask(request.task || "DEFAULT", request.payload || {}).then(res => {
      telemetry.trackMetric("zerotracker-guard", "TASK_EXECUTE", 1.0);
      sendResponse({ success: true, toolId: "zerotracker-guard", result: res });
    });
    return true;
  }
  if (request.type === "TOGGLE_STUDY_MODE") {
    const res = client.toggleStudyMode(request.enabled);
    sendResponse({ success: true, studyModeState: res });
    return true;
  }
});
