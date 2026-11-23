const workflowList = document.querySelector("#workflow-list");
const workflowListPage = document.querySelector("#workflow-list-page");
const workflowEditorPanel = document.querySelector("#workflow-editor-panel");
const workflowForm = document.querySelector("#workflow-form");
const workflowSearch = document.querySelector("#workflow-search");
const workflowCount = document.querySelector("#workflow-count");
const workflowNodes = document.querySelector("#workflow-nodes");
const workflowResources = { knowledge_folders: [], http_tools: [] };
let workflows = [];
let selectedWorkflowId = null;
let workflowSearchTerm = "";
let workflowLoaded = false;

async function workflowRequest(url, options = {}) {
  const response = await fetch(url, { cache: "no-store", ...options });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) {
    window.location.replace("/admin/login");
    throw new Error("登录状态已失效。");
  }
  if (!response.ok) throw new Error(payload.detail || "工作流请求失败。");
  return payload;
}

function workflowToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2600);
}

function currentWorkflow() {
  return workflows.find((item) => item.id === selectedWorkflowId) || null;
}

function openWorkflowEditor(workflow) {
  selectedWorkflowId = workflow.id;
  workflowListPage.hidden = true;
  workflowEditorPanel.hidden = false;
  document.body.classList.add("workflow-editing");
  document.querySelector("#breadcrumb-title").textContent = "工作流编辑";
  renderWorkflowList();
  renderWorkflowEditor(workflow);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function returnToWorkflowList() {
  const workflow = currentWorkflow();
  if (workflow) {
    workflow.name = workflowForm.elements.name.value.trim() || workflow.name;
    workflow.description = workflowForm.elements.description.value.trim();
  }
  selectedWorkflowId = null;
  workflowEditorPanel.hidden = true;
  workflowListPage.hidden = false;
  document.body.classList.remove("workflow-editing");
  document.querySelector("#breadcrumb-title").textContent = "工作流管理";
  renderWorkflowList();
}

function defaultNode(type) {
  const base = { id: crypto.randomUUID(), type, name: type === "agent" ? "智能体回答" : type === "knowledge" ? "检索知识库" : "调用 HTTP 工具" };
  if (type === "agent") base.config = { prompt: "请根据以下输入回答：\n{{input}}\n\n上一步结果：\n{{previous}}", deep_thinking: false };
  if (type === "knowledge") base.config = { query: "{{input}}", folder_ids: [], max_results: 5 };
  if (type === "http") base.config = { tool_id: workflowResources.http_tools[0]?.id || "", parameters: {} };
  return base;
}

function renderWorkflowList() {
  workflowList.replaceChildren();
  const filtered = workflows.filter((item) => `${item.name} ${item.description}`.toLocaleLowerCase().includes(workflowSearchTerm));
  workflowCount.textContent = workflowSearchTerm ? `${filtered.length} / ${workflows.length} 个工作流` : `${workflows.length} 个工作流`;
  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "workflow-list-empty";
    empty.textContent = workflows.length ? "没有匹配的工作流。" : "还没有工作流，请先新建。";
    workflowList.append(empty);
    return;
  }
  filtered.forEach((workflow) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `workflow-card${workflow.id === selectedWorkflowId ? " is-active" : ""}`;
    const title = document.createElement("strong");
    title.textContent = workflow.name;
    const description = document.createElement("span");
    description.textContent = workflow.description || "未填写说明";
    const meta = document.createElement("small");
    meta.textContent = `${workflow.node_count} 个节点 · ${workflow.status === "published" ? "已发布" : workflow.status === "disabled" ? "已停用" : "草稿"}`;
    item.append(title, description, meta);
    item.addEventListener("click", () => {
      openWorkflowEditor(workflow);
    });
    workflowList.append(item);
  });
}

function appendLabel(parent, text, control) {
  const label = document.createElement("label");
  label.textContent = text;
  label.append(control);
  parent.append(label);
}

