const agentList = document.querySelector("#agent-list");
const agentEditorForm = document.querySelector("#agent-editor-form");
const agentEditorStatus = document.querySelector("#agent-editor-status");
const adminAgentContextWrap = document.querySelector("#admin-agent-context-wrap");
const adminAgentContext = document.querySelector("#admin-agent-context");
const agentsLayout = document.querySelector("#agents-layout");
const agentListToolbar = document.querySelector("#agent-list-toolbar");
const agentCreateToolbar = document.querySelector("#agent-create-toolbar");
const selectedAgentStorageKey = "agno-selected-agent-id";
let managedAgents = [];
let selectedManagedAgentId = localStorage.getItem(selectedAgentStorageKey) || "";

window.getSelectedAgentId = () => selectedManagedAgentId;
window.getSelectedAgent = () => managedAgents.find((agent) => agent.id === selectedManagedAgentId) || null;

async function agentRequest(url, options = {}) {
  const response = await fetch(url, { cache: "no-store", ...options });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) {
    window.location.replace("/");
    throw new Error("登录状态已失效。");
  }
  if (!response.ok) throw new Error(payload.detail || "智能体请求失败。");
  return payload;
}

function setAgentEditorStatus(message, isError = false) {
  agentEditorStatus.textContent = message;
  agentEditorStatus.classList.toggle("is-error", isError);
}

function renderAgentList() {
  agentList.replaceChildren();
  if (!managedAgents.length) {
    const empty = document.createElement("p");
    empty.className = "agent-list-empty";
    empty.textContent = "还没有智能体，请新增并配置模型。";
    agentList.append(empty);
    return;
  }
  managedAgents.forEach((agent) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `agent-list-card${agent.id === selectedManagedAgentId ? " is-active" : ""}`;
    const name = document.createElement("strong");
    name.textContent = agent.name;
    const description = document.createElement("span");
    description.textContent = agent.description || agent.slug;
    const status = document.createElement("small");
    status.textContent = `${agent.provider === "deepseek" ? "DeepSeek" : "OpenAI 兼容"} · ${agent.status === "published" ? "已发布" : agent.status === "disabled" ? "已停用" : "草稿"}`;
    button.append(name, description, status);
    button.addEventListener("click", () => selectManagedAgent(agent.id));
    agentList.append(button);
  });
}

function renderAgentContext() {
  adminAgentContext.replaceChildren();
  managedAgents.forEach((agent) => adminAgentContext.add(new Option(agent.name, agent.id)));
  adminAgentContextWrap.hidden = managedAgents.length === 0 || !selectedManagedAgentId;
  if (selectedManagedAgentId) adminAgentContext.value = selectedManagedAgentId;
}

function selectManagedAgent(agentId) {
  setEditorPage(true);
  selectedManagedAgentId = agentId;
  localStorage.setItem(selectedAgentStorageKey, agentId);
  renderAgentList();
  renderAgentContext();
  adminAgentContext.value = agentId;
  const agent = window.getSelectedAgent();
  if (agent) fillAgentForm(agent);
  window.onSelectedAgentChanged?.();
}

function setEditorPage(isEditing) {
  agentsLayout.classList.toggle("is-editing", isEditing);
  document.body.classList.toggle("agent-editor-open", isEditing);
  agentListToolbar.hidden = isEditing;
  agentCreateToolbar.hidden = !isEditing;
  agentList.hidden = isEditing;
  document.querySelector("#agent-create-cancel").hidden = false;
  document.querySelector("#agent-model-test").hidden = !isEditing || !agentEditorForm.elements.id.value;
  document.querySelector("#agent-disable").hidden = !isEditing;
  document.querySelector("#agent-publish").hidden = !isEditing;
  document.querySelector("#agent-delete").hidden = !isEditing;
  document.querySelector("#agent-save").textContent = agentEditorForm.elements.id.value ? "保存更改" : "创建智能体";
  document.querySelector("#agent-page-title").textContent = agentEditorForm.elements.id.value ? "编辑智能体" : "创建智能体";
  document.querySelector("#agent-page-description").textContent = agentEditorForm.elements.id.value
    ? "维护智能体的业务信息、模型连接和专属指令。"
    : "配置业务身份、模型连接和专属指令。";
  document.querySelector("#agent-page-badge").textContent = agentEditorForm.elements.id.value ? "编辑配置" : "新建配置";
  document.querySelector("#agent-editor-title").textContent = agentEditorForm.elements.id.value ? "基本信息与模型配置" : "基本信息与模型配置";
}

