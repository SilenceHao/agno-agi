const sidebar = document.querySelector("#sidebar");
const scrim = document.querySelector("#scrim");
const navItems = [...document.querySelectorAll(".nav-item")];
const navGroups = [...document.querySelectorAll(".nav-group")];
const overviewView = document.querySelector("#overview-view");
const moduleView = document.querySelector("#module-view");
const knowledgeLayout = document.querySelector("#knowledge-layout");
const toolsLayout = document.querySelector("#tools-layout");
const resourceSummary = document.querySelector("#resource-summary");
const modulePlaceholder = document.querySelector("#module-placeholder");
const modelSettingsLayout = document.querySelector("#model-settings-layout");
const retrievalSettingsLayout = document.querySelector("#retrieval-settings-layout");
const monitoringLayout = document.querySelector("#monitoring-layout");
const callLogsLayout = document.querySelector("#call-logs-layout");
const workflowLayout = document.querySelector("#workflow-layout");
const permissionLayout = document.querySelector("#permission-layout");
const breadcrumbTitle = document.querySelector("#breadcrumb-title");
const toast = document.querySelector("#toast");
let toastTimer = null;
const scrollbarTimers = new WeakMap();
const SCROLLBAR_HIDE_DELAY_MS = 700;
const NAV_GROUP_STATE_KEY = "agno-admin-menu-groups";

const plannedModules = {
  agents: ["智能体列表", "集中查看和配置多个智能体实例。"],
  models: ["模型与提示词", "配置 DeepSeek 模型、连接地址和全局补充提示词。"],
  retrieval: ["检索策略", "配置知识检索范围、召回和来源展示策略。"],
  policy: ["对话与工具调用策略", "管理智能体的对话行为和工具调用约束。"],
  releases: ["版本与发布", "管理智能体配置版本、发布与回滚。"],
  resources: ["全部资源", "统一查看知识库和 HTTP 工具；其他资源类型将在后续接入。"],
  workflows: ["工作流管理", "按顺序编排智能体、知识库和 HTTP 工具节点。"],
  mcp: ["MCP / 外部服务", "维护 MCP 服务及其授权范围。"],
  datasources: ["数据源管理", "配置受控的数据源和查询权限。"],
  users: ["用户管理", "搜索账号并分配业务角色。"],
  roles: ["角色管理", "维护角色名称与说明。"],
  grants: ["资源授权", "为角色分配可访问的知识库目录与 HTTP 工具。"],
  matrix: ["权限矩阵", "检查主体与资源之间的有效授权关系。"],
  monitoring: ["运行监控", "查看智能体服务、模型依赖与本地资源状态。"],
  logs: ["会话与调用日志", "按时间、类型和结果追踪智能体及资源调用。"],
  audit: ["操作审计", "记录管理操作、资源授权和高风险调用。"],
};

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2400);
}