function renderNodeConfig(container, node) {
  container.replaceChildren();
  if (node.type === "agent") {
    const prompt = document.createElement("textarea");
    prompt.rows = 4;
    prompt.value = node.config.prompt || "{{input}}";
    prompt.addEventListener("input", () => { node.config.prompt = prompt.value; });
    appendLabel(container, "提示词", prompt);
    const thinkingLabel = document.createElement("label");
    thinkingLabel.className = "workflow-checkbox-label";
    const thinking = document.createElement("input");
    thinking.type = "checkbox";
    thinking.checked = Boolean(node.config.deep_thinking);
    thinking.addEventListener("change", () => { node.config.deep_thinking = thinking.checked; });
    thinkingLabel.append(thinking, document.createTextNode("启用深度思考"));
    container.append(thinkingLabel);
  } else if (node.type === "knowledge") {
    const query = document.createElement("input");
    query.value = node.config.query || "{{input}}";
    query.addEventListener("input", () => { node.config.query = query.value; });
    appendLabel(container, "检索问题", query);
    const folders = document.createElement("select");
    folders.multiple = true;
    folders.size = Math.min(4, Math.max(2, workflowResources.knowledge_folders.length));
    workflowResources.knowledge_folders.forEach((folder) => {
      const option = document.createElement("option");
      option.value = folder.id;
      option.textContent = folder.name;
      option.selected = (node.config.folder_ids || []).includes(folder.id);
      folders.append(option);
    });
    folders.addEventListener("change", () => { node.config.folder_ids = [...folders.selectedOptions].map((option) => option.value); });
    appendLabel(container, "限定目录（可多选，留空使用用户授权范围）", folders);
    const max = document.createElement("input");
    max.type = "number";
    max.min = "1";
    max.max = "20";
    max.value = node.config.max_results || 5;
    max.addEventListener("input", () => { node.config.max_results = Number(max.value) || 5; });
    appendLabel(container, "最多返回片段", max);
  } else {
    const tool = document.createElement("select");
    workflowResources.http_tools.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = `${item.name} · ${item.method}`;
      option.selected = item.id === node.config.tool_id;
      tool.append(option);
    });
    tool.addEventListener("change", () => { node.config.tool_id = tool.value; });
    appendLabel(container, "HTTP 工具", tool);
    const params = document.createElement("textarea");
    params.rows = 4;
    params.value = JSON.stringify(node.config.parameters || {}, null, 2);
    params.addEventListener("change", () => {
      try { node.config.parameters = JSON.parse(params.value || "{}"); params.classList.remove("is-invalid"); }
      catch { params.classList.add("is-invalid"); }
    });
    appendLabel(container, "参数 JSON（字符串可使用 {{input}} / {{previous}}）", params);
  }
}

function renderWorkflowNodes(nodes) {
  workflowNodes.replaceChildren();
  document.querySelector("#workflow-node-count").textContent = `${nodes.length} 个节点`;
  nodes.forEach((node, index) => {
    const card = document.createElement("article");
    card.className = "workflow-node-card";
    const header = document.createElement("div");
    header.className = "workflow-node-header";
    const number = document.createElement("span");
    number.className = "workflow-node-number";
    number.textContent = String(index + 1).padStart(2, "0");
    const name = document.createElement("input");
    name.value = node.name;
    name.maxLength = 80;
    name.addEventListener("input", () => { node.name = name.value; });
    const type = document.createElement("select");
    [["agent", "智能体"], ["knowledge", "知识库"], ["http", "HTTP 工具"]].forEach(([value, label]) => {
      const option = document.createElement("option"); option.value = value; option.textContent = label; option.selected = node.type === value; type.append(option);
    });
    type.addEventListener("change", () => { const replacement = defaultNode(type.value); node.type = replacement.type; node.config = replacement.config; renderWorkflowNodes(nodes); });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "workflow-node-remove";
    remove.textContent = "删除";
    remove.addEventListener("click", () => { nodes.splice(index, 1); renderWorkflowNodes(nodes); });
    header.append(number, name, type, remove);
    const config = document.createElement("div");
    config.className = "workflow-node-config";
    renderNodeConfig(config, node);
    card.append(header, config);
    workflowNodes.append(card);
  });
}

function renderWorkflowEditor(workflow) {
  if (!workflow) return;
  workflowForm.elements.id.value = workflow.id;
  workflowForm.elements.name.value = workflow.name;
  workflowForm.elements.description.value = workflow.description || "";
  document.querySelector("#workflow-editor-title").textContent = workflow.name;
  const status = document.querySelector("#workflow-editor-status");
  status.textContent = workflow.status === "published" ? "已发布" : workflow.status === "disabled" ? "已停用" : "草稿";
  status.className = `status-chip ${workflow.status === "draft" ? "neutral" : ""}`;
  document.querySelector("#workflow-disable").hidden = workflow.status !== "published";
  document.querySelector("#workflow-publish").hidden = workflow.status === "published";
  renderWorkflowNodes(workflow.nodes);
}

async function fetchWorkflowSettings() {
  const agentId = window.getSelectedAgentId?.() || "";
  if (!agentId) throw new Error("请先新增一个智能体。");
  const agentQuery = `agent_id=${encodeURIComponent(agentId)}`;
  const listRequest = workflowRequest(`/api/admin/workflows?${agentQuery}`);
  const [listResult, resourceResult] = await Promise.allSettled([
    listRequest,
    workflowRequest(`/api/admin/resources?${agentQuery}`),
  ]);
  if (listResult.status === "rejected") throw listResult.reason;
  workflows = listResult.value;
  workflowLoaded = true;
  renderWorkflowList();
  if (resourceResult.status === "fulfilled") {
    workflowResources.knowledge_folders = resourceResult.value.knowledge_folders || [];
    workflowResources.http_tools = resourceResult.value.http_tools || [];
  }
  if (currentWorkflow()) renderWorkflowEditor(currentWorkflow());
  if (resourceResult.status === "rejected") {
    workflowToast(`工作流列表已加载，但资源选项加载失败：${resourceResult.reason.message}`);
  }
}

window.loadWorkflowSettings = () => fetchWorkflowSettings().catch((error) => workflowToast(error.message));