function fillAgentForm(agent) {
  agentEditorForm.hidden = false;
  agentEditorForm.elements.id.value = agent.id;
  agentEditorForm.elements.name.value = agent.name;
  agentEditorForm.elements.slug.value = agent.slug;
  agentEditorForm.elements.description.value = agent.description;
  agentEditorForm.elements.provider.value = agent.provider;
  agentEditorForm.elements.model.value = agent.model;
  agentEditorForm.elements.vision_model.value = agent.vision_model;
  agentEditorForm.elements.base_url.value = agent.base_url;
  agentEditorForm.elements.additional_prompt.value = agent.additional_prompt || "";
  agentEditorForm.elements.api_key.value = "";
  agentEditorForm.elements.clear_api_key.checked = false;
  agentEditorForm.elements.clear_api_key.disabled = !agent.api_key_configured;
  document.querySelector("#agent-editor-title").textContent = agent.name;
  document.querySelector("#agent-status-badge").textContent = agent.status === "published" ? "已发布" : agent.status === "disabled" ? "已停用" : "草稿";
  document.querySelector("#agent-api-key-state").textContent = agent.api_key_configured
    ? "API Key 已配置，密钥不会返回网页。留空保存会保留当前密钥。"
    : "尚未配置 API Key。发布前必须配置有效密钥。";
  setAgentEditorStatus("");
  setEditorPage(true);
}

function startNewAgent() {
  agentEditorForm.hidden = false;
  agentEditorForm.reset();
  agentEditorForm.elements.id.value = "";
  setEditorPage(true);
  agentEditorForm.elements.provider.value = "deepseek";
  agentEditorForm.elements.model.value = "deepseek-chat";
  agentEditorForm.elements.vision_model.value = "deepseek-v4-flash-vision-exp";
  agentEditorForm.elements.base_url.value = "https://api.deepseek.com";
  agentEditorForm.elements.clear_api_key.disabled = true;
  document.querySelector("#agent-status-badge").textContent = "草稿";
  document.querySelector("#agent-api-key-state").textContent = "API Key 加密后保存在本机数据库。";
  setAgentEditorStatus("");
  agentEditorForm.elements.name.focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function cancelAgentCreation() {
  setEditorPage(false);
  agentEditorForm.hidden = true;
  renderAgentList();
}

window.closeAgentEditorPage = () => {
  setEditorPage(false);
  agentEditorForm.hidden = true;
};

async function loadAgents() {
  try {
    managedAgents = await agentRequest("/api/admin/agents");
    if (!managedAgents.some((agent) => agent.id === selectedManagedAgentId)) {
      selectedManagedAgentId = managedAgents[0]?.id || "";
    }
    if (selectedManagedAgentId) localStorage.setItem(selectedAgentStorageKey, selectedManagedAgentId);
    renderAgentList();
    renderAgentContext();
    if (!agentsLayout.classList.contains("is-editing")) agentEditorForm.hidden = true;
    window.onSelectedAgentChanged?.();
  } catch (error) {
    setAgentEditorStatus(error.message, true);
  }
}

function agentPayload() {
  return {
    name: agentEditorForm.elements.name.value,
    slug: agentEditorForm.elements.slug.value,
    description: agentEditorForm.elements.description.value,
    provider: agentEditorForm.elements.provider.value,
    model: agentEditorForm.elements.model.value,
    vision_model: agentEditorForm.elements.vision_model.value,
    base_url: agentEditorForm.elements.base_url.value,
    additional_prompt: agentEditorForm.elements.additional_prompt.value,
    api_key: agentEditorForm.elements.api_key.value,
    clear_api_key: agentEditorForm.elements.clear_api_key.checked,
  };
}

agentEditorForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const agentId = agentEditorForm.elements.id.value;
  const saveButton = document.querySelector("#agent-save");
  saveButton.disabled = true;
  setAgentEditorStatus("正在保存智能体…");
  try {
    const saved = await agentRequest(agentId ? `/api/admin/agents/${encodeURIComponent(agentId)}` : "/api/admin/agents", {
      method: agentId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(agentPayload()),
    });
    await loadAgents();
    selectManagedAgent(saved.id);
    setAgentEditorStatus("智能体配置已保存。");
  } catch (error) {
    setAgentEditorStatus(error.message, true);
  } finally {
    saveButton.disabled = false;
  }
});

