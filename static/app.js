const form = document.querySelector("#chat-form");
const input = document.querySelector("#message-input");
const fileInput = document.querySelector("#file-input");
const fileList = document.querySelector("#file-list");
const messageList = document.querySelector("#message-list");
const welcome = document.querySelector("#welcome");
const sendButton = document.querySelector("#send-button");
const thinkingToggle = document.querySelector("#thinking-toggle");
const workflowSelect = document.querySelector("#workflow-select");
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
const adminWorkbenchTrigger = document.querySelector("#admin-workbench-trigger");
const confirmOverlay = document.querySelector("#confirm-overlay");
const confirmCancel = document.querySelector("#confirm-cancel");
const confirmDelete = document.querySelector("#confirm-delete");
const appShell = document.querySelector("#app-shell");
const startupScreen = document.querySelector("#startup-screen");
const authOverlay = document.querySelector("#auth-overlay");
const authForm = document.querySelector("#auth-form");
const authUsername = document.querySelector("#auth-username");
const authPassword = document.querySelector("#auth-password");
const authSubmit = document.querySelector("#auth-submit");
const authError = document.querySelector("#auth-error");
const authHint = document.querySelector("#auth-hint");
const accountMenuTrigger = document.querySelector("#account-menu-trigger");
const accountMenu = document.querySelector("#account-menu");
const logoutTrigger = document.querySelector("#logout-trigger");
const accountName = document.querySelector("#account-name");
const accountRole = document.querySelector("#account-role");
const accountAvatar = document.querySelector("#account-avatar");
const imageLightbox = document.querySelector("#image-lightbox");
const imageLightboxImage = document.querySelector("#image-lightbox-image");
const imageLightboxCaption = document.querySelector("#image-lightbox-caption");
const imageLightboxClose = document.querySelector("#image-lightbox-close");
const imageLightboxZoomLevel = document.querySelector("#image-lightbox-zoom-level");
const imageLightboxContent = document.querySelector(".image-lightbox-content");
let confirmDeleteResolver = null;
let confirmReturnFocus = null;
let imageLightboxOpener = null;
let imageLightboxZoom = 1;
let imageLightboxPan = null;
const messages = [];
let selectedFiles = [];
let selectedPreviewUrls = [];
let renderScheduled = false;
let conversationId = null;
let busy = false;
let currentUser = null;
let authMode = "login";
const ACTIVE_CONVERSATION_KEY = "agno-active-conversation-id";

const nativeFetch = window.fetch.bind(window);
window.fetch = async (...args) => {
  const response = await nativeFetch(...args);
  const requestUrl = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
  if (response.status === 401 && !requestUrl.startsWith("/api/auth/")) {
    showLoginRequired();
  }
  return response;
};

function showLoginRequired() {
  if (!currentUser) return;
  currentUser = null;
  conversationId = null;
  localStorage.removeItem(ACTIVE_CONVERSATION_KEY);
  messages.length = 0;
  selectedFiles = [];
  fileInput.value = "";
  renderFiles();
  input.value = "";
  appShell.hidden = true;
  authOverlay.hidden = false;
  authUsername.value = "";
  authPassword.value = "";
  accountMenu.hidden = true;
  accountMenuTrigger.setAttribute("aria-expanded", "false");
  setAuthMode("login");
  authError.textContent = "登录状态已失效，请重新登录。";
  authError.hidden = false;
  authUsername.focus();
}

function setAuthMode(mode) {
  authMode = mode;
  const registering = mode === "register";
  document.querySelector("#auth-title").textContent = registering ? "创建账号" : "欢迎回来";
  document.querySelector("#auth-description").textContent = registering
    ? "注册后即可使用你的智能体工作区。"
    : "登录后继续使用你的智能体工作区。";
  document.querySelector("#auth-login-mode").classList.toggle("active", !registering);
  document.querySelector("#auth-register-mode").classList.toggle("active", registering);
  document.querySelector("#auth-login-mode").setAttribute("aria-selected", String(!registering));
  document.querySelector("#auth-register-mode").setAttribute("aria-selected", String(registering));
  authPassword.autocomplete = registering ? "new-password" : "current-password";
  authSubmit.textContent = registering ? "注册并登录" : "登录";
  authHint.hidden = !registering;
  authError.hidden = true;
}

