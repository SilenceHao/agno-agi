const callLogsSummary = document.querySelector("#call-logs-summary");
const callLogsBody = document.querySelector("#call-logs-body");
const callLogsEmpty = document.querySelector("#call-logs-empty");
const callLogsPagination = document.querySelector("#call-logs-pagination");
const callLogsSearch = document.querySelector("#call-logs-search");
const callLogsType = document.querySelector("#call-logs-type");
const callLogsStatus = document.querySelector("#call-logs-status");
const callLogsRefresh = document.querySelector("#call-logs-refresh");
const CALL_LOGS_PAGE_SIZE = 20;
const callLogTypeLabels = {
  chat: "智能体对话",
  workflow: "工作流",
  knowledge_search: "知识检索",
  http_tool: "HTTP 工具",
};
let callLogsPage = 1;
let callLogsTimer = null;
let callLogsRequestPending = false;
let callLogsSearchTimer = null;

async function callLogsRequest() {
  const params = new URLSearchParams({
    page: String(callLogsPage),
    page_size: String(CALL_LOGS_PAGE_SIZE),
    call_type: callLogsType.value,
    status: callLogsStatus.value,
    search: callLogsSearch.value.trim(),
  });
  const response = await fetch(`/api/admin/call-logs?${params}`, { cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) {
    window.location.replace("/admin/login");
    throw new Error("登录状态已失效。");
  }
  if (!response.ok) throw new Error(payload.detail || "读取调用日志失败。");
  return payload;
}

function appendCallLogSummary(label, counts) {
  const total = counts.success + counts.failed;
  const card = document.createElement("article");
  card.className = "call-logs-summary-card";
  const name = document.createElement("span");
  name.textContent = label;
  const amount = document.createElement("strong");
  amount.textContent = total.toLocaleString();
  const detail = document.createElement("small");
  detail.textContent = `成功 ${counts.success.toLocaleString()} · 失败 ${counts.failed.toLocaleString()}`;
  card.append(name, amount, detail);
  callLogsSummary.append(card);
}

function addCell(row, value, className = "") {
  const cell = document.createElement("td");
  if (className) cell.className = className;
  cell.textContent = value;
  row.append(cell);
  return cell;
}

function formatCallLogTime(timestamp) {
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime()) ? timestamp : parsed.toLocaleString();
}

function renderCallLogRow(log) {
  const row = document.createElement("tr");
  addCell(row, formatCallLogTime(log.created_at), "call-logs-time");
  addCell(row, log.username || "—");
  const resourceCell = document.createElement("td");
  const type = document.createElement("strong");
  type.textContent = callLogTypeLabels[log.call_type] || log.call_type;
  const resource = document.createElement("small");
  resource.textContent = log.resource_name || "—";
  resourceCell.append(type, resource);
  row.append(resourceCell);
  const conversation = log.conversation_title || (log.conversation_id ? "對话记录" : "—");
  addCell(row, conversation, "call-logs-conversation");
  const statusCell = document.createElement("td");
  const status = document.createElement("span");
  status.className = `call-logs-result call-logs-result-${log.status}`;
  status.textContent = log.status === "success" ? "成功" : "失败";
  statusCell.append(status);
  row.append(statusCell);
  addCell(row, `${Number(log.duration_ms || 0).toLocaleString()} ms`, "call-logs-duration");
  const summary = document.createElement("td");
  summary.className = "call-logs-detail";
  if (log.status === "failed") {
    summary.textContent = log.error_code || "调用失败";
  } else if (log.details?.result_count !== undefined) {
    summary.textContent = `命中 ${log.details.result_count} 个片段`;
  } else if (log.details?.step_count !== undefined) {
    summary.textContent = `执行 ${log.details.step_count} 个节点`;
  } else if (log.details?.status_code !== undefined) {
    summary.textContent = `HTTP ${log.details.status_code}`;
  } else if (log.details?.knowledge_result_count !== undefined) {
    summary.textContent = `检索 ${log.details.knowledge_result_count} 个片段`;
  } else {
    summary.textContent = "—";
  }
  row.append(summary);
  return row;
}

function renderCallLogs(payload) {
  callLogsSummary.replaceChildren();
  callLogsBody.replaceChildren();
  callLogsPagination.replaceChildren();
  for (const [type, label] of Object.entries(callLogTypeLabels)) {
    appendCallLogSummary(label, payload.summary[type]);
  }
  for (const log of payload.logs) callLogsBody.append(renderCallLogRow(log));
  callLogsEmpty.hidden = payload.logs.length > 0;
  if (payload.total_pages > 1) {
    const previous = document.createElement("button");
    previous.type = "button";
    previous.textContent = "上一页";
    previous.disabled = payload.page <= 1;
    previous.addEventListener("click", () => {
      callLogsPage = Math.max(1, callLogsPage - 1);
      refreshCallLogs();
    });
    const label = document.createElement("span");
    label.textContent = `第 ${payload.page} / ${payload.total_pages} 页 · 共 ${payload.total.toLocaleString()} 条`;
    const next = document.createElement("button");
    next.type = "button";
    next.textContent = "下一页";
    next.disabled = payload.page >= payload.total_pages;
    next.addEventListener("click", () => {
      callLogsPage = Math.min(payload.total_pages, callLogsPage + 1);
      refreshCallLogs();
    });
    callLogsPagination.append(previous, label, next);
  } else {
    const count = document.createElement("span");
    count.textContent = `共 ${payload.total.toLocaleString()} 条`;
    callLogsPagination.append(count);
  }
}

async function refreshCallLogs() {
  if (callLogsRequestPending) return;
  callLogsRequestPending = true;
  callLogsRefresh.disabled = true;
  try {
    renderCallLogs(await callLogsRequest());
  } catch (error) {
    callLogsBody.replaceChildren();
    callLogsEmpty.hidden = false;
    callLogsEmpty.textContent = error.message;
  } finally {
    callLogsRefresh.disabled = false;
    callLogsRequestPending = false;
  }
}

window.loadCallLogs = () => {
  window.clearInterval(callLogsTimer);
  callLogsPage = 1;
  refreshCallLogs();
  callLogsTimer = window.setInterval(refreshCallLogs, 30_000);
};
window.stopCallLogs = () => window.clearInterval(callLogsTimer);
callLogsRefresh.addEventListener("click", () => {
  callLogsPage = 1;
  refreshCallLogs();
});
callLogsType.addEventListener("change", () => {
  callLogsPage = 1;
  refreshCallLogs();
});
callLogsStatus.addEventListener("change", () => {
  callLogsPage = 1;
  refreshCallLogs();
});
callLogsSearch.addEventListener("input", () => {
  window.clearTimeout(callLogsSearchTimer);
  callLogsSearchTimer = window.setTimeout(() => {
    callLogsPage = 1;
    refreshCallLogs();
  }, 300);
});
