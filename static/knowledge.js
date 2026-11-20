const knowledgeFileInput = document.querySelector("#knowledge-file-input");
const knowledgeSelection = document.querySelector("#knowledge-selection");
const knowledgeActions = document.querySelector("#knowledge-actions");
const knowledgeDocuments = document.querySelector("#knowledge-documents");
const knowledgeFolders = document.querySelector("#knowledge-folders");
const knowledgeStatus = document.querySelector("#knowledge-status");
const knowledgeCount = document.querySelector("#knowledge-count");
const knowledgeSearchInput = document.querySelector("#knowledge-search");
const knowledgePageSizeSelect = document.querySelector("#knowledge-page-size");
const knowledgePageIndicator = document.querySelector("#knowledge-page-indicator");
const knowledgePreviousButton = document.querySelector("#knowledge-page-prev");
const knowledgeNextButton = document.querySelector("#knowledge-page-next");
const knowledgeImportButton = document.querySelector("#knowledge-import");
const knowledgeSelectButton = document.querySelector("#knowledge-select");
const folderPageSizeSelect = document.querySelector("#knowledge-folder-page-size");
const folderPreviousButton = document.querySelector("#knowledge-folder-page-prev");
const folderNextButton = document.querySelector("#knowledge-folder-page-next");
const folderDialog = document.querySelector("#knowledge-folder-dialog");
const folderDeleteDialog = document.querySelector("#knowledge-folder-delete-dialog");
const folderForm = document.querySelector("#knowledge-folder-form");
const pendingKnowledgeFiles = [];
const MAX_KNOWLEDGE_FILE_SIZE = 100 * 1024 * 1024;
let knowledgeBusy = false;
let knowledgeRefreshTimer = null;
let knowledgeSearchTimer = null;
let knowledgePage = 1;
let knowledgePageSize = Number(knowledgePageSizeSelect.value);
let knowledgeFolderPage = 1;
let knowledgeFolderPageSize = Number(folderPageSizeSelect.value);
let knowledgeRequestSequence = 0;
let knowledgeModelStatusChecked = false;
let currentKnowledgeFolder = null;
let folderDialogMode = "create";
let editedKnowledgeFolder = null;
let deletedKnowledgeFolder = null;

function setKnowledgeStatus(message, state = "") {
  knowledgeStatus.textContent = message;
  if (state) knowledgeStatus.dataset.state = state;
  else delete knowledgeStatus.dataset.state;
}

function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function updateKnowledgeNavigationCount(total) {
  if (knowledgeCount) knowledgeCount.textContent = String(total);
  const navCount = document.querySelector('[data-view="knowledge"] .nav-count');
  if (navCount) navCount.textContent = String(total);
}

function setKnowledgeView(folder = null) {
  const nextFolderId = folder?.id || null;
  if (pendingKnowledgeFiles.length > 0 && currentKnowledgeFolder?.id !== nextFolderId) {
    setKnowledgeStatus("当前目录还有未导入的文件，请先导入或移除这些文件后再切换目录。", "warning");
    return false;
  }
  currentKnowledgeFolder = folder;
  const inFolder = Boolean(folder);
  document.querySelector("#knowledge-folder-heading").hidden = inFolder;
  knowledgeFolders.hidden = inFolder;
  document.querySelector("#knowledge-folder-pagination").hidden = inFolder;
  document.querySelector("#knowledge-content-view").hidden = !inFolder;
  document.querySelector("#knowledge-folder-create").hidden = inFolder;
  document.querySelector("#knowledge-back-to-folders").hidden = !inFolder;
  document.querySelector("#knowledge-breadcrumb-home").hidden = !inFolder;
  document.querySelector("#knowledge-breadcrumb-separator").hidden = !inFolder;
  document.querySelector("#knowledge-breadcrumb-label").textContent = inFolder ? folder.name : "知识库目录";
  document.querySelector("#knowledge-current-folder-name").textContent = inFolder ? folder.name : "";
  document.querySelector("#knowledge-search-folder-name").textContent = inFolder ? folder.name : "";
  knowledgeSearchInput.value = "";
  knowledgeSearchInput.placeholder = inFolder ? "按文件名搜索当前目录" : "搜索目录名称";
  knowledgeSearchInput.setAttribute("aria-label", inFolder ? "按文件名搜索当前目录" : "搜索目录名称");
  knowledgePage = 1;
  knowledgeFolderPage = 1;
  return true;
}

