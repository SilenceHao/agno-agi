const monitoringComponents = document.querySelector("#monitoring-components");
const monitoringResources = document.querySelector("#monitoring-resources");
const monitoringUpdated = document.querySelector("#monitoring-updated");
const monitoringUptime = document.querySelector("#monitoring-uptime");
const monitoringRefresh = document.querySelector("#monitoring-refresh");
const monitoringComponentLabels = {
  service: ["智能体服务", "API 进程正在运行"],
  database: ["本地数据库", "SQLite 业务数据连接"],
  ollama: ["Ollama 向量模型", "本机嵌入模型服务与模型"],
  models: ["智能体模型配置", "已配置 API Key 的智能体数量"],
};
const monitoringStatusLabels = {
  healthy: "运行正常",
  unavailable: "暂不可用",
  authentication_error: "鉴权失败",
  not_configured: "尚未配置",
};
let monitoringRefreshTimer = null;
let monitoringRequestPending = false;

async function fetchMonitoringStatus() {
  const response = await fetch("/api/admin/monitoring", { cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) {
    window.location.replace("/admin/login");
    throw new Error("登录状态已失效。");
  }
  if (!response.ok) throw new Error(payload.detail || "读取运行状态失败。");
  return payload;
}

function appendMonitoringComponent(name, status, modelName = "") {
  const [title, description] = monitoringComponentLabels[name];
  const card = document.createElement("article");
  card.className = "monitoring-component-card";
  const header = document.createElement("div");
  header.className = "monitoring-component-heading";
  const titleElement = document.createElement("strong");
  titleElement.textContent = title;
  const statusElement = document.createElement("span");
  statusElement.className = `monitoring-state monitoring-state-${status}`;
  statusElement.textContent = monitoringStatusLabels[status] || "未知状态";
  header.append(titleElement, statusElement);
  const note = document.createElement("p");
  note.textContent = description;
  card.append(header, note);
  if (modelName) {
    const model = document.createElement("small");
    model.textContent = modelName;
    card.append(model);
  }
  monitoringComponents.append(card);
}

function appendMonitoringMetric(label, value, detail = "") {
  const card = document.createElement("article");
  card.className = "monitoring-resource-card";
  const heading = document.createElement("span");
  heading.textContent = label;
  const amount = document.createElement("strong");
  amount.textContent = Number(value || 0).toLocaleString();
  card.append(heading, amount);
  if (detail) {
    const note = document.createElement("small");
    note.textContent = detail;
    card.append(note);
  }
  monitoringResources.append(card);
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return `${days ? `${days} 天 ` : ""}${hours} 小时 ${minutes} 分 ${remainder} 秒`;
}

function renderMonitoringStatus(payload) {
  monitoringComponents.replaceChildren();
  monitoringResources.replaceChildren();
  appendMonitoringComponent("service", payload.components.service);
  appendMonitoringComponent("database", payload.components.database);
  appendMonitoringComponent("ollama", payload.components.ollama, payload.models.embedding);
  appendMonitoringComponent("models", payload.components.models, `${payload.models.configured_agents} 个已配置`);
  const resources = payload.resources;
  appendMonitoringMetric("知识文档", resources.documents, `已索引 ${resources.ready_documents} · 处理中 ${resources.indexing_documents} · 失败 ${resources.failed_documents}`);
  appendMonitoringMetric("启用的 HTTP 工具", resources.enabled_tools);
  appendMonitoringMetric("已发布工作流", resources.published_workflows);
  appendMonitoringMetric("注册账号", resources.users);
  appendMonitoringMetric("会话记录", resources.conversations);
  monitoringUptime.textContent = `运行时间 ${formatUptime(payload.uptime_seconds)}`;
  const checkedAt = new Date(payload.checked_at);
  monitoringUpdated.textContent = `最近更新 ${checkedAt.toLocaleString()}`;
}

async function refreshMonitoringStatus() {
  if (monitoringRequestPending) return;
  monitoringRequestPending = true;
  monitoringRefresh.disabled = true;
  monitoringRefresh.textContent = "正在检查…";
  try {
    renderMonitoringStatus(await fetchMonitoringStatus());
  } catch (error) {
    monitoringComponents.replaceChildren();
    const message = document.createElement("p");
    message.className = "monitoring-error";
    message.textContent = error.message;
    monitoringComponents.append(message);
  } finally {
    monitoringRefresh.disabled = false;
    monitoringRefresh.textContent = "刷新状态";
    monitoringRequestPending = false;
  }
}

window.loadMonitoring = () => {
  window.clearInterval(monitoringRefreshTimer);
  refreshMonitoringStatus();
  monitoringRefreshTimer = window.setInterval(refreshMonitoringStatus, 30_000);
};
window.stopMonitoring = () => window.clearInterval(monitoringRefreshTimer);
monitoringRefresh.addEventListener("click", refreshMonitoringStatus);
