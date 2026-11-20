const form = document.querySelector("#chat-form");
const input = document.querySelector("#message-input");
const fileInput = document.querySelector("#file-input");
const fileList = document.querySelector("#file-list");
const messageList = document.querySelector("#message-list");
const welcome = document.querySelector("#welcome");
const sendButton = document.querySelector("#send-button");
const streamStatus = document.querySelector("#stream-status");
const conversationList = document.querySelector("#conversation-list");
const conversationCount = document.querySelector("#conversation-count");
const activeTitle = document.querySelector("#active-title");
const newChatButton = document.querySelector("#new-chat");
const sidebar = document.querySelector(".sidebar");
const sidebarToggle = document.querySelector("#sidebar-toggle");
const sidebarCollapse = document.querySelector("#sidebar-collapse");
const sidebarBackdrop = document.querySelector("#sidebar-backdrop");
const appChatLayout = document.querySelector("#chat-layout");
const appKnowledgeLayout = document.querySelector("#knowledge-layout");
const appToolsLayout = document.querySelector("#tools-layout");
const messages = [];
let selectedFiles = [];
let renderScheduled = false;
let conversationId = null;
let busy = false;

function showChatPage() {
  appChatLayout.hidden = false;
  appKnowledgeLayout.hidden = true;
  appToolsLayout.hidden = true;
  document.querySelector("#knowledge-nav").setAttribute("aria-current", "false");
  document.querySelector("#tools-nav").setAttribute("aria-current", "false");
  closeSidebar();
}

window.showChatPage = showChatPage;

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

const markdownRenderer = window.marked?.Renderer ? new window.marked.Renderer() : null;
if (markdownRenderer) {
  const renderTable = markdownRenderer.table.bind(markdownRenderer);
  markdownRenderer.table = (token) => `<div class="table-scroll">${renderTable(token)}</div>`;
  markdownRenderer.html = ({ text }) => escapeHtml(text);
  markdownRenderer.image = ({ text }) => `<span class="markdown-image-placeholder">图片：${escapeHtml(text || "未命名")}</span>`;
}

const MAX_HIGHLIGHTED_CODE_CHARS = 40_000;
const MAX_AUTO_DETECTION_CODE_CHARS = 12_000;
const markdownCache = new WeakMap();

function highlightCodeBlock(code) {
  const languageClass = [...code.classList].find((className) => className.startsWith("language-"));
  const requestedLanguage = languageClass?.slice("language-".length).toLowerCase();
  const languageAliases = {
    "c#": "csharp",
    "c++": "cpp",
    cs: "csharp",
    html: "xml",
    js: "javascript",
    jsx: "javascript",
    jsonc: "json",
    md: "markdown",
    postgres: "sql",
    postgresql: "sql",
    py: "python",
    python3: "python",
    sh: "bash",
    ts: "typescript",
    tsx: "typescript",
    txt: "plaintext",
    text: "plaintext",
    yml: "yaml",
  };
  const language = languageAliases[requestedLanguage] || requestedLanguage;
  const source = code.textContent;
  if (!window.hljs || source.length > MAX_HIGHLIGHTED_CODE_CHARS) return;

  try {
    let result;
    if (language && window.hljs.getLanguage(language)) {
      result = window.hljs.highlight(source, { language, ignoreIllegals: true });
      code.dataset.language = requestedLanguage;
    } else if (!language && source.trim() && source.length <= MAX_AUTO_DETECTION_CODE_CHARS) {
      const detected = window.hljs.highlightAuto(source);
      if (detected.relevance >= 3) {
        result = detected;
        code.dataset.language = detected.language || "代码";
      }
    }
    if (result) {
      code.innerHTML = result.value;
      code.classList.add("hljs");
    }
  } catch {
    code.classList.add("hljs");
  }
}