document.querySelector("#agent-create").addEventListener("click", startNewAgent);
document.querySelector("#agent-create-back").addEventListener("click", cancelAgentCreation);
document.querySelector("#agent-create-cancel").addEventListener("click", cancelAgentCreation);
adminAgentContext.addEventListener("change", () => selectManagedAgent(adminAgentContext.value));
document.querySelector("#agent-model-test").addEventListener("click", async () => {
  const agentId = agentEditorForm.elements.id.value;
  if (!agentId) {
    setAgentEditorStatus("请先保存智能体，再测试模型连接。", true);
    return;
  }
  try {
    const result = await agentRequest(`/api/admin/agents/${encodeURIComponent(agentId)}/test-model`, { method: "POST" });
    setAgentEditorStatus(result.message);
  } catch (error) {
    setAgentEditorStatus(error.message, true);
  }
});

document.querySelector("#agent-publish").addEventListener("click", async () => {
  const agentId = agentEditorForm.elements.id.value;
  if (!agentId) return setAgentEditorStatus("请先保存智能体。", true);
  try {
    await agentRequest(`/api/admin/agents/${encodeURIComponent(agentId)}/publish`, { method: "POST" });
    await loadAgents();
    setAgentEditorStatus("智能体已发布。登录用户现在可以选择并使用它。");
  } catch (error) {
    setAgentEditorStatus(error.message, true);
  }
});

document.querySelector("#agent-disable").addEventListener("click", async () => {
  const agentId = agentEditorForm.elements.id.value;
  if (!agentId) return;
  try {
    await agentRequest(`/api/admin/agents/${encodeURIComponent(agentId)}/disable`, { method: "POST" });
    await loadAgents();
    setAgentEditorStatus("智能体已停用。");
  } catch (error) {
    setAgentEditorStatus(error.message, true);
  }
});

document.querySelector("#agent-delete").addEventListener("click", async () => {
  const agentId = agentEditorForm.elements.id.value;
  const agent = window.getSelectedAgent();
  if (!agentId || !agent) return;
  if (!window.confirm(`确定删除“${agent.name}”及其会话、知识库、工具和工作流吗？`)) return;
  try {
    await agentRequest(`/api/admin/agents/${encodeURIComponent(agentId)}`, { method: "DELETE" });
    selectedManagedAgentId = "";
    localStorage.removeItem(selectedAgentStorageKey);
    await loadAgents();
    setAgentEditorStatus("智能体及其业务数据已删除。");
  } catch (error) {
    setAgentEditorStatus(error.message, true);
  }
});

window.loadAgents = loadAgents;
window.onSelectedAgentChanged = () => {
  if (window.currentAdminRoute === "knowledge") window.loadKnowledgeSettings?.();
  if (window.currentAdminRoute === "tools") window.loadToolsSettings?.();
  if (window.currentAdminRoute === "workflows") window.loadWorkflowSettings?.();
  if (window.currentAdminRoute === "overview" || window.currentAdminRoute === "resources") window.refreshAdminOverview?.();
  if (["users", "roles", "grants", "matrix"].includes(window.currentAdminRoute)) window.reloadPermissionData?.();
};
