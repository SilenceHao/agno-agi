(() => {
const toolsLayout = document.querySelector("#tools-layout");
const toolEditorOverlay = document.querySelector("#tool-editor-overlay");
const toolEditor = document.querySelector("#tool-editor");
const toolEditorTitle = document.querySelector("#tool-editor-title");
const toolReset = document.querySelector("#tool-reset");
const toolNewButton = document.querySelector("#tool-new-button");
const toolParameterList = document.querySelector("#tool-parameter-list");
const toolHeaderList = document.querySelector("#tool-header-list");
const toolFormStatus = document.querySelector("#tool-form-status");
const toolTestCard = document.querySelector("#tool-test-card");
const toolTestParameters = document.querySelector("#tool-test-parameters");
const toolTestButton = document.querySelector("#tool-test-button");
const toolTestStatus = document.querySelector("#tool-test-status");
const toolTestResult = document.querySelector("#tool-test-result");
const toolsList = document.querySelector("#tools-list");
const toolsCount = document.querySelector("#tools-count");
let editingToolId = null;
let selectedTestTool = null;
let toolsBusy = false;

function setToolStatus(message, target = toolFormStatus) {
  target.textContent = message;
}

function createSelect(options, value) {
  const select = document.createElement("select");
  options.forEach(([optionValue, label]) => {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = label;
    option.selected = optionValue === value;
    select.append(option);
  });
  return select;
}

function createRemoveButton(onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "tool-remove-row";
  button.textContent = "×";
  button.setAttribute("aria-label", "删除此行");
  button.addEventListener("click", onClick);
  return button;
}

function createParameterRow(parameter = {}) {
  const row = document.createElement("div");
  row.className = "tool-parameter-row";
  const nameLabel = document.createElement("label");
  nameLabel.textContent = "参数名";
  const name = document.createElement("input");
  name.value = parameter.name || "";
  name.placeholder = "order_no";
  name.dataset.field = "name";
  nameLabel.append(name);
  const locationLabel = document.createElement("label");
  locationLabel.textContent = "位置";
  const location = createSelect([["query", "查询参数"], ["path", "路径参数"], ["body", "JSON 请求体"]], parameter.location || "query");
  location.dataset.field = "location";
  locationLabel.append(location);
  const typeLabel = document.createElement("label");
  typeLabel.textContent = "类型";
  const type = createSelect([["string", "文本"], ["integer", "整数"], ["number", "数字"], ["boolean", "布尔值"]], parameter.type || "string");
  type.dataset.field = "type";
  typeLabel.append(type);
  const descriptionLabel = document.createElement("label");
  descriptionLabel.textContent = "给智能体的参数说明";
  const description = document.createElement("input");
  description.value = parameter.description || "";
  description.placeholder = "用户提供的订单号";
  description.dataset.field = "description";
  descriptionLabel.append(description);
  const requiredLabel = document.createElement("label");
  requiredLabel.className = "tool-parameter-required";
  const required = document.createElement("input");
  required.type = "checkbox";
  required.checked = Boolean(parameter.required);
  required.dataset.field = "required";
  const requiredText = document.createElement("span");
  requiredText.textContent = "必填";
  requiredLabel.append(required, requiredText);
  row.append(nameLabel, locationLabel, typeLabel, descriptionLabel, requiredLabel);
  row.append(createRemoveButton(() => {
    row.remove();
    renderToolRowEmptyState(toolParameterList, "还没有配置参数，请点击“添加参数”。");
  }));
  return row;
}

function createHeaderRow(header = {}) {
  const row = document.createElement("div");
  row.className = "tool-header-row";
  const nameLabel = document.createElement("label");
  nameLabel.textContent = "请求头名称";
  const name = document.createElement("input");
  name.value = header.name || "";
  name.placeholder = "Authorization";
  name.dataset.field = "name";
  nameLabel.append(name);
  const valueLabel = document.createElement("label");
  valueLabel.textContent = header.has_value ? "请求头值（留空则保留已保存值）" : "请求头值";
  const value = document.createElement("input");
  value.type = "password";
  value.value = header.value || "";
  value.placeholder = header.has_value ? "已保存，留空保留" : "Bearer your-token";
  value.dataset.field = "value";
  valueLabel.append(value);
  row.append(nameLabel, valueLabel);
  row.append(createRemoveButton(() => {
    row.remove();
    renderToolRowEmptyState(toolHeaderList, "还没有配置固定请求头。");
  }));
  return row;
}

function renderToolRowEmptyState(container, message) {
  container.querySelector(".tool-empty")?.remove();
  if (container.children.length === 0) {
    const empty = document.createElement("div");
    empty.className = "tool-empty";
    empty.textContent = message;
    container.append(empty);
  }
}

function addParameterRow(parameter = {}) {
  toolParameterList.querySelector(".tool-empty")?.remove();
  toolParameterList.append(createParameterRow(parameter));
}

function addHeaderRow(header = {}) {
  toolHeaderList.querySelector(".tool-empty")?.remove();
  toolHeaderList.append(createHeaderRow(header));
}

function resetToolEditor() {
  const wasOpen = !toolEditorOverlay.hidden;
  toolEditorOverlay.hidden = true;
  toolEditor.hidden = true;
  editingToolId = null;
  selectedTestTool = null;
  toolEditor.reset();
  toolEditorTitle.textContent = "新增 HTTP 接口";
  toolReset.hidden = false;
  toolTestCard.hidden = true;
  toolParameterList.replaceChildren();
  toolHeaderList.replaceChildren();
  renderToolRowEmptyState(toolParameterList, "还没有配置参数，请点击“添加参数”。");
  renderToolRowEmptyState(toolHeaderList, "还没有配置固定请求头。");
  setToolStatus("");
  setToolStatus("", toolTestStatus);
  toolTestResult.hidden = true;
  if (wasOpen) toolNewButton.focus();
}

function fillToolEditor(tool) {
  toolEditorOverlay.hidden = false;
  toolEditor.hidden = false;
  editingToolId = tool.id;
  selectedTestTool = tool;
  toolEditor.elements.name.value = tool.name;
  toolEditor.elements.description.value = tool.description;
  toolEditor.elements.method.value = tool.method;
  toolEditor.elements.url.value = tool.url;
  toolEditor.elements.enabled.checked = tool.enabled;
  toolEditorTitle.textContent = `编辑 ${tool.name}`;
  toolReset.hidden = false;
  toolParameterList.replaceChildren();
  toolHeaderList.replaceChildren();
  tool.parameters.forEach((parameter) => addParameterRow(parameter));
  tool.headers.forEach((header) => addHeaderRow(header));
  renderToolRowEmptyState(toolParameterList, "还没有配置参数，请点击“添加参数”。");
  renderToolRowEmptyState(toolHeaderList, "还没有配置固定请求头。");
  renderTestParameters(tool);
  toolTestCard.hidden = true;
  toolTestResult.hidden = true;
  setToolStatus("");
  toolEditor.elements.name.focus();
}

function startNewTool() {
  resetToolEditor();
  toolEditorOverlay.hidden = false;
  toolEditor.hidden = false;
  toolEditorTitle.textContent = "新增 HTTP 接口";
  toolEditor.elements.name.focus();
}

function collectRows(container) {
  return [...container.querySelectorAll(":scope > :not(.tool-empty)")].map((row) => {
    const values = {};
    row.querySelectorAll("[data-field]").forEach((field) => {
      values[field.dataset.field] = field.type === "checkbox" ? field.checked : field.value.trim();
    });
    return values;
  });
}

function collectToolPayload() {
  return {
    name: toolEditor.elements.name.value.trim(),
    description: toolEditor.elements.description.value.trim(),
    method: toolEditor.elements.method.value,
    url: toolEditor.elements.url.value.trim(),
    parameters: collectRows(toolParameterList),
    headers: collectRows(toolHeaderList),
    enabled: toolEditor.elements.enabled.checked,
  };
}

function renderTestParameters(tool) {
  toolTestParameters.replaceChildren();
  if (tool.parameters.length === 0) {
    const empty = document.createElement("span");
    empty.className = "tool-empty";
    empty.textContent = "此接口不需要参数。";
    toolTestParameters.append(empty);
    return;
  }
  tool.parameters.forEach((parameter) => {
    const label = document.createElement("label");
    label.textContent = `${parameter.name}${parameter.required ? "（必填）" : ""}`;
    const input = document.createElement("input");
    input.dataset.parameterName = parameter.name;
    input.dataset.parameterType = parameter.type;
    input.placeholder = parameter.description;
    label.append(input);
    toolTestParameters.append(label);
  });
}

function collectTestParameters() {
  const values = {};
  toolTestParameters.querySelectorAll("[data-parameter-name]").forEach((input) => {
    if (!input.value.trim()) return;
    let value = input.value.trim();
    if (input.dataset.parameterType === "integer") value = Number.parseInt(value, 10);
    if (input.dataset.parameterType === "number") value = Number(value);
    if (input.dataset.parameterType === "boolean") value = value.toLowerCase() === "true";
    values[input.dataset.parameterName] = value;
  });
  return values;
}

function renderToolsList(items) {
  toolsList.replaceChildren();
  toolsCount.textContent = `${items.length} 个工具`;
  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "tools-empty";
    empty.textContent = "还没有配置接口。点击“新建接口”开始添加。";
    toolsList.append(empty);
    return;
  }
  items.forEach((tool) => {
    const card = document.createElement("article");
    card.className = "tool-card";
    const main = document.createElement("div");
    main.className = "tool-card-main";
    const name = document.createElement("div");
    name.className = "tool-card-name";
    const nameText = document.createElement("span");
    nameText.textContent = tool.name;
    const badge = document.createElement("span");
    badge.className = "tool-card-badge";
    badge.textContent = tool.method;
    name.append(nameText, badge);
    const description = document.createElement("div");
    description.className = "tool-card-description";
    description.textContent = tool.description;
    const meta = document.createElement("div");
    meta.className = "tool-card-meta";
    const status = document.createElement("span");
    status.className = "tool-status";
    status.dataset.enabled = String(tool.enabled);
    status.textContent = tool.enabled ? "已启用" : "已停用";
    const parameters = document.createElement("span");
    parameters.textContent = `${tool.parameters.length} 个参数`;
    meta.append(status, parameters);
    main.append(name, description, meta);
    const actions = document.createElement("div");
    actions.className = "tool-card-actions";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "编辑";
    edit.addEventListener("click", () => fillToolEditor(tool));
    const test = document.createElement("button");
    test.type = "button";
    test.textContent = "测试";
    test.addEventListener("click", () => {
      selectedTestTool = tool;
      renderTestParameters(tool);
      toolTestCard.hidden = false;
      toolTestResult.hidden = true;
      setToolStatus("");
      toolTestCard.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "tool-delete";
    remove.textContent = "删除";
    remove.addEventListener("click", () => deleteTool(tool));
    actions.append(edit, test, remove);
    card.append(main, actions);
    toolsList.append(card);
  });
}

async function loadTools() {
  const response = await fetch("/api/tools");
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.detail || "读取工具列表失败。");
  renderToolsList(payload);
  const toolsNavCount = document.querySelector('[data-view="tools"] .nav-count');
  if (toolsNavCount) toolsNavCount.textContent = String(payload.length);
  return payload;
}

async function saveTool(event) {
  event.preventDefault();
  if (toolsBusy) return;
  toolsBusy = true;
  setToolStatus("正在保存…");
  try {
    const payload = collectToolPayload();
    const url = editingToolId ? `/api/tools/${encodeURIComponent(editingToolId)}` : "/api/tools";
    const response = await fetch(url, { method: editingToolId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || "保存工具失败。");
    await loadTools();
    resetToolEditor();
  } catch (error) {
    setToolStatus(error.message);
  } finally {
    toolsBusy = false;
  }
}

async function deleteTool(tool) {
  if (!window.confirm(`删除工具“${tool.name}”？智能体将不再调用它。`)) return;
  const response = await fetch(`/api/tools/${encodeURIComponent(tool.id)}`, { method: "DELETE" });
  const payload = await response.json();
  if (!response.ok) {
    setToolStatus(payload.detail || "删除工具失败。");
    return;
  }
  if (editingToolId === tool.id) resetToolEditor();
  await loadTools();
}

async function testSelectedTool() {
  if (!selectedTestTool || toolsBusy) return;
  toolsBusy = true;
  toolTestButton.disabled = true;
  toolTestStatus.textContent = "请求中…";
  toolTestResult.hidden = true;
  try {
    const response = await fetch(`/api/tools/${encodeURIComponent(selectedTestTool.id)}/test`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sample_params: collectTestParameters() }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail || "测试请求失败。");
    toolTestStatus.textContent = `收到 HTTP ${payload.status_code}`;
    toolTestResult.textContent = JSON.stringify(payload.body, null, 2);
    toolTestResult.hidden = false;
  } catch (error) {
    toolTestStatus.textContent = error.message;
  } finally {
    toolsBusy = false;
    toolTestButton.disabled = false;
  }
}

window.loadToolsSettings = () => loadTools().catch((error) => setToolStatus(error.message));
document.querySelector("#tools-back")?.addEventListener("click", () => {
  if (window.showAdminOverview) window.showAdminOverview();
  else window.showChatPage?.();
});
document.querySelector("#tool-add-parameter").addEventListener("click", () => addParameterRow());
document.querySelector("#tool-add-header").addEventListener("click", () => addHeaderRow());
toolNewButton.addEventListener("click", startNewTool);
toolReset.addEventListener("click", resetToolEditor);
toolEditorOverlay.addEventListener("click", (event) => {
  if (event.target === toolEditorOverlay) resetToolEditor();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !toolEditorOverlay.hidden) {
    event.stopPropagation();
    resetToolEditor();
  }
});
toolEditor.addEventListener("submit", saveTool);
toolTestButton.addEventListener("click", testSelectedTool);
resetToolEditor();
})();