async function showAuthenticatedApp(user, restoreConversation = false) {
  currentUser = user;
  startupScreen.hidden = true;
  appShell.hidden = false;
  authOverlay.hidden = true;
  accountName.textContent = user.username;
  accountRole.textContent = user.is_super_admin ? "超级管理员" : "普通用户";
  accountAvatar.textContent = [...user.username][0]?.toUpperCase() || "U";
  adminWorkbenchTrigger.hidden = !user.is_super_admin;
  adminWorkbenchTrigger.disabled = !user.is_super_admin;
  document.querySelector("#account-menu-wrap").hidden = false;
  void loadPublishedWorkflows();
  if (restoreConversation) {
    const savedConversationId = localStorage.getItem(ACTIVE_CONVERSATION_KEY);
    if (savedConversationId) {
      try {
        await openConversation(savedConversationId);
        return;
      } catch {
        localStorage.removeItem(ACTIVE_CONVERSATION_KEY);
      }
    }
  }
  resetConversation();
}

async function initializeAuthentication() {
  const response = await fetch("/api/auth/me", { cache: "no-store" });
  const payload = await response.json();
  if (response.ok && payload.authenticated && payload.user) {
    await showAuthenticatedApp(payload.user, true);
    return;
  }
  startupScreen.hidden = true;
  appShell.hidden = true;
  authOverlay.hidden = false;
  authUsername.focus();
}

function showChatPage() {
  appChatLayout.hidden = false;
  closeSidebar();
}

window.showChatPage = showChatPage;

function confirmConversationDeletion(opener) {
  confirmOverlay.hidden = false;
  confirmReturnFocus = opener;
  confirmCancel.focus();
  return new Promise((resolve) => {
    confirmDeleteResolver = resolve;
  });
}

function closeConversationConfirmation(confirmed) {
  if (confirmOverlay.hidden) return;
  confirmOverlay.hidden = true;
  const resolve = confirmDeleteResolver;
  confirmDeleteResolver = null;
  const returnFocus = confirmReturnFocus;
  confirmReturnFocus = null;
  resolve?.(confirmed);
  if (!confirmed && returnFocus?.isConnected) returnFocus.focus();
}

confirmCancel.addEventListener("click", () => closeConversationConfirmation(false));
confirmDelete.addEventListener("click", () => closeConversationConfirmation(true));
confirmOverlay.addEventListener("click", (event) => {
  if (event.target === confirmOverlay) closeConversationConfirmation(false);
});

adminWorkbenchTrigger.addEventListener("click", () => {
  if (!currentUser?.is_super_admin) return;
  accountMenu.hidden = true;
  accountMenuTrigger.setAttribute("aria-expanded", "false");
  window.location.assign("/admin");
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !confirmOverlay.hidden) {
    event.stopImmediatePropagation();
    closeConversationConfirmation(false);
    return;
  }
});

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function normalizeMarkdownImageUrl(value) {
  return value
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/%(?:E2%80%8[B-D]|E2%81%A0|EF%BB%BF)/gi, "");
}

function normalizeMarkdownImageAliases(content, aliases = {}) {
  if (!content || !Object.keys(aliases).length) return content;
  return content.replace(/(!\[[^\]]*\]\()([^\s)]+)(\s+[^)]*)?(\))/g, (match, prefix, target, suffix = "", closing) => {
    try {
      const parsed = new URL(normalizeMarkdownImageUrl(target).replace(/^<|>$/g, ""), window.location.href);
      if (parsed.origin !== window.location.origin || parsed.pathname.startsWith("/api/")) return match;
      const imageName = decodeURIComponent(parsed.pathname.split("/").pop() || "").toLowerCase();
      const authorizedUrl = aliases[imageName];
      return authorizedUrl ? `${prefix}${authorizedUrl}${suffix}${closing}` : match;
    } catch {
      return match;
    }
  });
}

