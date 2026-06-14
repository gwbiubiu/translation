const input = document.getElementById("apiBase");
const status = document.getElementById("status");

chrome.storage.sync.get("apiBase", ({ apiBase }) => {
  input.value = apiBase || "http://localhost:5000";
});

document.getElementById("saveBtn").onclick = () => {
  const value = input.value.trim().replace(/\/$/, "") || "http://localhost:5000";
  chrome.storage.sync.set({ apiBase: value }, () => {
    status.textContent = "已保存";
    setTimeout(() => (status.textContent = ""), 2000);
  });
};