function enhanceCodeBlocks(container) {
  for (const pre of container.querySelectorAll("pre")) {
    const code = pre.querySelector("code") || document.createElement("code");
    if (!code.parentElement) {
      code.textContent = pre.textContent;
      pre.replaceChildren(code);
    }

    const wrapper = document.createElement("div");
    wrapper.className = "code-block";
    const toolbar = document.createElement("div");
    toolbar.className = "code-block-toolbar";
    const languageClass = [...code.classList].find((className) => className.startsWith("language-"));
    const language = code.dataset.language || languageClass?.slice("language-".length);
    const languageLabels = {
      bash: "Shell",
      csharp: "C#",
      cpp: "C++",
      javascript: "JavaScript",
      js: "JavaScript",
      json: "JSON",
      markdown: "Markdown",
      plaintext: "TEXT",
      python: "Python",
      py: "Python",
      sql: "SQL",
      typescript: "TypeScript",
      ts: "TypeScript",
      xml: "XML",
      yaml: "YAML",
      yml: "YAML",
    };
    const label = document.createElement("span");
    label.className = "code-block-language";
    label.textContent = language ? languageLabels[language.toLowerCase()] || language.toUpperCase() : "代码";

    const copyButton = document.createElement("button");
    copyButton.className = "code-copy-button";
    copyButton.type = "button";
    copyButton.dataset.copyCode = "true";
    copyButton.setAttribute("aria-label", "复制代码");
    copyButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2"/></svg><span>复制</span>';
    copyButton.querySelector("span").setAttribute("aria-live", "polite");
    toolbar.append(label, copyButton);

    pre.parentNode.insertBefore(wrapper, pre);
    wrapper.append(toolbar, pre);
    highlightCodeBlock(code);
  }
}

function renderMarkdown(message) {
  const finalized = !message.pending;
  const cached = markdownCache.get(message);
  if (cached?.content === message.content && cached.finalized === finalized) return cached.html;

  let html;
  if (window.marked?.parse && window.DOMPurify?.sanitize) {
    const sanitized = window.DOMPurify.sanitize(window.marked.parse(message.content, {
      gfm: true,
      renderer: markdownRenderer || undefined,
    }), {
      USE_PROFILES: { html: true },
    });
    const rendered = document.createElement("div");
    rendered.innerHTML = sanitized;
    for (const link of rendered.querySelectorAll("a[href]")) {
      try {
        const target = new URL(link.getAttribute("href"), window.location.href);
        if ((target.protocol === "http:" || target.protocol === "https:") && target.origin !== window.location.origin) {
          link.target = "_blank";
          link.rel = "noopener noreferrer";
        }
      } catch {
        link.removeAttribute("href");
      }
    }
    if (finalized) enhanceCodeBlocks(rendered);
    html = rendered.innerHTML;
  } else {
    html = `<p>${escapeHtml(message.content).replace(/\n/g, "<br>")}</p>`;
  }

  markdownCache.set(message, { content: message.content, finalized, html });
  return html;
}

function renderMessages() {
  welcome.hidden = messages.length > 0;
  messageList.replaceChildren();
  for (const message of messages) {
    const row = document.createElement("article");
    row.className = `message ${message.role}${message.pending ? " pending" : ""}`;
    const badge = document.createElement("span");
    badge.className = "message-badge";
    badge.setAttribute("aria-hidden", "true");
    badge.textContent = message.role === "user" ? "我" : "AI";
    const content = document.createElement("div");
    content.className = "message-content";
    const header = document.createElement("div");
    header.className = "message-header";
    header.textContent = message.role === "user" ? "你" : "智能体";
    const bubble = document.createElement("div");
    bubble.className = "bubble markdown-body";
    if (message.content) bubble.innerHTML = renderMarkdown(message);
    else if (message.pending) bubble.innerHTML = '<span class="typing-indicator"><span>思考中</span><i></i><i></i><i></i></span>';
    content.append(header);
    if (message.attachments?.length) {
      const attachments = document.createElement("div");
      attachments.className = "message-attachments";
      message.attachments.forEach((filename) => {
        const attachment = document.createElement("span");
        attachment.className = "message-attachment";
        attachment.textContent = filename;
        attachments.append(attachment);
      });
      content.append(attachments);
    }
    content.append(bubble);
    row.append(badge, content);
    messageList.append(row);
  }
  const conversation = document.querySelector("#conversation");
  conversation.scrollTop = conversation.scrollHeight;
}