workflowSearch.addEventListener("input", () => { workflowSearchTerm = workflowSearch.value.trim().toLocaleLowerCase(); renderWorkflowList(); });
document.querySelector("#workflow-create").addEventListener("click", () => {
  const draft = { id: `new-${crypto.randomUUID()}`, name: "新工作流", description: "", status: "draft", nodes: [defaultNode("agent")], node_count: 1 };
  workflows.unshift(draft);
  openWorkflowEditor(draft);
});
document.querySelector("#workflow-back").addEventListener("click", returnToWorkflowList);
document.querySelectorAll("[data-add-node]").forEach((button) => button.addEventListener("click", () => {
  const workflow = currentWorkflow();
  if (!workflow) return;
  workflow.nodes.push(defaultNode(button.dataset.addNode));
  renderWorkflowNodes(workflow.nodes);
}));
workflowForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const workflow = currentWorkflow();
  if (!workflow) return;
  try {
    const payload = { agent_id: window.getSelectedAgentId?.() || "", name: workflowForm.elements.name.value.trim(), description: workflowForm.elements.description.value.trim(), nodes: workflow.nodes };
    const isNew = workflow.id.startsWith("new-");
    const saved = await workflowRequest(isNew ? "/api/admin/workflows" : `/api/admin/workflows/${encodeURIComponent(workflow.id)}`, { method: isNew ? "POST" : "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    workflows = workflows.filter((item) => item.id !== workflow.id);
    workflows.unshift(saved);
    selectedWorkflowId = saved.id;
    renderWorkflowList();
    renderWorkflowEditor(saved);
    workflowToast("工作流草稿已保存。");
  } catch (error) { workflowToast(error.message); }
});
document.querySelector("#workflow-publish").addEventListener("click", async () => {
  const workflow = currentWorkflow();
  if (!workflow || workflow.id.startsWith("new-")) { workflowToast("请先保存工作流草稿。"); return; }
  try { const saved = await workflowRequest(`/api/admin/workflows/${encodeURIComponent(workflow.id)}/publish?agent_id=${encodeURIComponent(window.getSelectedAgentId?.() || "")}`, { method: "POST" }); workflows = workflows.map((item) => item.id === saved.id ? saved : item); renderWorkflowList(); renderWorkflowEditor(saved); workflowToast("工作流已发布。"); }
  catch (error) { workflowToast(error.message); }
});
document.querySelector("#workflow-disable").addEventListener("click", async () => {
  const workflow = currentWorkflow();
  if (!workflow) return;
  try { const saved = await workflowRequest(`/api/admin/workflows/${encodeURIComponent(workflow.id)}/disable?agent_id=${encodeURIComponent(window.getSelectedAgentId?.() || "")}`, { method: "POST" }); workflows = workflows.map((item) => item.id === saved.id ? saved : item); renderWorkflowList(); renderWorkflowEditor(saved); workflowToast("工作流已停用。"); }
  catch (error) { workflowToast(error.message); }
});
document.querySelector("#workflow-run").addEventListener("click", async (event) => {
  const workflow = currentWorkflow();
  const input = document.querySelector("#workflow-run-input").value.trim();
  const result = document.querySelector("#workflow-run-result");
  if (!workflow || workflow.id.startsWith("new-")) { workflowToast("请先保存工作流。"); return; }
  if (!input) { workflowToast("请输入测试内容。"); return; }
  event.currentTarget.disabled = true;
  result.hidden = false;
  result.textContent = "正在执行…";
  try {
    const payload = await workflowRequest(`/api/admin/workflows/${encodeURIComponent(workflow.id)}/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input }) });
    result.textContent = (payload.steps || []).map((step) => `${step.index}. ${step.name}\n${step.output}`).join("\n\n") || payload.output || "工作流没有返回文本。";
  } catch (error) {
    result.textContent = error.message;
  } finally {
    event.currentTarget.disabled = false;
  }
});
document.querySelector("#workflow-delete").addEventListener("click", async () => {
  const workflow = currentWorkflow();
  if (!workflow) return;
  if (workflow.id.startsWith("new-")) {
    workflows = workflows.filter((item) => item.id !== workflow.id);
    returnToWorkflowList();
    return;
  }
  const deleteDialog = document.querySelector("#workflow-delete-dialog");
  document.querySelector("#workflow-delete-message").textContent = `确定删除“${workflow.name}”吗？删除后无法恢复。`;
  const confirmed = new Promise((resolve) => {
    deleteDialog.addEventListener("close", () => resolve(deleteDialog.returnValue === "confirm"), { once: true });
  });
  deleteDialog.showModal();
  if (!(await confirmed)) return;
  try { await workflowRequest(`/api/admin/workflows/${encodeURIComponent(workflow.id)}?agent_id=${encodeURIComponent(window.getSelectedAgentId?.() || "")}`, { method: "DELETE" }); workflows = workflows.filter((item) => item.id !== workflow.id); selectedWorkflowId = null; returnToWorkflowList(); workflowToast("工作流已删除。"); }
  catch (error) { workflowToast(error.message); }
});