function setRoute(route, title) {
  if (route !== "monitoring") window.stopMonitoring?.();
  if (route !== "logs") window.stopCallLogs?.();
  document.body.classList.remove("workflow-editing");
  if (route === "workflows") {
    document.querySelector("#workflow-list-page").hidden = false;
    document.querySelector("#workflow-editor-panel").hidden = true;
  }
  navItems.forEach((item) => {
    if (item.dataset.view === route) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
  overviewView.hidden = route !== "overview";
  moduleView.hidden = true;
  resourceSummary.hidden = true;
  modulePlaceholder.hidden = true;
  modelSettingsLayout.hidden = true;
  retrievalSettingsLayout.hidden = true;
  monitoringLayout.hidden = true;
  callLogsLayout.hidden = true;
  callLogsLayout.hidden = true;
  workflowLayout.hidden = true;
  permissionLayout.hidden = true;
  knowledgeLayout.hidden = route !== "knowledge";
  toolsLayout.hidden = route !== "tools";
  breadcrumbTitle.textContent = title;
  document.querySelector("#global-search").value = "";
  document.querySelectorAll(".nav-group").forEach((group) => {
    group.hidden = false;
    group.querySelectorAll(".nav-item").forEach((item) => { item.hidden = false; });
  });

  if (route === "overview") {
    refreshOverview();
  } else if (route === "knowledge") {
    window.loadKnowledgeSettings?.();
  } else if (route === "tools") {
    window.loadToolsSettings?.();
  } else if (route === "workflows") {
    moduleView.hidden = false;
    document.querySelector("#module-title").textContent = plannedModules.workflows[0];
    document.querySelector("#module-description").textContent = plannedModules.workflows[1];
    workflowLayout.hidden = false;
    window.loadWorkflowSettings?.();
  } else if (route === "models") {
    moduleView.hidden = false;
    document.querySelector("#module-title").textContent = plannedModules.models[0];
    document.querySelector("#module-description").textContent = plannedModules.models[1];
    modelSettingsLayout.hidden = false;
    window.loadModelSettings?.();
  } else if (route === "retrieval") {
    moduleView.hidden = false;
    document.querySelector("#module-title").textContent = plannedModules.retrieval[0];
    document.querySelector("#module-description").textContent = plannedModules.retrieval[1];
    retrievalSettingsLayout.hidden = false;
    window.loadRetrievalSettings?.();
  } else if (route === "monitoring") {
    moduleView.hidden = false;
    document.querySelector("#module-title").textContent = plannedModules.monitoring[0];
    document.querySelector("#module-description").textContent = plannedModules.monitoring[1];
    monitoringLayout.hidden = false;
    window.loadMonitoring?.();
  } else if (route === "logs") {
    moduleView.hidden = false;
    document.querySelector("#module-title").textContent = plannedModules.logs[0];
    document.querySelector("#module-description").textContent = plannedModules.logs[1];
    callLogsLayout.hidden = false;
    window.loadCallLogs?.();
  } else {
    const module = plannedModules[route];
    if (module) {
      moduleView.hidden = false;
      document.querySelector("#module-title").textContent = module[0];
      document.querySelector("#module-description").textContent = module[1];
      if (route === "resources") {
        resourceSummary.hidden = false;
        refreshOverview();
      } else if (["users", "roles", "grants", "matrix"].includes(route)) {
        permissionLayout.hidden = false;
        window.loadPermissionView?.(route);
      } else {
        modulePlaceholder.hidden = false;
      }
    }
  }

  closeMobileNavigation();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function closeMobileNavigation() {
  sidebar.classList.remove("mobile-open");
  scrim.classList.remove("active");
}

function restoreNavigationGroups() {
  let savedState = {};
  try {
    savedState = JSON.parse(localStorage.getItem(NAV_GROUP_STATE_KEY) || "{}");
  } catch {
    localStorage.removeItem(NAV_GROUP_STATE_KEY);
  }
  navGroups.forEach((group, index) => {
    const toggle = group.querySelector(".nav-label");
    const groupKey = group.dataset.group || String(index);
    const collapsed = Boolean(savedState[groupKey]);
    group.classList.toggle("is-collapsed", collapsed);
    toggle.setAttribute("aria-expanded", String(!collapsed));
    toggle.addEventListener("click", () => {
      const nextCollapsed = group.classList.toggle("is-collapsed");
      toggle.setAttribute("aria-expanded", String(!nextCollapsed));
      try {
        const state = Object.fromEntries(navGroups.map((item, itemIndex) => [
          item.dataset.group || String(itemIndex),
          item.classList.contains("is-collapsed"),
        ]));
        localStorage.setItem(NAV_GROUP_STATE_KEY, JSON.stringify(state));
      } catch {
        showToast("无法保存菜单展开状态。");
      }
    });
  });
}

window.showAdminOverview = () => setRoute("overview", "总览");

async function readJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) {
    window.location.replace("/");
    throw new Error("登录状态已失效。");
  }
  if (!response.ok) throw new Error(payload.detail || "读取管理数据失败。");
  return payload;
}

function updateServiceState(element, isReady, readyText, unavailableText) {
  element.textContent = isReady ? readyText : unavailableText;
  element.classList.toggle("warn", !isReady);
}

async function refreshOverview() {
  const results = await Promise.allSettled([
    readJson("/api/knowledge"),
    readJson("/api/tools"),
    readJson("/api/health"),
  ]);
  const [knowledgeResult, toolsResult, healthResult] = results;
  let hasWarning = false;

  if (knowledgeResult.status === "fulfilled") {
    const knowledge = knowledgeResult.value;
    const documents = knowledge.documents || [];
    const statusCounts = knowledge.status_counts || {};
    const readyCount = statusCounts.ready ?? documents.filter((item) => item.status === "ready").length;
    const indexingCount = statusCounts.indexing ?? documents.filter((item) => item.status === "indexing").length;
    const failedCount = statusCounts.failed ?? documents.filter((item) => item.status === "failed").length;
    const totalDocuments = knowledge.total ?? documents.length;
    document.querySelector("#metric-documents").textContent = String(totalDocuments);
    document.querySelector("#metric-ready-documents").textContent = `${readyCount} 份已建立索引${indexingCount ? ` · ${indexingCount} 份处理中` : ""}${failedCount ? ` · ${failedCount} 份失败` : ""}`;
    document.querySelector("#resource-document-count").textContent = `${totalDocuments} 份`;
    document.querySelector("#resource-summary-documents").textContent = String(totalDocuments);
    const navCount = document.querySelector('[data-view="knowledge"] .nav-count');
    if (navCount) navCount.textContent = String(totalDocuments);
    updateServiceState(
      document.querySelector("#health-vector"),
      Boolean(knowledge.model_available),
      "正常",
      "不可用",
    );
    document.querySelector("#health-vector-detail").textContent = knowledge.model_available
      ? `向量模型 ${knowledge.model} 已连接`
      : `未连接本机向量模型 ${knowledge.model}`;
    document.querySelector("#metric-index-model").textContent = knowledge.model_available ? "正常" : "不可用";
    document.querySelector("#metric-index-model-detail").textContent = knowledge.model_available
      ? `Ollama · ${knowledge.model}`
      : "请启动 Ollama 并确认模型已安装";
    if (!knowledge.model_available || failedCount > 0) hasWarning = true;
  } else {
    document.querySelector("#metric-ready-documents").textContent = knowledgeResult.reason.message;
    updateServiceState(document.querySelector("#health-vector"), false, "正常", "读取失败");
    hasWarning = true;
  }

  if (toolsResult.status === "fulfilled") {
    const tools = toolsResult.value;
    const enabledCount = tools.filter((item) => item.enabled).length;
    document.querySelector("#metric-tools").textContent = String(tools.length);
    document.querySelector("#metric-enabled-tools").textContent = String(enabledCount);
    document.querySelector("#metric-tool-state").textContent = `${enabledCount} 个启用 · ${tools.length - enabledCount} 个停用`;
    document.querySelector("#resource-tool-count").textContent = `${tools.length} 个`;
    document.querySelector("#resource-summary-tools").textContent = String(tools.length);
    const navCount = document.querySelector('[data-view="tools"] .nav-count');
    if (navCount) navCount.textContent = String(tools.length);
  } else {
    document.querySelector("#metric-tool-state").textContent = toolsResult.reason.message;
    hasWarning = true;
  }

  if (healthResult.status === "fulfilled") {
    const health = healthResult.value;
    updateServiceState(
      document.querySelector("#health-model"),
      Boolean(health.deepseek_configured),
      "正常",
      "未配置",
    );
    if (!health.deepseek_configured) hasWarning = true;
  } else {
    updateServiceState(document.querySelector("#health-model"), false, "正常", "读取失败");
    hasWarning = true;
  }

  const statusChip = document.querySelector("#system-status");
  const healthSummary = document.querySelector("#health-summary");
  statusChip.classList.toggle("neutral", hasWarning);
  healthSummary.classList.toggle("neutral", hasWarning);
  statusChip.lastChild.textContent = hasWarning ? "部分服务需要检查" : "系统运行正常";
  healthSummary.lastChild.textContent = hasWarning ? "需要检查" : "运行正常";
}

async function initializeAdmin() {
  try {
    const payload = await readJson("/api/auth/me");
    if (!payload.authenticated || !payload.user?.is_super_admin) {
      window.location.replace("/");
      return;
    }
    document.querySelector("#admin-username").textContent = payload.user.username;
    document.querySelector("#admin-role").textContent = payload.user.is_super_admin ? "超级管理员" : "管理角色";
    await refreshOverview();
  } catch (error) {
    if (error.message !== "登录状态已失效。") showToast(error.message);
  }
}

document.addEventListener("click", (event) => {
  const navItem = event.target.closest(".nav-item");
  if (navItem) {
    setRoute(navItem.dataset.view, navItem.dataset.title);
    return;
  }
  const routeLink = event.target.closest("[data-open-view]");
  if (routeLink) {
    const route = routeLink.dataset.openView;
    const navItemForRoute = navItems.find((item) => item.dataset.view === route);
    setRoute(route, navItemForRoute?.dataset.title || "总览");
    return;
  }
  const toastAction = event.target.closest("[data-toast]");
  if (toastAction) showToast(toastAction.dataset.toast);
});

document.querySelector("#collapse-btn").addEventListener("click", () => {
  const collapsed = document.body.classList.toggle("sidebar-collapsed");
  document.querySelector("#collapse-btn").setAttribute("aria-label", collapsed ? "展开侧边栏" : "收起侧边栏");
});
function revealActiveScrollbar(element) {
  element.classList.add("is-scrolling");
  window.clearTimeout(scrollbarTimers.get(element));
  scrollbarTimers.set(element, window.setTimeout(() => {
    element.classList.remove("is-scrolling");
    scrollbarTimers.delete(element);
  }, SCROLLBAR_HIDE_DELAY_MS));
}

document.addEventListener("scroll", (event) => {
  if (event.target instanceof Element) revealActiveScrollbar(event.target);
}, { capture: true, passive: true });
window.addEventListener("scroll", () => revealActiveScrollbar(document.documentElement), { passive: true });
document.querySelector("#mobile-menu").addEventListener("click", () => {
  sidebar.classList.add("mobile-open");
  scrim.classList.add("active");
});
scrim.addEventListener("click", closeMobileNavigation);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeMobileNavigation();
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    document.querySelector("#global-search").focus();
  }
});
document.querySelector("#global-search").addEventListener("input", (event) => {
  const query = event.currentTarget.value.trim().toLocaleLowerCase();
  document.querySelectorAll(".nav-group").forEach((group) => {
    let hasVisibleItem = false;
    group.querySelectorAll(".nav-item").forEach((item) => {
      const matches = !query || item.textContent.toLocaleLowerCase().includes(query);
      item.hidden = !matches;
      hasVisibleItem ||= matches;
    });
    group.hidden = !hasVisibleItem;
  });
});
document.querySelector("#global-search").addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  const firstVisible = navItems.find((item) => !item.hidden && !item.closest(".nav-group").hidden);
  if (firstVisible) firstVisible.click();
});
document.querySelector("#admin-logout").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const response = await fetch("/api/auth/logout", { method: "POST", cache: "no-store" });
    if (!response.ok) throw new Error("退出登录失败，请重试。");
    window.location.replace("/");
  } catch (error) {
    showToast(error.message);
    button.disabled = false;
  }
});

restoreNavigationGroups();
initializeAdmin();