async function copyCode(button) {
  const code = button.closest(".code-block")?.querySelector("pre code");
  if (!code) return;
  const value = code.textContent.replace(/\n$/, "");
  try {
    let copied = false;
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(value);
        copied = true;
      } catch {
        // Fall back for local addresses where browser clipboard permission is unavailable.
      }
    }
    if (!copied) {
      const temporaryInput = document.createElement("textarea");
      temporaryInput.value = value;
      temporaryInput.setAttribute("readonly", "");
      temporaryInput.style.position = "fixed";
      temporaryInput.style.opacity = "0";
      document.body.append(temporaryInput);
      try {
        temporaryInput.select();
        copied = document.execCommand("copy");
      } finally {
        temporaryInput.remove();
      }
      if (!copied) throw new Error("clipboard unavailable");
    }
    if (!button.isConnected) return;
    const label = button.querySelector("span");
    label.textContent = "已复制";
    button.dataset.copyState = "success";
    button.setAttribute("aria-label", "代码已复制");
    window.setTimeout(() => {
      if (!button.isConnected) return;
      label.textContent = "复制";
      delete button.dataset.copyState;
      button.setAttribute("aria-label", "复制代码");
    }, 1600);
  } catch {
    if (!button.isConnected) return;
    const label = button.querySelector("span");
    label.textContent = "复制失败";
    button.dataset.copyState = "error";
    button.setAttribute("aria-label", "复制失败，请手动选择代码复制");
    window.setTimeout(() => {
      if (!button.isConnected) return;
      label.textContent = "复制";
      delete button.dataset.copyState;
      button.setAttribute("aria-label", "复制代码");
    }, 2200);
  }
}

messageList.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  const copyButton = event.target.closest("[data-copy-code]");
  if (copyButton instanceof HTMLButtonElement) void copyCode(copyButton);
});

function scheduleRender() {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => {
    renderScheduled = false;
    const message = messages[messages.length - 1];
    const bubble = messageList.lastElementChild?.querySelector(".bubble");
    if (!message || !bubble) return;
    bubble.innerHTML = renderMarkdown(message);
    const conversation = document.querySelector("#conversation");
    conversation.scrollTop = conversation.scrollHeight;
  });
}

function renderFiles() {
  fileList.replaceChildren();
  selectedFiles.forEach((file, index) => {
    const chip = document.createElement("div");
    chip.className = "file-chip";
    const name = document.createElement("span");
    name.className = "file-chip-name";
    name.textContent = file.name;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.setAttribute("aria-label", `移除附件 ${file.name}`);
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      selectedFiles = selectedFiles.filter((_, fileIndex) => fileIndex !== index);
      renderFiles();
    });
    chip.append(name, remove);
    fileList.append(chip);
  });
}

function showError(message) {
  document.querySelector(".error-note")?.remove();
  const note = document.createElement("div");
  note.className = "error-note";
  note.setAttribute("role", "alert");
  note.textContent = message;
  form.prepend(note);
}

async function loadConversations() {
  const response = await fetch("/api/conversations");
  if (!response.ok) throw new Error("无法读取本地对话列表。");
  const conversations = await response.json();
  conversationList.replaceChildren();
  conversationCount.textContent = String(conversations.length);
  if (conversations.length === 0) {
    const empty = document.createElement("div");
    empty.className = "conversation-empty";
    empty.textContent = "新对话会保存在这里";
    conversationList.append(empty);
    return conversations;
  }

  conversations.forEach((conversation) => {
    const row = document.createElement("div");
    row.className = "conversation-row";
    const open = document.createElement("button");
    open.type = "button";
    open.className = `conversation-open${conversation.id === conversationId ? " active" : ""}`;
    open.dataset.conversationId = conversation.id;
    open.dataset.initial = conversation.title?.trim().charAt(0) || "对";
    open.title = conversation.title;
    const title = document.createElement("span");
    title.className = "conversation-title";
    title.textContent = conversation.title;
    const preview = document.createElement("span");
    preview.className = "conversation-preview";
    preview.textContent = conversation.preview || "空对话";
    open.append(title, preview);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "delete-conversation";
    remove.dataset.deleteConversationId = conversation.id;
    remove.setAttribute("aria-label", `删除对话：${conversation.title}`);
    remove.title = "删除对话";
    remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';
    row.append(open, remove);
    conversationList.append(row);
  });
  conversationList.querySelectorAll("button").forEach((button) => {
    button.disabled = busy;
  });
  return conversations;
}

async function openConversation(id) {
  const response = await fetch(`/api/conversations/${encodeURIComponent(id)}`);
  if (!response.ok) throw new Error("无法打开这条对话，它可能已被删除。");
  const conversation = await response.json();
  showChatPage();
  conversationId = conversation.id;
  selectedFiles = [];
  renderFiles();
  messages.splice(0, messages.length, ...conversation.messages.map((message) => ({
    role: message.role,
    content: message.content,
    attachments: message.attachments,
  })));
  activeTitle.textContent = conversation.title;
  renderMessages();
  await loadConversations();
  closeSidebar();
}