function renderKnowledgeSelection() {
  knowledgeSelection.replaceChildren();
  knowledgeSelection.hidden = pendingKnowledgeFiles.length === 0;
  knowledgeActions.hidden = pendingKnowledgeFiles.length === 0;
  pendingKnowledgeFiles.forEach((file, index) => {
    const item = document.createElement("div");
    item.className = "knowledge-selected-file";
    const name = document.createElement("span");
    name.textContent = `${file.name} · ${formatFileSize(file.size)}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.setAttribute("aria-label", `取消导入 ${file.name}`);
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      pendingKnowledgeFiles.splice(index, 1);
      renderKnowledgeSelection();
    });
    item.append(name, remove);
    knowledgeSelection.append(item);
  });
}

function createKnowledgeDocument(documentInfo) {
  const row = document.createElement("article");
  row.className = "knowledge-document";
  const fileIcon = document.createElement("span");
  fileIcon.className = "knowledge-file-icon";
  fileIcon.textContent = documentInfo.file_name.split(".").pop() || "file";
  const main = document.createElement("div");
  main.className = "knowledge-document-main";
  const name = document.createElement("strong");
  name.className = "knowledge-document-name";
  name.title = documentInfo.file_name;
  name.textContent = documentInfo.file_name;
  const meta = document.createElement("div");
  meta.className = "knowledge-document-meta";
  const size = document.createElement("span");
  size.textContent = formatFileSize(documentInfo.file_size);
  const status = document.createElement("span");
  status.className = "knowledge-document-status";
  status.dataset.status = documentInfo.status;
  const statusLabels = { ready: "已建立索引", indexing: "索引创建中", failed: "索引失败" };
  status.textContent = `${statusLabels[documentInfo.status] || documentInfo.status}${documentInfo.chunk_count ? ` · ${documentInfo.chunk_count} 个文本块` : ""}`;
  meta.append(size, status);
  const extension = documentInfo.file_name.split(".").pop()?.toLowerCase();
  if (documentInfo.status === "ready" && /^(jpg|jpeg|png|webp|mp4|mov|mkv|webm|avi)$/.test(extension || "")) {
    const preview = document.createElement("a");
    preview.className = "knowledge-preview";
    preview.href = `/api/knowledge/documents/${encodeURIComponent(documentInfo.id)}/file`;
    preview.target = "_blank";
    preview.rel = "noopener noreferrer";
    preview.textContent = /^(mp4|mov|mkv|webm|avi)$/.test(extension) ? "播放视频" : "查看图片";
    meta.append(preview);
  }
  if (documentInfo.status_message) {
    const details = document.createElement("span");
    details.textContent = documentInfo.status_message;
    meta.append(details);
  }
  if (documentInfo.status === "failed") {
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "knowledge-retry";
    retry.textContent = "重新索引";
    retry.setAttribute("aria-label", `重新索引 ${documentInfo.file_name}`);
    retry.addEventListener("click", () => retryKnowledgeDocument(documentInfo.id));
    meta.append(retry);
  }
  main.append(name, meta);
  row.append(fileIcon, main);
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "knowledge-delete";
  remove.setAttribute("aria-label", `从知识库删除 ${documentInfo.file_name}`);
  remove.title = "从知识库删除";
  remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';
  remove.addEventListener("click", () => removeKnowledgeDocument(documentInfo));
  row.append(remove);
  return row;
}

function createKnowledgeFolder(folder) {
  const card = document.createElement("article");
  card.className = "knowledge-folder-card";
  const open = document.createElement("button");
  open.type = "button";
  open.className = "knowledge-folder-open";
  open.setAttribute("aria-label", `打开目录 ${folder.name}`);
  open.addEventListener("click", () => {
    if (!setKnowledgeView({ id: folder.id, name: folder.name })) return;
    refreshKnowledgeView().catch((error) => setKnowledgeStatus(error.message, "warning"));
  });
  const icon = document.createElement("span");
  icon.className = "knowledge-folder-icon";
  icon.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H10l2 2h7.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/></svg>';
  const copy = document.createElement("span");
  copy.className = "knowledge-folder-copy";
  const title = document.createElement("strong");
  title.textContent = folder.name;
  const summary = document.createElement("span");
  summary.textContent = `${folder.document_count} 个文件 · ${folder.ready_count} 个已索引${folder.indexing_count ? ` · ${folder.indexing_count} 个处理中` : ""}${folder.failed_count ? ` · ${folder.failed_count} 个失败` : ""}`;
  copy.append(title, summary);
  open.append(icon, copy);
  card.append(open);
  if (!folder.is_default) {
    const actions = document.createElement("div");
    actions.className = "knowledge-folder-actions";
    const rename = document.createElement("button");
    rename.type = "button";
    rename.textContent = "重命名";
    rename.setAttribute("aria-label", `重命名目录 ${folder.name}`);
    rename.addEventListener("click", () => openFolderDialog("rename", folder));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "knowledge-folder-remove";
    remove.textContent = "删除";
    remove.disabled = folder.document_count > 0;
    remove.title = remove.disabled ? "请先清空目录中的文件" : "删除空目录";
    remove.setAttribute("aria-label", `删除空目录 ${folder.name}`);
    remove.addEventListener("click", () => openFolderDeleteDialog(folder));
    actions.append(rename, remove);
    card.append(actions);
  } else {
    const badge = document.createElement("span");
    badge.className = "knowledge-folder-default-badge";
    badge.textContent = "默认";
    card.append(badge);
  }
  return card;
}

function renderPagination({ total, page, totalPages, previous, next, element }) {
  element.querySelector("[id$='page-indicator']").textContent = `第 ${page} / ${Math.max(totalPages, 1)} 页`;
  previous.disabled = page <= 1;
  next.disabled = page >= totalPages;
  const isDirectorySearch = !currentKnowledgeFolder;
  element.hidden = totalPages <= 1 && !(isDirectorySearch && knowledgeSearchInput.value.trim());
}

function updateModelStatus(payload) {
  if (typeof payload.model_available !== "boolean") return;
  knowledgeModelStatusChecked = true;
  if (payload.model_available) {
    setKnowledgeStatus(`本机向量模型 ${payload.model} 已连接。原始文件保存在 ${payload.data_directory}；向量索引保存在 ${payload.vector_directory}。`, "ready");
  } else {
    setKnowledgeStatus(`无法连接本机 Ollama 或未发现 ${payload.model}。请启动 Ollama 后再导入文件。`, "warning");
  }
}

async function refreshKnowledgeView({ checkModelStatus = !knowledgeModelStatusChecked } = {}) {
  const requestSequence = ++knowledgeRequestSequence;
  const searchTerm = knowledgeSearchInput.value.trim();
  const isFolderView = Boolean(currentKnowledgeFolder);
  const query = new URLSearchParams({
    page: String(isFolderView ? knowledgePage : knowledgeFolderPage),
    page_size: String(isFolderView ? knowledgePageSize : knowledgeFolderPageSize),
    search: searchTerm,
    check_model_status: String(checkModelStatus),
  });
  const url = isFolderView
    ? `/api/knowledge/folders/${encodeURIComponent(currentKnowledgeFolder.id)}/documents?${query}`
    : `/api/knowledge/folders?${query}`;
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.detail || "读取知识库失败。");
  if (requestSequence !== knowledgeRequestSequence) return;
  updateModelStatus(payload);

  if (!isFolderView) {
    const folders = Array.isArray(payload.folders) ? payload.folders : [];
    knowledgeFolders.replaceChildren();
    document.querySelector("#knowledge-folder-count").textContent = `${payload.folder_total ?? folders.length} 个目录`;
    updateKnowledgeNavigationCount(Number.isInteger(payload.total) ? payload.total : 0);
    knowledgeFolderPage = payload.folder_page ?? knowledgeFolderPage;
    renderPagination({
      total: payload.folder_total ?? folders.length,
      page: knowledgeFolderPage,
      totalPages: payload.folder_total_pages ?? 1,
      previous: folderPreviousButton,
      next: folderNextButton,
      element: document.querySelector("#knowledge-folder-pagination"),
    });
    if (folders.length === 0) {
      const empty = document.createElement("div");
      empty.className = "knowledge-empty";
      empty.textContent = searchTerm ? "没有找到名称匹配的目录。" : "还没有知识库目录，请先创建目录。";
      knowledgeFolders.append(empty);
    } else {
      folders.forEach((folder) => knowledgeFolders.append(createKnowledgeFolder(folder)));
    }
    const statusCounts = payload.status_counts || {};
    scheduleKnowledgeRefresh(statusCounts.indexing > 0);
    return;
  }

  const documents = Array.isArray(payload.documents) ? payload.documents : [];
  knowledgeDocuments.replaceChildren();
  document.querySelector("#knowledge-list-count").textContent = `${payload.total_documents ?? payload.total ?? 0} 个文件`;
  document.querySelector("#knowledge-document-count").textContent = searchTerm
    ? `${payload.total ?? documents.length} 个匹配文件 / 共 ${payload.total_documents ?? 0} 个`
    : `${payload.total_documents ?? documents.length} 个文件`;
  knowledgePage = payload.page ?? knowledgePage;
  renderPagination({
    total: payload.total ?? documents.length,
    page: knowledgePage,
    totalPages: payload.total_pages ?? 1,
    previous: knowledgePreviousButton,
    next: knowledgeNextButton,
    element: document.querySelector("#knowledge-document-pagination"),
  });
  if (documents.length === 0) {
    const empty = document.createElement("div");
    empty.className = "knowledge-empty";
    empty.textContent = searchTerm ? "没有找到名称匹配的文件。" : "此目录还没有导入资料。请在这里上传文件；聊天附件不会自动加入知识库。";
    knowledgeDocuments.append(empty);
  } else {
    documents.forEach((item) => knowledgeDocuments.append(createKnowledgeDocument(item)));
  }
  scheduleKnowledgeRefresh((payload.status_counts?.indexing ?? documents.filter((item) => item.status === "indexing").length) > 0);
}

function scheduleKnowledgeRefresh(hasIndexingDocuments) {
  if (knowledgeRefreshTimer) {
    window.clearTimeout(knowledgeRefreshTimer);
    knowledgeRefreshTimer = null;
  }
  if (!hasIndexingDocuments) return;
  knowledgeRefreshTimer = window.setTimeout(async () => {
    knowledgeRefreshTimer = null;
    try {
      await refreshKnowledgeView();
    } catch (error) {
      setKnowledgeStatus(error.message, "warning");
      scheduleKnowledgeRefresh(true);
    }
  }, 2000);
}

function openFolderDialog(mode, folder = null) {
  folderDialogMode = mode;
  editedKnowledgeFolder = folder;
  const isRename = mode === "rename";
  document.querySelector("#knowledge-folder-dialog-title").textContent = isRename ? "重命名目录" : "新建知识库目录";
  document.querySelector("#knowledge-folder-dialog-save").textContent = isRename ? "保存名称" : "创建目录";
  document.querySelector("#knowledge-folder-name").value = folder?.name || "";
  folderDialog.showModal();
  document.querySelector("#knowledge-folder-name").focus();
}

function openFolderDeleteDialog(folder) {
  deletedKnowledgeFolder = folder;
  folderDeleteDialog.returnValue = "";
  document.querySelector("#knowledge-folder-delete-message").textContent = `确定删除“${folder.name}”吗？只有空目录可以删除。`;
  folderDeleteDialog.showModal();
}

async function saveKnowledgeFolder(event) {
  event.preventDefault();
  const name = document.querySelector("#knowledge-folder-name").value.trim();
  if (!name) {
    document.querySelector("#knowledge-folder-name").setCustomValidity("请输入目录名称。");
    document.querySelector("#knowledge-folder-name").reportValidity();
    document.querySelector("#knowledge-folder-name").setCustomValidity("");
    return;
  }
  const isRename = folderDialogMode === "rename";
  const url = isRename
    ? `/api/knowledge/folders/${encodeURIComponent(editedKnowledgeFolder.id)}`
    : "/api/knowledge/folders";
  const response = await fetch(url, {
    method: isRename ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.detail || "保存目录失败。");
  folderDialog.close();
  if (currentKnowledgeFolder?.id === payload.id) {
    currentKnowledgeFolder = { ...currentKnowledgeFolder, name: payload.name };
    setKnowledgeView(currentKnowledgeFolder);
  }
  await refreshKnowledgeView();
  setKnowledgeStatus(isRename ? `目录已重命名为“${name}”。` : `已创建目录“${name}”。`, "ready");
}

async function deleteKnowledgeFolder() {
  if (!deletedKnowledgeFolder) return;
  const response = await fetch(`/api/knowledge/folders/${encodeURIComponent(deletedKnowledgeFolder.id)}`, { method: "DELETE" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.detail || "删除目录失败。");
  deletedKnowledgeFolder = null;
  await refreshKnowledgeView();
  setKnowledgeStatus("空目录已删除。", "ready");
}

async function importKnowledgeFiles() {
  if (knowledgeBusy || pendingKnowledgeFiles.length === 0 || !currentKnowledgeFolder) return;
  knowledgeBusy = true;
  knowledgeImportButton.disabled = true;
  const files = [...pendingKnowledgeFiles];
  const targetFolder = currentKnowledgeFolder;
  setKnowledgeStatus(`正在上传 ${files.length} 个文件到“${targetFolder.name}”；上传完成后会在目录中显示索引状态。`);
  try {
    const results = await Promise.all(files.map(async (file) => {
      const body = new FormData();
      body.append("file", file, file.name);
      body.append("folder_id", targetFolder.id);
      try {
        const response = await fetch("/api/knowledge/documents", { method: "POST", body });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.detail || `无法导入 ${file.name}。`);
        return { file, uploaded: true };
      } catch (error) {
        return { file, uploaded: false, error };
      }
    }));
    const uploadedFiles = results.filter((result) => result.uploaded);
    uploadedFiles.forEach(({ file }) => {
      const pendingIndex = pendingKnowledgeFiles.indexOf(file);
      if (pendingIndex >= 0) pendingKnowledgeFiles.splice(pendingIndex, 1);
    });
    if (uploadedFiles.length > 0) {
      knowledgePage = 1;
      knowledgeSearchInput.value = "";
    }
    renderKnowledgeSelection();
    await refreshKnowledgeView();
    const failedFiles = results.filter((result) => !result.uploaded);
    if (failedFiles.length > 0) {
      const firstFailure = failedFiles[0];
      const uploadedMessage = uploadedFiles.length > 0 ? `已提交 ${uploadedFiles.length} 个文件的索引任务。` : "";
      setKnowledgeStatus(`${uploadedMessage}${firstFailure.file.name}：${firstFailure.error.message}`, "warning");
    } else if (uploadedFiles.length > 0) {
      setKnowledgeStatus(`已提交 ${uploadedFiles.length} 个文件，正在“${targetFolder.name}”中创建索引。`, "indexing");
    }
  } catch (error) {
    setKnowledgeStatus(error.message, "warning");
  } finally {
    knowledgeImportButton.disabled = false;
    knowledgeBusy = false;
  }
}

async function removeKnowledgeDocument(documentInfo) {
  if (!window.confirm(`从“${currentKnowledgeFolder.name}”中删除“${documentInfo.file_name}”？这会删除本机文件和对应向量索引。`)) return;
  try {
    const response = await fetch(`/api/knowledge/documents/${encodeURIComponent(documentInfo.id)}`, { method: "DELETE" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail || "删除知识库资料失败。");
    await refreshKnowledgeView();
    setKnowledgeStatus(`已从知识库删除 ${documentInfo.file_name}。`, "ready");
  } catch (error) {
    setKnowledgeStatus(error.message, "warning");
  }
}

async function retryKnowledgeDocument(documentId) {
  try {
    const response = await fetch(`/api/knowledge/documents/${encodeURIComponent(documentId)}/reindex`, { method: "POST" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail || "重新索引失败。");
    await refreshKnowledgeView();
    setKnowledgeStatus("已提交重新索引任务，后台正在处理。", "indexing");
  } catch (error) {
    setKnowledgeStatus(error.message, "warning");
  }
}

window.loadKnowledgeSettings = async () => {
  setKnowledgeView(null);
  try {
    await refreshKnowledgeView();
  } catch (error) {
    setKnowledgeStatus(error.message, "warning");
  }
};

document.querySelector("#new-chat")?.addEventListener("click", () => window.showChatPage?.());
document.querySelector("#knowledge-back").addEventListener("click", () => {
  if (window.showAdminOverview) window.showAdminOverview();
  else window.showChatPage?.();
});
document.querySelector("#knowledge-refresh").addEventListener("click", async () => {
  try {
    await refreshKnowledgeView({ checkModelStatus: true });
  } catch (error) {
    setKnowledgeStatus(error.message, "warning");
  }
});
function returnToKnowledgeFolders() {
  if (!setKnowledgeView(null)) return;
  refreshKnowledgeView().catch((error) => setKnowledgeStatus(error.message, "warning"));
}
document.querySelector("#knowledge-back-to-folders").addEventListener("click", returnToKnowledgeFolders);
document.querySelector("#knowledge-breadcrumb-home").addEventListener("click", returnToKnowledgeFolders);
document.querySelector("#knowledge-folder-create").addEventListener("click", () => openFolderDialog("create"));
document.querySelector("#knowledge-folder-dialog-close").addEventListener("click", () => folderDialog.close());
document.querySelector("#knowledge-folder-dialog-cancel").addEventListener("click", () => folderDialog.close());
folderForm.addEventListener("submit", (event) => {
  saveKnowledgeFolder(event).catch((error) => setKnowledgeStatus(error.message, "warning"));
});
folderDeleteDialog.addEventListener("close", () => {
  if (folderDeleteDialog.returnValue === "confirm") {
    deleteKnowledgeFolder().catch((error) => setKnowledgeStatus(error.message, "warning"));
  } else {
    deletedKnowledgeFolder = null;
  }
});
document.querySelector("#knowledge-folder-delete-confirm").addEventListener("click", (event) => {
  event.preventDefault();
  folderDeleteDialog.close("confirm");
});
knowledgeSearchInput.addEventListener("input", () => {
  knowledgeRequestSequence += 1;
  window.clearTimeout(knowledgeSearchTimer);
  knowledgeSearchTimer = window.setTimeout(async () => {
    if (currentKnowledgeFolder) knowledgePage = 1;
    else knowledgeFolderPage = 1;
    try {
      await refreshKnowledgeView();
    } catch (error) {
      setKnowledgeStatus(error.message, "warning");
    }
  }, 250);
});
knowledgePageSizeSelect.addEventListener("change", async () => {
  knowledgePageSize = Number(knowledgePageSizeSelect.value);
  knowledgePage = 1;
  try { await refreshKnowledgeView(); } catch (error) { setKnowledgeStatus(error.message, "warning"); }
});
folderPageSizeSelect.addEventListener("change", async () => {
  knowledgeFolderPageSize = Number(folderPageSizeSelect.value);
  knowledgeFolderPage = 1;
  try { await refreshKnowledgeView(); } catch (error) { setKnowledgeStatus(error.message, "warning"); }
});
knowledgePreviousButton.addEventListener("click", async () => {
  if (knowledgePage <= 1) return;
  knowledgePage -= 1;
  try { await refreshKnowledgeView(); } catch (error) { knowledgePage += 1; setKnowledgeStatus(error.message, "warning"); }
});
knowledgeNextButton.addEventListener("click", async () => {
  knowledgePage += 1;
  try { await refreshKnowledgeView(); } catch (error) { knowledgePage -= 1; setKnowledgeStatus(error.message, "warning"); }
});
folderPreviousButton.addEventListener("click", async () => {
  if (knowledgeFolderPage <= 1) return;
  knowledgeFolderPage -= 1;
  try { await refreshKnowledgeView(); } catch (error) { knowledgeFolderPage += 1; setKnowledgeStatus(error.message, "warning"); }
});
folderNextButton.addEventListener("click", async () => {
  knowledgeFolderPage += 1;
  try { await refreshKnowledgeView(); } catch (error) { knowledgeFolderPage -= 1; setKnowledgeStatus(error.message, "warning"); }
});
knowledgeSelectButton.addEventListener("click", () => knowledgeFileInput.click());
knowledgeFileInput.addEventListener("change", () => {
  const supported = /\.(pdf|docx|txt|md|xls|xlsx|xlsm|jpe?g|png|webp|mp4|mov|mkv|webm|avi)$/i;
  for (const file of knowledgeFileInput.files) {
    if (!supported.test(file.name)) {
      setKnowledgeStatus(`${file.name} 格式不支持，请选择 PDF、DOCX、TXT、Markdown、Excel、图片或视频。`, "warning");
      continue;
    }
    if (file.size > MAX_KNOWLEDGE_FILE_SIZE) {
      setKnowledgeStatus(`${file.name} 超过 100 MB 限制。`, "warning");
      continue;
    }
    if (pendingKnowledgeFiles.length >= 5) {
      setKnowledgeStatus("每次最多选择 5 个文件。", "warning");
      break;
    }
    if (!pendingKnowledgeFiles.some((existing) => existing.name === file.name && existing.size === file.size)) pendingKnowledgeFiles.push(file);
  }
  knowledgeFileInput.value = "";
  renderKnowledgeSelection();
});
knowledgeImportButton.addEventListener("click", importKnowledgeFiles);
