const modelSettingsForm = document.querySelector("#model-settings-form");
const modelSettingsStatus = document.querySelector("#model-settings-status");
const modelPrompt = modelSettingsForm.elements.additional_prompt;
const modelApiKey = modelSettingsForm.elements.api_key;
const clearModelApiKey = modelSettingsForm.elements.clear_api_key;

async function modelSettingsRequest(url, options = {}) {
  const response = await fetch(url, { cache: "no-store", ...options });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) {
    window.location.replace("/");
    throw new Error("登录状态已失效。");
  }
  if (!response.ok) throw new Error(payload.detail || "模型设置请求失败。");
  return payload;
}

function setModelSettingsStatus(message, isError = false) {
  modelSettingsStatus.textContent = message;
  modelSettingsStatus.classList.toggle("is-error", isError);
}

function updatePromptCount() {
  document.querySelector("#model-prompt-count").textContent = `${modelPrompt.value.length.toLocaleString()} / 20,000`;
}

async function fetchModelSettings() {
  const settings = await modelSettingsRequest("/api/admin/model-settings");
  modelSettingsForm.elements.model.value = settings.model;
  modelSettingsForm.elements.vision_model.value = settings.vision_model;
  modelSettingsForm.elements.base_url.value = settings.base_url;
  modelPrompt.value = settings.additional_prompt || "";
  modelApiKey.value = "";
  clearModelApiKey.checked = false;
  clearModelApiKey.disabled = !settings.api_key_configured;
  document.querySelector("#model-api-key-state").textContent = settings.api_key_configured
    ? "API Key 已配置；密钥不会返回到网页。留空保存时保留当前密钥。"
    : "尚未配置 API Key；密钥只保存在服务端 SQLite，不会返回到网页。";
  updatePromptCount();
  setModelSettingsStatus("");
}

window.loadModelSettings = () => fetchModelSettings().catch((error) => setModelSettingsStatus(error.message, true));

modelPrompt.addEventListener("input", updatePromptCount);
clearModelApiKey.addEventListener("change", () => {
  modelApiKey.disabled = clearModelApiKey.checked;
  if (clearModelApiKey.checked) modelApiKey.value = "";
});

modelSettingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const saveButton = document.querySelector("#model-save-button");
  saveButton.disabled = true;
  setModelSettingsStatus("正在保存配置…");
  const payload = {
    model: modelSettingsForm.elements.model.value,
    vision_model: modelSettingsForm.elements.vision_model.value,
    base_url: modelSettingsForm.elements.base_url.value,
    additional_prompt: modelPrompt.value,
    api_key: modelApiKey.value,
    clear_api_key: clearModelApiKey.checked,
  };
  try {
    const saved = await modelSettingsRequest("/api/admin/model-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    modelApiKey.value = "";
    modelApiKey.disabled = false;
    clearModelApiKey.checked = false;
    clearModelApiKey.disabled = !saved.api_key_configured;
    document.querySelector("#model-api-key-state").textContent = saved.api_key_configured
      ? "API Key 已配置；密钥不会返回到网页。留空保存时保留当前密钥。"
      : "尚未配置 API Key；密钥只保存在服务端 SQLite，不会返回到网页。";
    setModelSettingsStatus("模型与提示词配置已保存。");
  } catch (error) {
    setModelSettingsStatus(error.message, true);
  } finally {
    saveButton.disabled = false;
  }
});

document.querySelector("#model-test-button").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  setModelSettingsStatus("正在检查模型服务…");
  try {
    const result = await modelSettingsRequest("/api/admin/model-settings/test", { method: "POST" });
    setModelSettingsStatus(result.message);
  } catch (error) {
    setModelSettingsStatus(error.message, true);
  } finally {
    button.disabled = false;
  }
});