async function deleteConversation(id) {
  const response = await fetch(`/api/conversations/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!response.ok) throw new Error("删除对话失败，请重试。");
  if (conversationId === id) resetConversation();
  await loadConversations();
}

function resetConversation() {
  showChatPage();
  conversationId = null;
  messages.length = 0;
  selectedFiles = [];
  input.value = "";
  activeTitle.textContent = "新对话";
  streamStatus.textContent = "已开始新对话。";
  renderFiles();
  renderMessages();
  document.querySelector(".error-note")?.remove();
  void loadConversations().catch((error) => showError(error.message));
  input.focus();
}

function closeSidebar() {
  sidebar.classList.remove("open");
  sidebarToggle.setAttribute("aria-expanded", "false");
  sidebarToggle.setAttribute("aria-label", "打开对话列表");
  sidebarBackdrop.hidden = true;
}

async function readStream(response, assistantMessage) {
  if (!response.body) throw new Error("浏览器无法读取流式响应，请刷新页面后重试。");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;
  let completed = false;
  while (!finished) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() || "";
    for (const block of blocks) {
      const eventName = block.match(/^event:\s*(.+)$/m)?.[1];
      const dataLine = block.match(/^data:\s*(.*)$/m)?.[1] || "{}";
      const data = JSON.parse(dataLine);
      if (eventName === "delta" && typeof data.content === "string") {
        assistantMessage.content += data.content;
        scheduleRender();
      } else if (eventName === "error") {
        throw new Error(data.message || "模型生成失败，请重试。");
      } else if (eventName === "done") {
        finished = true;
        completed = true;
        break;
      }
    }
    if (done) break;
  }
  if (!completed) throw new Error("连接中断，回答可能不完整，请重试。");
  if (!assistantMessage.content.trim()) throw new Error("模型没有返回有效文本，请重试。");
}

async function sendMessage(prefill = null) {
  if (busy) return;
  if (prefill) input.value = prefill;
  const question = input.value.trim();
  if (!question && selectedFiles.length === 0) {
    showError("请先输入消息或添加附件。");
    input.focus();
    return;
  }
  document.querySelector(".error-note")?.remove();
  const attachmentNames = selectedFiles.map((file) => file.name);
  messages.push({ role: "user", content: question || "请阅读我上传的资料，并帮我处理。", attachments: attachmentNames });
  const assistantMessage = { role: "assistant", content: "", pending: true };
  messages.push(assistantMessage);
  streamStatus.textContent = "DeepSeek 正在生成回答。";
  renderMessages();
  input.value = "";
  input.style.height = "auto";
  busy = true;
  sendButton.disabled = true;
  newChatButton.disabled = true;
  conversationList.querySelectorAll("button").forEach((button) => {
    button.disabled = true;
  });
  const body = new FormData();
  body.append("message", question);
  if (conversationId) body.append("conversation_id", conversationId);
  body.append("use_knowledge", String(document.querySelector("#knowledge-enabled").checked));
  selectedFiles.forEach((file) => body.append("files", file, file.name));
  try {
    const response = await fetch("/api/chat", { method: "POST", body });
    if (!response.ok) {
      const payload = await response.json();
      throw new Error(payload.detail || "请求失败，请重试。");
    }
    conversationId = response.headers.get("x-conversation-id") || conversationId;
    const savedConversation = (await loadConversations()).find((item) => item.id === conversationId);
    activeTitle.textContent = savedConversation?.title || "新对话";
    await readStream(response, assistantMessage);
    selectedFiles = [];
    renderFiles();
    delete assistantMessage.pending;
    const updatedConversation = (await loadConversations()).find((item) => item.id === conversationId);
    activeTitle.textContent = updatedConversation?.title || "新对话";
    streamStatus.textContent = "回答已完成。";
  } catch (error) {
    assistantMessage.content = assistantMessage.content
      ? `${assistantMessage.content}\n\n---\n\n**连接中断：** ${error.message}`
      : `**暂时无法完成回答：** ${error.message}`;
    delete assistantMessage.pending;
    streamStatus.textContent = "回答中断。";
  } finally {
    busy = false;
    sendButton.disabled = false;
    newChatButton.disabled = false;
    conversationList.querySelectorAll("button").forEach((button) => {
      button.disabled = false;
    });
    renderMessages();
    input.focus();
  }
}

document.querySelector("#attach-button").addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  const accepted = /\.(pdf|docx|txt|md)$/i;
  for (const file of fileInput.files) {
    if (!accepted.test(file.name)) {
      showError("请选择 PDF、DOCX、TXT 或 Markdown 文件。");
      continue;
    }
    if (file.size > 10 * 1024 * 1024) {
      showError(`${file.name} 超过 10 MB 限制。`);
      continue;
    }
    if (!selectedFiles.some((existing) => existing.name === file.name && existing.size === file.size)) selectedFiles.push(file);
  }
  fileInput.value = "";
  renderFiles();
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage();
});
input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 150)}px`;
});
input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});
document.querySelectorAll(".suggestion").forEach((button) => {
  button.addEventListener("click", () => {
    sendMessage(button.dataset.prompt);
  });
});
newChatButton.addEventListener("click", resetConversation);
sidebarToggle.addEventListener("click", () => {
  const isOpen = sidebar.classList.toggle("open");
  sidebarToggle.setAttribute("aria-expanded", String(isOpen));
  sidebarToggle.setAttribute("aria-label", isOpen ? "关闭导航" : "打开导航");
  sidebarBackdrop.hidden = !isOpen;
});
sidebarCollapse.addEventListener("click", () => {
  const isCollapsed = sidebar.classList.toggle("collapsed");
  sidebarCollapse.setAttribute("aria-expanded", String(!isCollapsed));
  sidebarCollapse.setAttribute("aria-label", isCollapsed ? "展开侧边栏" : "收起侧边栏");
  sidebarCollapse.title = isCollapsed ? "展开侧边栏" : "收起侧边栏";
  localStorage.setItem("sidebar-collapsed", String(isCollapsed));
});
sidebarBackdrop.addEventListener("click", closeSidebar);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeSidebar();
});
conversationList.addEventListener("click", async (event) => {
  const remove = event.target.closest("[data-delete-conversation-id]");
  if (remove) {
    const id = remove.dataset.deleteConversationId;
    if (!window.confirm("删除这条对话？消息和附件提取文本也会从本机记录中删除。")) return;
    try {
      await deleteConversation(id);
    } catch (error) {
      showError(error.message);
    }
    return;
  }
  const open = event.target.closest("[data-conversation-id]");
  if (open) {
    try {
      await openConversation(open.dataset.conversationId);
    } catch (error) {
      showError(error.message);
    }
  }
});