const markdownRenderer = window.marked?.Renderer ? new window.marked.Renderer() : null;
if (markdownRenderer) {
  const renderTable = markdownRenderer.table.bind(markdownRenderer);
  markdownRenderer.table = (token) => `<div class="table-scroll">${renderTable(token)}</div>`;
  markdownRenderer.html = ({ text }) => escapeHtml(text);
  markdownRenderer.image = ({ href, title, text }) => {
    const safeHref = escapeHtml(normalizeMarkdownImageUrl(href || ""));
    const safeAlt = escapeHtml(text || "知识库图片");
    const safeTitle = title ? ` title="${escapeHtml(title)}"` : "";
    return `<img src="${safeHref}" alt="${safeAlt}"${safeTitle} loading="lazy" decoding="async" />`;
  };
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

function openImageLightbox(image) {
  if (imageLightbox.open) return;
  const description = image.alt || "图片预览";
  imageLightboxImage.src = image.currentSrc || image.src;
  imageLightboxImage.alt = description;
  imageLightboxCaption.textContent = description;
  imageLightboxZoom = 1;
  imageLightboxImage.style.transform = "scale(1)";
  imageLightboxImage.style.transformOrigin = "0 0";
  imageLightboxContent.scrollTo({ top: 0, left: 0 });
  updateImageLightboxZoomLabel();
  imageLightboxOpener = image;
  imageLightbox.showModal();
  imageLightboxClose.focus();
}

function updateImageLightboxZoomLabel() {
  imageLightboxZoomLevel.textContent = `${Math.round(imageLightboxZoom * 100)}% · 滚轮缩放`;
}

function setImageLightboxZoom(nextZoom, clientX = null, clientY = null) {
  const imageBounds = imageLightboxImage.getBoundingClientRect();
  const previousZoom = imageLightboxZoom;
  const nextZoomValue = Math.max(1, Math.min(5, nextZoom));
  const zoomPointX = clientX ?? imageBounds.left + imageBounds.width / 2;
  const zoomPointY = clientY ?? imageBounds.top + imageBounds.height / 2;
  const imagePointX = Math.max(0, (zoomPointX - imageBounds.left) / previousZoom);
  const imagePointY = Math.max(0, (zoomPointY - imageBounds.top) / previousZoom);
  imageLightboxImage.style.transformOrigin = "0 0";
  imageLightboxZoom = nextZoomValue;
  imageLightboxImage.style.transform = `scale(${imageLightboxZoom})`;
  imageLightboxContent.scrollLeft += imagePointX * (nextZoomValue - previousZoom);
  imageLightboxContent.scrollTop += imagePointY * (nextZoomValue - previousZoom);
  imageLightboxContent.classList.toggle("is-zoomed", imageLightboxZoom > 1);
  updateImageLightboxZoomLabel();
  if (imageLightboxZoom === 1) imageLightboxContent.scrollTo({ top: 0, left: 0 });
}

imageLightboxClose.addEventListener("click", () => imageLightbox.close());
imageLightbox.addEventListener("click", (event) => {
  if (event.target === imageLightbox) imageLightbox.close();
});
imageLightbox.addEventListener("wheel", (event) => {
  if (!imageLightbox.open || event.target !== imageLightboxImage) return;
  event.preventDefault();
  const zoomFactor = Math.exp(-event.deltaY * 0.0015);
  setImageLightboxZoom(imageLightboxZoom * zoomFactor, event.clientX, event.clientY);
}, { passive: false });
imageLightbox.addEventListener("keydown", (event) => {
  if (imageLightboxZoom > 1 && event.key.startsWith("Arrow")) {
    const directions = {
      ArrowDown: [0, 80],
      ArrowLeft: [-80, 0],
      ArrowRight: [80, 0],
      ArrowUp: [0, -80],
    };
    const direction = directions[event.key];
    if (direction) {
      event.preventDefault();
      imageLightboxContent.scrollBy({ left: direction[0], top: direction[1] });
    }
  } else if (event.key === "+" || event.key === "=") {
    event.preventDefault();
    setImageLightboxZoom(imageLightboxZoom * 1.2);
  } else if (event.key === "-") {
    event.preventDefault();
    setImageLightboxZoom(imageLightboxZoom / 1.2);
  } else if (event.key === "0") {
    event.preventDefault();
    setImageLightboxZoom(1);
  }
});
imageLightboxContent.addEventListener("pointerdown", (event) => {
  if (event.target !== imageLightboxImage || imageLightboxZoom <= 1 || event.button !== 0) return;
  event.preventDefault();
  imageLightboxPan = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    scrollLeft: imageLightboxContent.scrollLeft,
    scrollTop: imageLightboxContent.scrollTop,
  };
  imageLightboxContent.classList.add("is-dragging");
  imageLightboxContent.setPointerCapture(event.pointerId);
});
imageLightboxContent.addEventListener("pointermove", (event) => {
  if (!imageLightboxPan || event.pointerId !== imageLightboxPan.pointerId) return;
  imageLightboxContent.scrollLeft = imageLightboxPan.scrollLeft - (event.clientX - imageLightboxPan.startX);
  imageLightboxContent.scrollTop = imageLightboxPan.scrollTop - (event.clientY - imageLightboxPan.startY);
});
function stopImageLightboxPan(event) {
  if (!imageLightboxPan || event.pointerId !== imageLightboxPan.pointerId) return;
  imageLightboxContent.classList.remove("is-dragging");
  if (imageLightboxContent.hasPointerCapture(event.pointerId)) {
    imageLightboxContent.releasePointerCapture(event.pointerId);
  }
  imageLightboxPan = null;
}
imageLightboxContent.addEventListener("pointerup", stopImageLightboxPan);
imageLightboxContent.addEventListener("pointercancel", stopImageLightboxPan);
imageLightbox.addEventListener("close", () => {
  imageLightboxImage.removeAttribute("src");
  imageLightboxImage.alt = "";
  imageLightboxCaption.textContent = "";
  imageLightboxZoom = 1;
  imageLightboxImage.style.transform = "scale(1)";
  imageLightboxImage.style.transformOrigin = "0 0";
  imageLightboxContent.classList.remove("is-zoomed", "is-dragging");
  if (imageLightboxPan && imageLightboxContent.hasPointerCapture(imageLightboxPan.pointerId)) {
    imageLightboxContent.releasePointerCapture(imageLightboxPan.pointerId);
  }
  imageLightboxPan = null;
  updateImageLightboxZoomLabel();
  if (imageLightboxOpener?.isConnected) imageLightboxOpener.focus();
  imageLightboxOpener = null;
});

