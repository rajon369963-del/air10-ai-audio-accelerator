document.getElementById("triggerBtn")?.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "EXECUTE_MICRO_TOOL" }, (res) => {
    alert("Execution Success: " + (res?.result?.status || "OK"));
  });
});

document.getElementById("studyCheck")?.addEventListener("change", (e) => {
  chrome.runtime.sendMessage({ type: "TOGGLE_STUDY_MODE", enabled: e.target.checked }, (res) => {
    console.log("Study Mode Updated:", res);
  });
});