loadConversations().then((items) => {
  if (localStorage.getItem("sidebar-collapsed") === "true" && window.innerWidth > 700) {
    sidebar.classList.add("collapsed");
    sidebarCollapse.setAttribute("aria-expanded", "false");
    sidebarCollapse.setAttribute("aria-label", "展开侧边栏");
    sidebarCollapse.title = "展开侧边栏";
  }
  if (items.length > 0) return openConversation(items[0].id);
  renderMessages();
}).catch((error) => showError(error.message));

const knowledgeLayout = document.querySelector("#knowledge-layout");
const chatLayout = document.querySelector("#chat-layout");
const knowledgeNav = document.querySelector("#knowledge-nav");
const knowledgeFileInput = document.querySelector("#knowledge-file-input");
const knowledgeSelection = document.querySelector("#knowledge-selection");
const knowledgeActions = document.querySelector("#knowledge-actions");
const knowledgeDocuments = document.querySelector("#knowledge-documents");
const knowledgeStatus = document.querySelector("#knowledge-status");
const knowledgeCount = document.querySelector("#knowledge-count");
const knowledgeListCount = document.querySelector("#knowledge-list-count");
const knowledgeImportButton = document.querySelector("#knowledge-import");
const knowledgeSelectButton = document.querySelector("#knowledge-select");
const pendingKnowledgeFiles = [];
let knowledgeBusy = false;

function setKnowledgeStatus(message, state = "") {
  knowledgeStatus.textContent = message;
  if (state) knowledgeStatus.dataset.state = state;
  else delete knowledgeStatus.dataset.state;
}

function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  const statusLabels = { ready: "已建立索引", indexing: "正在建立索引", failed: "索引失败" };
  status.textContent = `${statusLabels[documentInfo.status] || documentInfo.status}${documentInfo.chunk_count ? ` · ${documentInfo.chunk_count} 个文本块` : ""}`;
  meta.append(size, status);
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

