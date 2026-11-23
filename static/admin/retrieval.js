const retrievalSettingsForm = document.querySelector("#retrieval-settings-form");
const retrievalSettingsStatus = document.querySelector("#retrieval-settings-status");

async function retrievalSettingsRequest(options = {}) {
  const response = await fetch("/api/admin/retrieval-settings", {
    cache: "no-store",
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) {
    window.location.replace("/admin/login");
    throw new Error("登录状态已失效。");
  }
  if (!response.ok) throw new Error(payload.detail || "检索策略请求失败。");
  return payload;
}

function setRetrievalSettingsStatus(message, isError = false) {
  retrievalSettingsStatus.textContent = message;
  retrievalSettingsStatus.classList.toggle("is-error", isError);
}

async function fetchRetrievalSettings() {
  const settings = await retrievalSettingsRequest();
  retrievalSettingsForm.elements.results.value = settings.results;
  retrievalSettingsForm.elements.overfetch_factor.value = settings.overfetch_factor;
  retrievalSettingsForm.elements.max_cosine_distance.value = settings.max_cosine_distance;
  retrievalSettingsForm.elements.query_expansion.checked = settings.query_expansion;
  setRetrievalSettingsStatus("");
}

window.loadRetrievalSettings = () => fetchRetrievalSettings()
  .catch((error) => setRetrievalSettingsStatus(error.message, true));

retrievalSettingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const saveButton = document.querySelector("#retrieval-save-button");
  saveButton.disabled = true;
  setRetrievalSettingsStatus("正在保存检索策略…");
  const payload = {
    results: Number(retrievalSettingsForm.elements.results.value),
    overfetch_factor: Number(retrievalSettingsForm.elements.overfetch_factor.value),
    max_cosine_distance: Number(retrievalSettingsForm.elements.max_cosine_distance.value),
    query_expansion: retrievalSettingsForm.elements.query_expansion.checked,
  };
  try {
    const saved = await retrievalSettingsRequest({
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    retrievalSettingsForm.elements.results.value = saved.results;
    retrievalSettingsForm.elements.overfetch_factor.value = saved.overfetch_factor;
    retrievalSettingsForm.elements.max_cosine_distance.value = saved.max_cosine_distance;
    setRetrievalSettingsStatus("检索策略已保存，后续聊天和工作流检索将使用新配置。");
  } catch (error) {
    setRetrievalSettingsStatus(error.message, true);
  } finally {
    saveButton.disabled = false;
  }
});