function renderMarkdown(message) {
  const finalized = !message.pending;
  const mediaAliasesKey = JSON.stringify(message.mediaAliases || {});
  const cached = markdownCache.get(message);
  if (cached?.content === message.content && cached.finalized === finalized && cached.mediaAliasesKey === mediaAliasesKey) return cached.html;

  let html;
  if (window.marked?.parse && window.DOMPurify?.sanitize) {
    const markdownContent = normalizeMarkdownImageAliases(message.content, message.mediaAliases);
    const sanitized = window.DOMPurify.sanitize(window.marked.parse(markdownContent, {
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
    for (const image of rendered.querySelectorAll("img")) {
      try {
        const normalizedUrl = normalizeMarkdownImageUrl(image.getAttribute("src") || "");
        image.setAttribute("src", normalizedUrl);
        const target = new URL(normalizedUrl, window.location.href);
        if (
          !["http:", "https:"].includes(target.protocol)
          || target.origin !== window.location.origin
        ) {
          image.remove();
          continue;
        }
      } catch {
        image.remove();
        continue;
      }
      if (!image.getAttribute("alt")?.trim()) image.alt = "知识库图片";
      image.loading = "lazy";
      image.decoding = "async";
      image.referrerPolicy = "no-referrer";
      image.dataset.imageZoom = "true";
      image.tabIndex = 0;
      image.setAttribute("role", "button");
      image.setAttribute("aria-haspopup", "dialog");
      image.setAttribute("aria-label", `查看大图：${image.alt}`);
      image.title = "点击查看大图";
    }
    if (finalized) enhanceCodeBlocks(rendered);
    html = rendered.innerHTML;
  } else {
    html = `<p>${escapeHtml(message.content).replace(/\n/g, "<br>")}</p>`;
  }

  markdownCache.set(message, { content: message.content, finalized, mediaAliasesKey, html });
  return html;
}

function renderMessages() {
  const isWelcomeView = messages.length === 0;
  welcome.hidden = !isWelcomeView;
  appChatLayout.classList.toggle("welcome-mode", isWelcomeView);
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
    const bubble = document.createElement("div");
    bubble.className = "bubble markdown-body";
    if (message.content) bubble.innerHTML = renderMarkdown(message);
    else if (message.pending) bubble.innerHTML = '<span class="typing-indicator"><span>思考中</span><i></i><i></i><i></i></span>';
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
    if (message.reasoningEnabled && (message.pending || message.reasoning)) {
      const reasoningPanel = document.createElement("details");
      reasoningPanel.className = "reasoning-panel";
      reasoningPanel.open = true;
      const reasoningHeading = document.createElement("summary");
      const reasoningTitle = document.createElement("span");
      reasoningTitle.textContent = "思考过程";
      const reasoningState = document.createElement("span");
      reasoningState.className = "reasoning-state";
      reasoningState.textContent = message.reasoningState === "complete" ? "已结束" : "正在思考";
      reasoningHeading.append(reasoningTitle, reasoningState);
      const reasoningContent = document.createElement("div");
      reasoningContent.className = "reasoning-content";
      reasoningContent.textContent = message.reasoning || "";
      reasoningPanel.append(reasoningHeading, reasoningContent);
      content.append(reasoningPanel);
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
  const image = event.target.closest("[data-image-zoom]");
  if (image instanceof HTMLImageElement) {
    openImageLightbox(image);
    return;
  }
  const copyButton = event.target.closest("[data-copy-code]");
  if (copyButton instanceof HTMLButtonElement) void copyCode(copyButton);
});

messageList.addEventListener("keydown", (event) => {
  if (!(event.target instanceof HTMLImageElement) || !event.target.matches("[data-image-zoom]")) return;
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  openImageLightbox(event.target);
});

function scheduleRender() {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => {
    renderScheduled = false;
    const message = messages[messages.length - 1];
    const messageRow = messageList.lastElementChild;
    const bubble = messageRow?.querySelector(".bubble");
    if (!message || !bubble) return;
    bubble.innerHTML = renderMarkdown(message);
    const reasoningContent = messageRow.querySelector(".reasoning-content");
    if (reasoningContent) {
      reasoningContent.textContent = message.reasoning || "";
      const reasoningState = messageRow.querySelector(".reasoning-state");
      if (reasoningState) reasoningState.textContent = message.reasoningState === "complete" ? "已完成" : "正在思考";
    }
    const reasoningPanel = messageRow.querySelector(".reasoning-panel");
    if (reasoningPanel && message.reasoningState === "complete" && !message.reasoning) {
      reasoningPanel.hidden = true;
    }
    const conversation = document.querySelector("#conversation");
    conversation.scrollTop = conversation.scrollHeight;
  });
}

function renderFiles() {
  selectedPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
  selectedPreviewUrls = [];
  fileList.replaceChildren();
  selectedFiles.forEach((file, index) => {
    const chip = document.createElement("div");
    chip.className = "file-chip";
    if (isImageFile(file)) {
      chip.classList.add("file-chip-with-image");
      const preview = document.createElement("img");
      preview.className = "file-chip-preview";
      preview.alt = "图片预览：" + file.name;
      preview.src = URL.createObjectURL(file);
      selectedPreviewUrls.push(preview.src);
      chip.append(preview);
    }
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

function isImageFile(file) {
  return /^image\/(?:jpeg|png|webp)$/i.test(file.type) || /\.(?:jpe?g|png|webp)$/i.test(file.name);
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
  if (response.status === 401) {
    await initializeAuthentication();
    throw new Error("登录已过期，请重新登录。");
  }
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
    open.setAttribute("aria-label", conversation.title || "打开对话");
    const title = document.createElement("span");
    title.className = "conversation-title";
    title.textContent = conversation.title;
    open.append(title);
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

async function loadPublishedWorkflows() {
  try {
    const response = await fetch("/api/workflows", { cache: "no-store" });
    if (!response.ok) return;
    const workflows = await response.json();
    workflowSelect.replaceChildren(new Option("普通对话", ""));
    workflows.forEach((workflow) => workflowSelect.add(new Option(workflow.name, workflow.id)));
    workflowSelect.hidden = workflows.length === 0;
  } catch {
    workflowSelect.hidden = true;
  }
}

async function openConversation(id) {
  const response = await fetch(`/api/conversations/${encodeURIComponent(id)}`);
  if (response.status === 401) {
    await initializeAuthentication();
    throw new Error("登录已过期，请重新登录。");
  }
  if (response.status === 403 || response.status === 404) {
    await loadConversations();
    throw new Error("无法打开这条对话，它可能已被删除或不属于当前账号。");
  }
  if (!response.ok) throw new Error("无法打开这条对话，它可能已被删除。");
  const conversation = await response.json();
  showChatPage();
  conversationId = conversation.id;
  localStorage.setItem(ACTIVE_CONVERSATION_KEY, conversationId);
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
  localStorage.removeItem(ACTIVE_CONVERSATION_KEY);
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
  accountMenu.hidden = true;
  accountMenuTrigger.setAttribute("aria-expanded", "false");
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
      } else if (eventName === "media_aliases" && data.aliases && typeof data.aliases === "object") {
        assistantMessage.mediaAliases = data.aliases;
        scheduleRender();
      } else if (eventName === "replace" && typeof data.content === "string") {
        assistantMessage.content = data.content;
        scheduleRender();
      } else if (eventName === "phase") {
        if (data.phase === "answering") assistantMessage.reasoningState = "complete";
        streamStatus.textContent = data.phase === "thinking" ? "正在深度思考…" : "思考完成，正在组织回答…";
        scheduleRender();
      } else if (eventName === "reasoning" && typeof data.content === "string") {
        assistantMessage.reasoning = (assistantMessage.reasoning || "") + data.content;
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
  const selectedWorkflowId = workflowSelect.value;
  if (!question && selectedFiles.length === 0) {
    showError("请先输入消息或添加附件。");
    input.focus();
    return;
  }
  if (selectedWorkflowId && selectedFiles.length > 0) {
    showError("工作流暂不接收聊天附件，请移除附件后运行。");
    return;
  }
  document.querySelector(".error-note")?.remove();
  const attachmentNames = selectedFiles.map((file) => file.name);
  const deepThinkingEnabled = thinkingToggle.getAttribute("aria-pressed") === "true";
  messages.push({ role: "user", content: question || "请阅读我上传的资料，并帮我处理。", attachments: attachmentNames });
  const assistantMessage = {
    role: "assistant",
    content: "",
    pending: true,
    reasoning: "",
    reasoningEnabled: deepThinkingEnabled,
    reasoningState: "thinking",
  };
  messages.push(assistantMessage);
  streamStatus.textContent = selectedWorkflowId ? "正在运行工作流…" : deepThinkingEnabled ? "正在深度思考…" : "正在思考…";
  renderMessages();
  input.value = "";
  input.style.height = "auto";
  busy = true;
  sendButton.disabled = true;
  thinkingToggle.disabled = true;
  workflowSelect.disabled = true;
  newChatButton.disabled = true;
  conversationList.querySelectorAll("button").forEach((button) => {
    button.disabled = true;
  });
  const body = new FormData();
  body.append("message", question);
  if (conversationId) body.append("conversation_id", conversationId);
  body.append("use_knowledge", String(document.querySelector("#knowledge-enabled").checked));
  body.append("deep_thinking", String(deepThinkingEnabled));
  const filesToSend = [...selectedFiles];
  filesToSend.forEach((file) => body.append("files", file, file.name));
  selectedFiles = [];
  fileInput.value = "";
  renderFiles();
  try {
    if (selectedWorkflowId) {
      const response = await fetch(`/api/workflows/${encodeURIComponent(selectedWorkflowId)}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: question, conversation_id: conversationId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || "工作流执行失败，请重试。");
      conversationId = payload.conversation_id;
      localStorage.setItem(ACTIVE_CONVERSATION_KEY, conversationId);
      assistantMessage.content = payload.output || "工作流没有返回文本。";
    } else {
      const response = await fetch("/api/chat", { method: "POST", body });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.detail || "请求失败，请重试。");
      }
      conversationId = response.headers.get("x-conversation-id") || conversationId;
      if (conversationId) localStorage.setItem(ACTIVE_CONVERSATION_KEY, conversationId);
      const savedConversation = (await loadConversations()).find((item) => item.id === conversationId);
      activeTitle.textContent = savedConversation?.title || "新对话";
      await readStream(response, assistantMessage);
    }
    delete assistantMessage.pending;
    const updatedConversation = (await loadConversations()).find((item) => item.id === conversationId);
    activeTitle.textContent = updatedConversation?.title || "新对话";
    streamStatus.textContent = selectedWorkflowId ? "工作流已完成。" : "回答已完成。";
  } catch (error) {
    assistantMessage.reasoningState = "complete";
    assistantMessage.content = assistantMessage.content
      ? `${assistantMessage.content}\n\n---\n\n**连接中断：** ${error.message}`
      : `**暂时无法完成回答：** ${error.message}`;
    delete assistantMessage.pending;
    streamStatus.textContent = "回答中断。";
  } finally {
    busy = false;
    sendButton.disabled = false;
    thinkingToggle.disabled = false;
    workflowSelect.disabled = false;
    newChatButton.disabled = false;
    conversationList.querySelectorAll("button").forEach((button) => {
      button.disabled = false;
    });
    renderMessages();
    input.focus();
  }
}

document.querySelector("#attach-button").addEventListener("click", () => fileInput.click());
document.querySelector("#auth-login-mode").addEventListener("click", () => setAuthMode("login"));
document.querySelector("#auth-register-mode").addEventListener("click", () => setAuthMode("register"));
authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (authSubmit.disabled) return;
  authError.hidden = true;
  const username = authUsername.value.trim();
  const password = authPassword.value;
  if (!username || !password) {
    authError.textContent = "请输入账号和密码。";
    authError.hidden = false;
    return;
  }
  const passwordLength = [...password].length;
  if (authMode === "register" && (passwordLength < 8 || passwordLength > 128)) {
    authError.textContent = "密码长度需为 8 到 128 个字符。";
    authError.hidden = false;
    return;
  }
  authSubmit.disabled = true;
  authSubmit.textContent = authMode === "register" ? "正在创建账号…" : "正在登录…";
  try {
    const response = await fetch(`/api/auth/${authMode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail || "无法完成登录，请重试。");
    authPassword.value = "";
    await showAuthenticatedApp(payload.user);
  } catch (error) {
    authError.textContent = error.message;
    authError.hidden = false;
  } finally {
    authSubmit.disabled = false;
    authSubmit.textContent = authMode === "register" ? "注册并登录" : "登录";
  }
});
accountMenuTrigger.addEventListener("click", () => {
  const isOpen = accountMenu.hidden;
  accountMenu.hidden = !isOpen;
  accountMenuTrigger.setAttribute("aria-expanded", String(isOpen));
});
document.addEventListener("click", (event) => {
  if (!event.target.closest("#account-menu-wrap")) {
    accountMenu.hidden = true;
    accountMenuTrigger.setAttribute("aria-expanded", "false");
  }
});
logoutTrigger.addEventListener("click", async () => {
  logoutTrigger.disabled = true;
  try {
    const response = await fetch("/api/auth/logout", { method: "POST", cache: "no-store" });
    if (!response.ok) throw new Error("退出登录失败，请重试。");
    currentUser = null;
    conversationId = null;
    localStorage.removeItem(ACTIVE_CONVERSATION_KEY);
    messages.length = 0;
    selectedFiles = [];
    fileInput.value = "";
    renderFiles();
    input.value = "";
    appShell.hidden = true;
    authOverlay.hidden = false;
    authPassword.value = "";
    authError.hidden = true;
    authUsername.value = "";
    setAuthMode("login");
    accountMenu.hidden = true;
    accountMenuTrigger.setAttribute("aria-expanded", "false");
    authUsername.focus();
  } catch {
    showError("退出登录失败，请检查服务后重试。");
  } finally {
    logoutTrigger.disabled = false;
  }
});
thinkingToggle.addEventListener("click", () => {
  const enabled = thinkingToggle.getAttribute("aria-pressed") !== "true";
  thinkingToggle.setAttribute("aria-pressed", String(enabled));
  thinkingToggle.setAttribute("aria-label", enabled ? "关闭深度思考" : "开启深度思考");
});
fileInput.addEventListener("change", () => {
  const accepted = /\.(pdf|docx|txt|md|jpe?g|png|webp)$/i;
  for (const file of fileInput.files) {
    if (!accepted.test(file.name)) {
      showError("请选择 PDF、DOCX、TXT、Markdown、JPEG、PNG 或 WebP 文件。");
      continue;
    }
    if (file.size > 10 * 1024 * 1024) {
      showError(`${file.name} 超过 10 MB 限制。`);
      continue;
    }
    if (selectedFiles.some((existing) => existing.name === file.name && existing.size === file.size)) continue;
    if (selectedFiles.length >= 5) {
      showError("每次最多添加 5 个附件。");
      break;
    }
    selectedFiles.push(file);
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
    if (!(await confirmConversationDeletion(remove))) return;
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

initializeAuthentication().then(() => {
  if (localStorage.getItem("sidebar-collapsed") === "true" && window.innerWidth > 700) {
    sidebar.classList.add("collapsed");
    sidebarCollapse.setAttribute("aria-expanded", "false");
    sidebarCollapse.setAttribute("aria-label", "展开侧边栏");
    sidebarCollapse.title = "展开侧边栏";
  }
  renderMessages();
}).catch((error) => {
  console.error("Unable to initialize authentication", error);
  startupScreen.hidden = true;
  appShell.hidden = true;
  authOverlay.hidden = false;
  authError.textContent = "登录状态暂时不可用，请刷新页面重试。";
  authError.hidden = false;
});