async function refreshKnowledgeDocuments() {
  const response = await fetch("/api/knowledge");
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.detail || "读取知识库列表失败。");
  knowledgeDocuments.replaceChildren();
  knowledgeCount.textContent = String(payload.documents.length);
  knowledgeListCount.textContent = `${payload.documents.length} 个文件`;
  if (payload.model_available) {
    setKnowledgeStatus(`本机向量模型 ${payload.model} 已连接。原始文件保存在 ${payload.data_directory}；向量索引保存在 ${payload.vector_directory}。`, "ready");
  } else {
    setKnowledgeStatus(`无法连接本机 Ollama 或未发现 ${payload.model}。请启动 Ollama 后再导入文件。`, "warning");
  }
  if (payload.documents.length === 0) {
    const empty = document.createElement("div");
    empty.className = "knowledge-empty";
    empty.textContent = "还没有导入知识库资料。请从上方选择文件；聊天附件不会自动加入。";
    knowledgeDocuments.append(empty);
    return;
  }
  payload.documents.forEach((item) => knowledgeDocuments.append(createKnowledgeDocument(item)));
}

async function importKnowledgeFiles() {
  if (knowledgeBusy || pendingKnowledgeFiles.length === 0) return;
  knowledgeBusy = true;
  knowledgeLayout.classList.add("knowledge-importing");
  knowledgeImportButton.disabled = true;
  let successCount = 0;
  let savedFailureCount = 0;
  let failureMessage = "";
  try {
    for (const file of [...pendingKnowledgeFiles]) {
      setKnowledgeStatus(`正在明确导入 ${file.name} 并在本机建立向量索引…`);
      const body = new FormData();
      body.append("file", file, file.name);
      try {
        const response = await fetch("/api/knowledge/documents", { method: "POST", body });
        const payload = await response.json();
        if (!response.ok) {
          if (payload.document_id) savedFailureCount = 1;
          throw new Error(payload.detail || `无法导入 ${file.name}。`);
        }
        successCount += 1;
      } catch (error) {
        failureMessage = error.message;
        break;
      }
    }
    const handledFileCount = successCount + savedFailureCount;
    if (handledFileCount > 0) {
      pendingKnowledgeFiles.splice(0, handledFileCount);
      renderKnowledgeSelection();
    }
    await refreshKnowledgeDocuments();
    if (failureMessage) {
      const completedMessage = successCount > 0 ? `已成功导入 ${successCount} 个文件。` : "";
      setKnowledgeStatus(`${completedMessage}${failureMessage}`, "warning");
    } else if (successCount > 0) {
      setKnowledgeStatus(`已将 ${successCount} 个文件明确导入知识库并完成本机索引。`, "ready");
    }
  } catch (error) {
    setKnowledgeStatus(error.message, "warning");
  } finally {
    knowledgeLayout.classList.remove("knowledge-importing");
    knowledgeImportButton.disabled = false;
    knowledgeBusy = false;
  }
}

async function removeKnowledgeDocument(documentInfo) {
  if (!window.confirm(`从知识库中删除“${documentInfo.file_name}”？这会删除本机文件和对应向量索引，不影响对话中单独上传的附件。`)) return;
  try {
    const response = await fetch(`/api/knowledge/documents/${encodeURIComponent(documentInfo.id)}`, { method: "DELETE" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail || "删除知识库资料失败。");
    await refreshKnowledgeDocuments();
    setKnowledgeStatus(`已从知识库删除 ${documentInfo.file_name}。`, "ready");
  } catch (error) {
    setKnowledgeStatus(error.message, "warning");
  }
}

async function retryKnowledgeDocument(documentId) {
  let statusMessage = "文件已重新建立索引。";
  let statusState = "ready";
  try {
    knowledgeLayout.classList.add("knowledge-importing");
    const response = await fetch(`/api/knowledge/documents/${encodeURIComponent(documentId)}/reindex`, { method: "POST" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail || "重新索引失败。");
  } catch (error) {
    statusMessage = error.message;
    statusState = "warning";
  } finally {
    knowledgeLayout.classList.remove("knowledge-importing");
    try {
      await refreshKnowledgeDocuments();
    } catch (error) {
      statusMessage = error.message;
      statusState = "warning";
    }
    setKnowledgeStatus(statusMessage, statusState);
  }
}

knowledgeNav.addEventListener("click", async () => {
  chatLayout.hidden = true;
  knowledgeLayout.hidden = false;
  knowledgeNav.setAttribute("aria-current", "page");
  if (window.innerWidth <= 700) {
    document.querySelector(".sidebar").classList.remove("open");
    document.querySelector("#sidebar-backdrop").hidden = true;
    document.querySelector("#sidebar-toggle").setAttribute("aria-expanded", "false");
    document.querySelector("#sidebar-toggle").setAttribute("aria-label", "打开对话列表");
  }
  try {
    await refreshKnowledgeDocuments();
  } catch (error) {
    setKnowledgeStatus(error.message, "warning");
  }
});

document.querySelector("#new-chat").addEventListener("click", () => {
  window.showChatPage();
});
document.querySelector("#knowledge-back").addEventListener("click", () => {
  window.showChatPage();
});
document.querySelector("#knowledge-refresh").addEventListener("click", async () => {
  try {
    await refreshKnowledgeDocuments();
  } catch (error) {
    setKnowledgeStatus(error.message, "warning");
  }
});
knowledgeSelectButton.addEventListener("click", () => knowledgeFileInput.click());
knowledgeFileInput.addEventListener("change", () => {
  const supported = /\.(pdf|docx|txt|md)$/i;
  for (const file of knowledgeFileInput.files) {
    if (!supported.test(file.name)) {
      setKnowledgeStatus(`${file.name} 格式不支持，请选择 PDF、DOCX、TXT 或 Markdown。`, "warning");
      continue;
    }
    if (file.size > 10 * 1024 * 1024) {
      setKnowledgeStatus(`${file.name} 超过 10 MB 限制。`, "warning");
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

(() => {
const toolsLayout = document.querySelector("#tools-layout");
const chatLayout = document.querySelector("#chat-layout");
const knowledgeLayout = document.querySelector("#knowledge-layout");
const toolsNav = document.querySelector("#tools-nav");
const toolEditor = document.querySelector("#tool-editor");
const toolEditorTitle = document.querySelector("#tool-editor-title");
const toolReset = document.querySelector("#tool-reset");
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
  editingToolId = null;
  selectedTestTool = null;
  toolEditor.reset();
  toolEditorTitle.textContent = "新增 HTTP 接口";
  toolReset.hidden = true;
  toolTestCard.hidden = true;
  toolParameterList.replaceChildren();
  toolHeaderList.replaceChildren();
  renderToolRowEmptyState(toolParameterList, "还没有配置参数，请点击“添加参数”。");
  renderToolRowEmptyState(toolHeaderList, "还没有配置固定请求头。");
  setToolStatus("");
  setToolStatus("", toolTestStatus);
  toolTestResult.hidden = true;
}

function fillToolEditor(tool) {
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
  toolTestCard.hidden = false;
  toolTestResult.hidden = true;
  setToolStatus("");
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
    empty.textContent = "还没有配置接口。点击上方表单添加第一个工具。";
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
      fillToolEditor(tool);
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
    fillToolEditor(result);
    setToolStatus("接口已保存。");
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

function showToolsPage() {
  chatLayout.hidden = true;
  knowledgeLayout.hidden = true;
  toolsLayout.hidden = false;
  toolsNav.setAttribute("aria-current", "page");
  document.querySelector("#knowledge-nav").setAttribute("aria-current", "false");
  if (window.innerWidth <= 700) {
    document.querySelector(".sidebar").classList.remove("open");
    document.querySelector("#sidebar-backdrop").hidden = true;
  }
  loadTools().catch((error) => setToolStatus(error.message));
}

toolsNav.addEventListener("click", showToolsPage);
document.querySelector("#tools-back").addEventListener("click", () => {
  window.showChatPage();
});
document.querySelector("#knowledge-nav").addEventListener("click", () => {
  toolsLayout.hidden = true;
  toolsNav.setAttribute("aria-current", "false");
});
document.querySelector("#tool-add-parameter").addEventListener("click", () => addParameterRow());
document.querySelector("#tool-add-header").addEventListener("click", () => addHeaderRow());
toolReset.addEventListener("click", resetToolEditor);
toolEditor.addEventListener("submit", saveTool);
toolTestButton.addEventListener("click", testSelectedTool);
resetToolEditor();
})();

