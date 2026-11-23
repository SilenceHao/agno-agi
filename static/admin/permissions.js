(() => {
  const roleList = document.querySelector("#permission-role-list");
  const roleEditor = document.querySelector("#permission-role-editor");
  const roleSummary = document.querySelector("#permission-role-summary");
  const roleEmpty = document.querySelector("#permission-role-empty");
  const userList = document.querySelector("#permission-user-list");
  const userSearch = document.querySelector("#permission-user-search");
  const roleSearch = document.querySelector("#permission-role-search");
  const matrixSearch = document.querySelector("#permission-matrix-search");
  const roleMemberSearch = document.querySelector("#permission-role-member-search");
  const grantRoleSearch = document.querySelector("#permission-grant-role-search");
  const grantFolderSearch = document.querySelector("#permission-folder-grant-search");
  const grantToolSearch = document.querySelector("#permission-tool-grant-search");
  const roleDialog = document.querySelector("#permission-role-dialog");
  const roleCreateForm = document.querySelector("#permission-role-create-form");
  const assignmentDialog = document.querySelector("#permission-assignment-dialog");
  const assignmentSearch = document.querySelector("#permission-assignment-search");
  const toast = document.querySelector("#toast");
  const panelIds = {
    users: "permission-users-panel",
    roles: "permission-roles-panel",
    grants: "permission-grants-panel",
    matrix: "permission-matrix-panel",
  };
  let roles = [];
  let users = [];
  let userSearchTerm = "";
  let roleSearchTerm = "";
  let matrixSearchTerm = "";
  let roleMemberSearchTerm = "";
  let assignmentSearchTerm = "";
  let assignmentUser = null;
  let assignmentRoleIds = new Set();
  let userPage = 1;
  let rolePage = 1;
  let matrixPage = 1;
  let roleMemberPage = 1;
  let grantRolePage = 1;
  let grantRoleSearchTerm = "";
  const grantResourceSearchTerms = { knowledge: "", tools: "" };
  const PAGE_SIZE = 10;
  const ASSIGNMENT_RENDER_LIMIT = 40;
  let resources = { knowledge_folders: [], http_tools: [] };
  let selectedRoleId = null;
  let editingRoleId = null;
  let grantChangesPending = false;
  let grantDraft = null;
  let selectedGrantRoleId = null;
  let permissionDataLoaded = false;
  let permissionLoadSequence = 0;
  let toastTimer = null;

  function showPermissionToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2600);
  }

  async function requestJson(url, options = {}) {
    const response = await fetch(url, { cache: "no-store", ...options });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) {
      window.location.replace("/");
      throw new Error("登录状态已失效。");
    }
    if (!response.ok) throw new Error(payload.detail || "权限配置请求失败。");
    return payload;
  }

  function setPermissionView(view) {
    Object.entries(panelIds).forEach(([key, id]) => {
      document.querySelector(`#${id}`).hidden = key !== view;
    });
  }

  function currentRole() {
    return roles.find((role) => role.id === selectedRoleId) || null;
  }

  function renderPagination(target, page, total, onPage) {
    target.replaceChildren();
    const pageCount = Math.ceil(total / PAGE_SIZE);
    if (pageCount <= 1) return;
    const previous = document.createElement("button");
    previous.type = "button";
    previous.textContent = "上一页";
    previous.disabled = page <= 1;
    previous.addEventListener("click", () => onPage(page - 1));
    const status = document.createElement("span");
    status.textContent = `第 ${page} / ${pageCount} 页 · ${total} 条`;
    const next = document.createElement("button");
    next.type = "button";
    next.textContent = "下一页";
    next.disabled = page >= pageCount;
    next.addEventListener("click", () => onPage(page + 1));
    target.append(previous, status, next);
  }

  function renderAssociationList(target, items, emptyText) {
    target.replaceChildren();
    if (items.length === 0) {
      const empty = document.createElement("span");
      empty.className = "permission-association-empty";
      empty.textContent = emptyText;
      target.append(empty);
      return;
    }
    items.forEach((item) => {
      const chip = document.createElement("span");
      chip.className = "permission-association-chip";
      chip.textContent = item;
      target.append(chip);
    });
  }

  function createRoleCard(role) {
    const card = document.createElement("article");
    card.className = "permission-role-card";
    card.classList.toggle("is-active", role.id === selectedRoleId);
    const select = document.createElement("button");
    select.type = "button";
    select.className = "permission-role-card-select";
    select.setAttribute("aria-pressed", String(role.id === selectedRoleId));
    const title = document.createElement("strong");
    title.textContent = role.name;
    const description = document.createElement("span");
    description.textContent = role.description || (role.is_system ? "普通账号初始角色" : "尚未填写角色说明");
    const count = document.createElement("small");
    count.textContent = `${role.user_count} 位用户 · ${role.knowledge_folder_ids.length} 个目录 · ${role.http_tool_ids.length} 个工具`;
    select.append(title, description, count);
    select.addEventListener("click", () => {
      selectedRoleId = role.id;
      editingRoleId = null;
      roleMemberSearchTerm = "";
      roleMemberSearch.value = "";
      roleMemberPage = 1;
      renderRoles();
    });
    card.append(select);
    if (!role.is_system) {
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "permission-role-card-edit";
      edit.textContent = "编辑";
      edit.setAttribute("aria-label", `编辑角色：${role.name}`);
      edit.addEventListener("click", () => {
        selectedRoleId = role.id;
        editingRoleId = role.id;
        roleMemberSearchTerm = "";
        roleMemberSearch.value = "";
        roleMemberPage = 1;
        renderRoles();
      });
      card.append(edit);
    }
    return card;
  }

  function createResourceCheckbox(resource, checkedIds, name, detail) {
    const label = document.createElement("label");
    label.className = "permission-resource-option";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.name = name;
    checkbox.value = resource.id;
    checkbox.checked = checkedIds.includes(resource.id);
    const copy = document.createElement("span");
    copy.className = "permission-resource-copy";
    const title = document.createElement("strong");
    title.textContent = resource.name;
    const summary = document.createElement("small");
    summary.textContent = detail(resource);
    copy.append(title, summary);
    label.append(checkbox, copy);
    return label;
  }

  function renderRoleResources(role, folderIds = role.knowledge_folder_ids, toolIds = role.http_tool_ids) {
    const folderList = document.querySelector("#permission-folder-grants");
    const toolList = document.querySelector("#permission-tool-grants");
    renderGrantResourceTable(folderList, document.querySelector("#permission-folder-grant-count"), resources.knowledge_folders, folderIds, "knowledge_folder_ids", "knowledge");
    renderGrantResourceTable(toolList, document.querySelector("#permission-tool-grant-count"), resources.http_tools, toolIds, "http_tool_ids", "tools");
  }

  function renderGrantResourceTable(target, countTarget, items, checkedIds, inputName, resourceType) {
    target.replaceChildren();
    const searchTerm = grantResourceSearchTerms[resourceType];
    const filteredItems = items.filter((item) => `${item.name} ${item.description || ""}`.toLocaleLowerCase().includes(searchTerm));
    countTarget.textContent = searchTerm ? `${filteredItems.length} / ${items.length} 项` : `${items.length} 项`;
    if (filteredItems.length === 0) {
      const empty = document.createElement("p");
      empty.className = "permission-resource-empty";
      empty.textContent = items.length === 0
        ? (resourceType === "knowledge" ? "还没有知识库目录。" : "还没有配置 HTTP 工具。")
        : "没有匹配的资源，请调整搜索条件。";
      target.append(empty);
      return;
    }

    const table = document.createElement("table");
    table.className = "permission-grant-resource-table";
    const header = document.createElement("thead");
    const headerRow = document.createElement("tr");
    ["授权", resourceType === "knowledge" ? "目录名称" : "工具名称", resourceType === "knowledge" ? "文件数" : "状态", ...(resourceType === "tools" ? ["说明"] : [])].forEach((label) => {
      const cell = document.createElement("th");
      cell.scope = "col";
      cell.textContent = label;
      headerRow.append(cell);
    });
    header.append(headerRow);
    const body = document.createElement("tbody");
    filteredItems.forEach((resource) => {
      const row = document.createElement("tr");
      const accessCell = document.createElement("td");
      accessCell.className = "permission-grant-resource-access";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.name = inputName;
      checkbox.value = resource.id;
      checkbox.checked = checkedIds.includes(resource.id);
      checkbox.setAttribute("aria-label", `授权${resourceType === "knowledge" ? "知识库目录" : "HTTP 工具"}：${resource.name}`);
      accessCell.append(checkbox);
      const nameCell = document.createElement("th");
      nameCell.scope = "row";
      nameCell.textContent = resource.name;
      row.append(accessCell, nameCell);

      const detailCell = document.createElement("td");
      if (resourceType === "knowledge") {
        detailCell.textContent = `${resource.document_count} 个文件`;
      } else {
        detailCell.textContent = resource.enabled ? "已启用" : "已停用";
        detailCell.className = resource.enabled ? "is-enabled" : "is-disabled";
      }
      row.append(detailCell);
      if (resourceType === "tools") {
        const descriptionCell = document.createElement("td");
        descriptionCell.className = "permission-grant-resource-description";
        descriptionCell.textContent = resource.description || "—";
        row.append(descriptionCell);
      }
      body.append(row);
    });
    table.append(header, body);
    target.append(table);
  }

  function renderRoles() {
    roleList.replaceChildren();
    const filteredRoles = roles.filter((role) => `${role.name} ${role.description}`.toLocaleLowerCase().includes(roleSearchTerm));
    document.querySelector("#permission-role-count").textContent = roleSearchTerm
      ? `${filteredRoles.length} / ${roles.length} 个角色`
      : `${roles.length} 个角色`;
    rolePage = Math.min(rolePage, Math.max(1, Math.ceil(filteredRoles.length / PAGE_SIZE)));
    const visibleRoles = filteredRoles.slice((rolePage - 1) * PAGE_SIZE, rolePage * PAGE_SIZE);
    visibleRoles.forEach((role) => roleList.append(createRoleCard(role)));
    if (filteredRoles.length === 0) {
      const empty = document.createElement("div");
      empty.className = "permission-empty-state";
      empty.textContent = roles.length ? "没有匹配的角色，请调整搜索条件。" : "还没有角色，请先新建角色。";
      roleList.append(empty);
    }
    renderPagination(document.querySelector("#permission-role-pagination"), rolePage, filteredRoles.length, (page) => {
      rolePage = page;
      renderRoles();
    });
    const role = currentRole();
    roleEditor.hidden = !role || editingRoleId !== role.id;
    roleSummary.hidden = !role;
    roleEmpty.hidden = Boolean(role);
    document.querySelector("#permission-role-insights").hidden = !role;
    if (!role) return;
    document.querySelector("#permission-role-detail-name").textContent = role.name;
    document.querySelector("#permission-role-detail-description").textContent = role.description || (role.is_system ? "普通账号初始角色" : "尚未填写角色说明");
    document.querySelector("#permission-role-user-count").textContent = `${role.user_count} 位用户使用此角色`;
    document.querySelector("#permission-role-delete").hidden = Boolean(role.is_system);
    if (!roleEditor.hidden) {
      roleEditor.elements.id.value = role.id;
      roleEditor.elements.name.value = role.name;
      roleEditor.elements.description.value = role.description || "";
      roleEditor.elements.name.disabled = false;
      roleEditor.elements.description.disabled = false;
    }
    renderRoleInsights(role);
  }

  function renderRoleInsights(role) {
    const folderNames = role.knowledge_folder_ids.map((id) => resources.knowledge_folders.find((item) => item.id === id)?.name || "已删除目录");
    const toolNames = role.http_tool_ids.map((id) => resources.http_tools.find((item) => item.id === id)?.name || "已删除工具");
    document.querySelector("#permission-role-permission-count").textContent = `${folderNames.length} 个目录 · ${toolNames.length} 个工具`;
    const permissionSummary = document.querySelector("#permission-role-permissions");
    permissionSummary.replaceChildren();
    [
      ["知识库目录", folderNames.length, "permission-metric-knowledge"],
      ["HTTP 工具", toolNames.length, "permission-metric-tools"],
    ].forEach(([label, count, className]) => {
      const metric = document.createElement("div");
      metric.className = `permission-role-metric ${className}`;
      const value = document.createElement("strong");
      value.textContent = String(count);
      const title = document.createElement("span");
      title.textContent = label;
      metric.append(value, title);
      permissionSummary.append(metric);
    });
    if (folderNames.length + toolNames.length === 0) {
      const empty = document.createElement("span");
      empty.className = "permission-association-empty";
      empty.textContent = "尚未授权资源";
      permissionSummary.append(empty);
    }
    const roleMembers = users.filter((user) => user.roles.some((item) => item.id === role.id));
    const filteredMembers = roleMembers.filter((user) => user.username.toLocaleLowerCase().includes(roleMemberSearchTerm));
    document.querySelector("#permission-role-member-count").textContent = roleMemberSearchTerm
      ? `${filteredMembers.length} / ${roleMembers.length} 位用户`
      : `${roleMembers.length} 位用户`;
    const memberDetails = document.querySelector(".permission-member-details");
    if (!roleMemberSearchTerm && filteredMembers.length === 0) memberDetails.open = false;
    roleMemberPage = Math.min(roleMemberPage, Math.max(1, Math.ceil(filteredMembers.length / PAGE_SIZE)));
    const memberNames = filteredMembers.slice((roleMemberPage - 1) * PAGE_SIZE, roleMemberPage * PAGE_SIZE).map((user) => user.username);
    renderAssociationList(document.querySelector("#permission-role-members"), memberNames, "暂无用户分配此角色");
    renderPagination(document.querySelector("#permission-role-member-pagination"), roleMemberPage, filteredMembers.length, (page) => {
      roleMemberPage = page;
      renderRoleInsights(role);
    });
  }

  function renderAssignmentRoles() {
    const list = document.querySelector("#permission-assignment-list");
    list.replaceChildren();
    const filteredRoles = roles.filter((role) => `${role.name} ${role.description}`.toLocaleLowerCase().includes(assignmentSearchTerm));
    const visibleRoles = filteredRoles.slice(0, ASSIGNMENT_RENDER_LIMIT);
    visibleRoles.forEach((role) => {
      const option = createResourceCheckbox(role, [...assignmentRoleIds], "assignment_role_ids", (item) => item.description || "未填写角色说明");
      const checkbox = option.querySelector("input");
      checkbox.checked = assignmentRoleIds.has(role.id);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) assignmentRoleIds.add(role.id);
        else assignmentRoleIds.delete(role.id);
        updateAssignmentCount(filteredRoles.length);
      });
      list.append(option);
    });
    if (filteredRoles.length === 0) {
      const empty = document.createElement("p");
      empty.className = "permission-resource-empty";
      empty.textContent = "没有匹配的角色，请调整搜索条件。";
      list.append(empty);
    }
    updateAssignmentCount(filteredRoles.length);
  }

  function updateAssignmentCount(filteredRoleCount) {
    const visibleCount = Math.min(filteredRoleCount, ASSIGNMENT_RENDER_LIMIT);
    const limitedHint = filteredRoleCount > ASSIGNMENT_RENDER_LIMIT ? ` · 当前显示前 ${ASSIGNMENT_RENDER_LIMIT} 个，请继续搜索缩小范围` : "";
    document.querySelector("#permission-assignment-count").textContent = `已选择 ${assignmentRoleIds.size} 个角色 · 匹配 ${filteredRoleCount} 个${limitedHint}`;
  }

  function openAssignmentDialog(user) {
    assignmentUser = user;
    assignmentRoleIds = new Set(user.roles.map((role) => role.id));
    assignmentSearchTerm = "";
    assignmentSearch.value = "";
    document.querySelector("#permission-assignment-title").textContent = `为 ${user.username} 分配角色`;
    document.querySelector("#permission-assignment-description").textContent = "勾选该用户需要的角色；多个角色的资源权限会合并生效。";
    renderAssignmentRoles();
    assignmentDialog.showModal();
    assignmentSearch.focus();
  }

  function renderUsers() {
    userList.replaceChildren();
    document.querySelector("#permission-user-pagination").replaceChildren();
    const filteredUsers = users.filter((user) => {
      const searchableText = [user.username, user.is_super_admin ? "超级管理员" : "普通账号", ...user.roles.map((role) => role.name)]
        .join(" ")
        .toLocaleLowerCase();
      return searchableText.includes(userSearchTerm);
    });
    document.querySelector("#permission-user-count").textContent = userSearchTerm
      ? `${filteredUsers.length} / ${users.length} 个账号`
      : `${users.length} 个账号`;
    if (users.length === 0) {
      const empty = document.createElement("div");
      empty.className = "permission-empty-state";
      empty.textContent = "还没有注册用户。";
      userList.append(empty);
      return;
    }
    if (filteredUsers.length === 0) {
      const empty = document.createElement("div");
      empty.className = "permission-empty-state";
      empty.textContent = "没有匹配的账号，请调整搜索条件。";
      userList.append(empty);
      return;
    }
    userPage = Math.min(userPage, Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE)));
    const visibleUsers = filteredUsers.slice((userPage - 1) * PAGE_SIZE, userPage * PAGE_SIZE);
    visibleUsers.forEach((user) => {
      const row = document.createElement("article");
      row.className = "permission-user-row";
      const identity = document.createElement("div");
      identity.className = "permission-user-identity";
      const avatar = document.createElement("span");
      avatar.className = "permission-user-avatar";
      avatar.textContent = user.username.slice(0, 1).toUpperCase();
      const name = document.createElement("div");
      const username = document.createElement("strong");
      username.textContent = user.username;
      const label = document.createElement("small");
      label.textContent = user.is_super_admin ? "超级管理员 · 全部资源" : "普通账号";
      name.append(username, label);
      identity.append(avatar, name);
      row.append(identity);
      const rolesSummary = document.createElement("div");
      rolesSummary.className = "permission-user-roles-summary";
      if (user.is_super_admin) {
        const badge = document.createElement("span");
        badge.className = "permission-super-admin-badge";
        badge.textContent = "所有知识库目录与工具";
        rolesSummary.append(badge);
      } else {
        const assignedRoles = user.roles;
        if (assignedRoles.length === 0) {
          const noRole = document.createElement("span");
          noRole.className = "permission-no-roles";
          noRole.textContent = "未分配角色 · 无资源访问权";
          rolesSummary.append(noRole);
        } else {
          assignedRoles.slice(0, 3).forEach((role) => {
            const chip = document.createElement("span");
            chip.className = "permission-association-chip";
            chip.textContent = role.name;
            rolesSummary.append(chip);
          });
          if (assignedRoles.length > 3) {
            const more = document.createElement("span");
            more.className = "permission-association-more";
            more.textContent = `+${assignedRoles.length - 3}`;
            rolesSummary.append(more);
          }
        }
      }
      row.append(rolesSummary);
      if (!user.is_super_admin) {
        const manage = document.createElement("button");
        manage.type = "button";
        manage.className = "btn permission-user-save";
        manage.textContent = "管理角色";
        manage.addEventListener("click", () => openAssignmentDialog(user));
        row.append(manage);
      }
      userList.append(row);
    });
    renderPagination(document.querySelector("#permission-user-pagination"), userPage, filteredUsers.length, (page) => {
      userPage = page;
      renderUsers();
    });
  }

  function renderMatrix() {
    const target = document.querySelector("#permission-matrix");
    target.replaceChildren();
    const memberNamesByRole = new Map(roles.map((role) => [role.id, []]));
    users.forEach((user) => user.roles.forEach((role) => memberNamesByRole.get(role.id)?.push(user.username)));
    const folderNamesById = new Map(resources.knowledge_folders.map((folder) => [folder.id, folder.name]));
    const toolNamesById = new Map(resources.http_tools.map((tool) => [tool.id, tool.name]));
    const searchableRoleText = (role) => {
      const members = memberNamesByRole.get(role.id) || [];
      const folders = role.knowledge_folder_ids.map((id) => folderNamesById.get(id) || "已删除目录");
      const tools = role.http_tool_ids.map((id) => toolNamesById.get(id) || "已删除工具");
      return [role.name, role.description, ...members, ...folders, ...tools].join(" ").toLocaleLowerCase();
    };
    const filteredRoles = roles.filter((role) => searchableRoleText(role).includes(matrixSearchTerm));
    document.querySelector("#permission-matrix-count").textContent = matrixSearchTerm
      ? `${filteredRoles.length} / ${roles.length} 个角色`
      : `${roles.length} 个角色`;
    if (roles.length === 0) {
      const empty = document.createElement("div");
      empty.className = "permission-empty-state";
      empty.textContent = "还没有配置业务角色。";
      target.append(empty);
      document.querySelector("#permission-matrix-pagination").replaceChildren();
      return;
    }
    if (filteredRoles.length === 0) {
      const empty = document.createElement("div");
      empty.className = "permission-empty-state";
      empty.textContent = "没有匹配的角色或资源，请调整搜索条件。";
      target.append(empty);
      document.querySelector("#permission-matrix-pagination").replaceChildren();
      return;
    }
    matrixPage = Math.min(matrixPage, Math.max(1, Math.ceil(filteredRoles.length / PAGE_SIZE)));
    const visibleRoles = filteredRoles.slice((matrixPage - 1) * PAGE_SIZE, matrixPage * PAGE_SIZE);
    const table = document.createElement("table");
    const head = document.createElement("thead");
    const headerRow = document.createElement("tr");
    ["角色", "成员", "知识库目录", "HTTP 工具"].forEach((text) => {
      const cell = document.createElement("th");
      cell.textContent = text;
      headerRow.append(cell);
    });
    head.append(headerRow);
    const body = document.createElement("tbody");
    visibleRoles.forEach((role) => {
      const row = document.createElement("tr");
      const name = document.createElement("td");
      const openRole = document.createElement("button");
      openRole.type = "button";
      openRole.className = "permission-matrix-role-link";
      openRole.textContent = role.name;
      openRole.addEventListener("click", () => {
        selectedRoleId = role.id;
        editingRoleId = null;
        roleSearchTerm = "";
        roleSearch.value = "";
        rolePage = Math.floor(roles.findIndex((item) => item.id === role.id) / PAGE_SIZE) + 1;
        document.querySelector('[data-view="roles"]').click();
      });
      name.append(openRole);
      const userCount = document.createElement("td");
      userCount.textContent = `共 ${role.user_count} 位`;
      const folderCell = document.createElement("td");
      const toolCell = document.createElement("td");
      const memberNames = memberNamesByRole.get(role.id) || [];
      const folderNames = role.knowledge_folder_ids.map((id) => folderNamesById.get(id) || "已删除目录");
      const toolNames = role.http_tool_ids.map((id) => toolNamesById.get(id) || "已删除工具");
      const memberPreview = document.createElement("div");
      memberPreview.className = "permission-matrix-associations";
      appendCompactAssociations(memberPreview, memberNames, "暂无成员");
      userCount.append(memberPreview);
      appendCompactAssociations(folderCell, folderNames, "无授权");
      appendCompactAssociations(toolCell, toolNames, "无授权");
      row.append(name, userCount, folderCell, toolCell);
      body.append(row);
    });
    table.append(head, body);
    const wrapper = document.createElement("div");
    wrapper.className = "table-scroll permission-table-scroll";
    wrapper.append(table);
    target.append(wrapper);
    renderPagination(document.querySelector("#permission-matrix-pagination"), matrixPage, filteredRoles.length, (page) => {
      matrixPage = page;
      renderMatrix();
    });
  }

  function appendCompactAssociations(target, labels, emptyText) {
    target.replaceChildren();
    if (labels.length === 0) {
      target.textContent = emptyText;
      return;
    }
    const visible = labels.slice(0, 3);
    visible.forEach((label) => {
      const chip = document.createElement("span");
      chip.className = "permission-association-chip permission-matrix-chip";
      chip.textContent = label;
      target.append(chip);
    });
    if (labels.length > visible.length) {
      const more = document.createElement("span");
      more.className = "permission-association-more";
      more.textContent = `+${labels.length - visible.length}`;
      more.title = labels.slice(visible.length).join("、");
      target.append(more);
    }
  }

  function renderGrantEditor() {
    const roleListTarget = document.querySelector("#permission-grant-role-list");
    roleListTarget.replaceChildren();
    const filteredRoles = roles.filter((role) => `${role.name} ${role.description}`.toLocaleLowerCase().includes(grantRoleSearchTerm));
    document.querySelector("#permission-grant-role-count").textContent = grantRoleSearchTerm
      ? `${filteredRoles.length} / ${roles.length} 个角色`
      : `${roles.length} 个角色`;
    grantRolePage = Math.min(grantRolePage, Math.max(1, Math.ceil(filteredRoles.length / PAGE_SIZE)));
    const visibleRoles = filteredRoles.slice((grantRolePage - 1) * PAGE_SIZE, grantRolePage * PAGE_SIZE);
    visibleRoles.forEach((role) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "permission-grant-role-card";
      button.classList.toggle("is-active", role.id === selectedGrantRoleId);
      button.disabled = grantChangesPending;
      button.setAttribute("aria-pressed", String(role.id === selectedGrantRoleId));
      const name = document.createElement("strong");
      name.textContent = role.name;
      const detail = document.createElement("span");
      detail.textContent = `${role.user_count} 位用户 · ${role.knowledge_folder_ids.length} 个目录 · ${role.http_tool_ids.length} 个工具`;
      button.append(name, detail);
      button.addEventListener("click", () => {
        if (grantChangesPending) return;
        selectedGrantRoleId = role.id;
        document.querySelector("#permission-grant-save-status").textContent = "";
        renderGrantEditor();
      });
      roleListTarget.append(button);
    });
    if (filteredRoles.length === 0) {
      const empty = document.createElement("div");
      empty.className = "permission-empty-state";
      empty.textContent = roles.length ? "没有匹配的角色，请调整搜索条件。" : "还没有角色，请先创建角色。";
      roleListTarget.append(empty);
    }
    renderPagination(document.querySelector("#permission-grant-role-pagination"), grantRolePage, filteredRoles.length, (page) => {
      grantRolePage = page;
      renderGrantEditor();
    });

    const selectedRole = roles.find((role) => role.id === selectedGrantRoleId) || null;
    const saveButton = document.querySelector("#permission-grant-save");
    const resourceGrid = document.querySelector("#permission-grant-grid");
    resourceGrid.hidden = !selectedRole;
    saveButton.disabled = !selectedRole || !grantChangesPending;
    document.querySelector("#permission-grant-reset").hidden = !grantChangesPending;
    if (!selectedRole) {
      document.querySelector("#permission-grant-role-summary").textContent = "选择左侧角色以查看和配置资源授权。";
      document.querySelector("#permission-folder-grants").replaceChildren();
      document.querySelector("#permission-tool-grants").replaceChildren();
      return;
    }
    document.querySelector("#permission-grant-role-summary").replaceChildren();
    const selectedName = document.createElement("strong");
    selectedName.textContent = selectedRole.name;
    const selectedDetail = document.createElement("span");
    selectedDetail.textContent = `${selectedRole.user_count} 位用户 · ${selectedRole.knowledge_folder_ids.length} 个目录 · ${selectedRole.http_tool_ids.length} 个工具`;
    document.querySelector("#permission-grant-role-summary").append(selectedName, selectedDetail);
    const folderIds = grantChangesPending && grantDraft?.roleId === selectedRole.id
      ? [...grantDraft.folderIds]
      : selectedRole.knowledge_folder_ids;
    const toolIds = grantChangesPending && grantDraft?.roleId === selectedRole.id
      ? [...grantDraft.toolIds]
      : selectedRole.http_tool_ids;
    renderRoleResources(selectedRole, folderIds, toolIds);
    resourceGrid.querySelectorAll('.permission-resource-list input[type="checkbox"]').forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        const draftFolderIds = new Set(grantDraft?.roleId === selectedRole.id ? grantDraft.folderIds : selectedRole.knowledge_folder_ids);
        const draftToolIds = new Set(grantDraft?.roleId === selectedRole.id ? grantDraft.toolIds : selectedRole.http_tool_ids);
        const updatedIds = checkbox.name === "knowledge_folder_ids" ? draftFolderIds : draftToolIds;
        if (checkbox.checked) updatedIds.add(checkbox.value);
        else updatedIds.delete(checkbox.value);
        grantChangesPending = true;
        grantDraft = {
          roleId: selectedRole.id,
          folderIds: draftFolderIds,
          toolIds: draftToolIds,
        };
        roleListTarget.querySelectorAll("button").forEach((button) => { button.disabled = true; });
        saveButton.disabled = false;
        document.querySelector("#permission-grant-reset").hidden = false;
        document.querySelector("#permission-grant-save-status").textContent = "有未保存的授权更改。保存后才会生效。";
      });
    });
  }

  async function loadPermissionData() {
    const sequence = ++permissionLoadSequence;
    const selectedAgentId = window.getSelectedAgentId?.() || "";
    const resourceRequest = selectedAgentId
      ? requestJson(`/api/admin/resources?agent_id=${encodeURIComponent(selectedAgentId)}`)
      : Promise.resolve({ knowledge_folders: [], http_tools: [] });
    const [loadedUsers, loadedRoles, loadedResources] = await Promise.all([
      requestJson("/api/admin/users"),
      requestJson("/api/admin/roles"),
      resourceRequest,
    ]);
    if (sequence !== permissionLoadSequence) return;
    users = loadedUsers;
    roles = loadedRoles;
    resources = loadedResources;
    if (!roles.some((role) => role.id === selectedRoleId)) selectedRoleId = roles[0]?.id || null;
    if (!roles.some((role) => role.id === selectedGrantRoleId)) selectedGrantRoleId = roles[0]?.id || null;
    permissionDataLoaded = true;
    renderRoles();
    renderUsers();
    renderMatrix();
    renderGrantEditor();
  }

  window.loadPermissionView = async (view = "users") => {
    setPermissionView(view);
    try {
      if (!permissionDataLoaded) await loadPermissionData();
      else {
        renderRoles();
        renderUsers();
        renderMatrix();
        renderGrantEditor();
      }
    } catch (error) {
      showPermissionToast(error.message);
    }
  };

  window.reloadPermissionData = () => {
    permissionDataLoaded = false;
    return window.loadPermissionView?.(window.currentAdminRoute || "users");
  };

  userSearch.addEventListener("input", () => {
    userSearchTerm = userSearch.value.trim().toLocaleLowerCase();
    userPage = 1;
    renderUsers();
  });

  roleSearch.addEventListener("input", () => {
    roleSearchTerm = roleSearch.value.trim().toLocaleLowerCase();
    rolePage = 1;
    renderRoles();
  });

  matrixSearch.addEventListener("input", () => {
    matrixSearchTerm = matrixSearch.value.trim().toLocaleLowerCase();
    matrixPage = 1;
    renderMatrix();
  });

  roleMemberSearch.addEventListener("input", () => {
    roleMemberSearchTerm = roleMemberSearch.value.trim().toLocaleLowerCase();
    roleMemberPage = 1;
    const role = currentRole();
    if (role) renderRoleInsights(role);
  });

  assignmentSearch.addEventListener("input", () => {
    assignmentSearchTerm = assignmentSearch.value.trim().toLocaleLowerCase();
    renderAssignmentRoles();
  });

  grantRoleSearch.addEventListener("input", () => {
    grantRoleSearchTerm = grantRoleSearch.value.trim().toLocaleLowerCase();
    grantRolePage = 1;
    renderGrantEditor();
  });

  grantFolderSearch.addEventListener("input", () => {
    grantResourceSearchTerms.knowledge = grantFolderSearch.value.trim().toLocaleLowerCase();
    renderGrantEditor();
  });

  grantToolSearch.addEventListener("input", () => {
    grantResourceSearchTerms.tools = grantToolSearch.value.trim().toLocaleLowerCase();
    renderGrantEditor();
  });

  document.querySelector("#permission-assignment-close").addEventListener("click", () => assignmentDialog.close());
  document.querySelector("#permission-assignment-cancel").addEventListener("click", () => assignmentDialog.close());
  document.querySelector("#permission-assignment-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!assignmentUser) return;
    const saveButton = document.querySelector("#permission-assignment-save");
    saveButton.disabled = true;
    try {
      await requestJson(`/api/admin/users/${encodeURIComponent(assignmentUser.id)}/roles`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role_ids: [...assignmentRoleIds] }),
      });
      const username = assignmentUser.username;
      assignmentDialog.close();
      await loadPermissionData();
      showPermissionToast(`已更新 ${username} 的角色分配。`);
    } catch (error) {
      showPermissionToast(error.message);
    } finally {
      saveButton.disabled = false;
    }
  });

  document.querySelector("#permission-open-role-grants").addEventListener("click", () => {
    const role = currentRole();
    if (!role) return;
    if (grantChangesPending && grantDraft?.roleId !== role.id) {
      showPermissionToast("请先保存或放弃当前角色的未保存更改，再切换授权角色。");
      return;
    }
    selectedGrantRoleId = role.id;
    grantRoleSearch.value = "";
    grantRoleSearchTerm = "";
    const roleIndex = roles.findIndex((item) => item.id === role.id);
    grantRolePage = Math.floor(Math.max(0, roleIndex) / PAGE_SIZE) + 1;
    document.querySelector('[data-view="grants"]').click();
  });

  document.querySelector("#permission-grant-reset").addEventListener("click", () => {
    grantChangesPending = false;
    grantDraft = null;
    document.querySelector("#permission-grant-save-status").textContent = "更改已放弃。";
    renderGrantEditor();
  });

  document.querySelector("#permission-grant-save").addEventListener("click", async (event) => {
    const saveButton = event.currentTarget;
    const role = roles.find((item) => item.id === selectedGrantRoleId);
    if (!role) return;
    saveButton.disabled = true;
    document.querySelector("#permission-grant-save-status").textContent = "正在保存…";
    try {
      const knowledgeFolderIds = grantDraft?.roleId === role.id
        ? [...grantDraft.folderIds]
        : [...document.querySelectorAll('#permission-folder-grants input:checked')].map((item) => item.value);
      const httpToolIds = grantDraft?.roleId === role.id
        ? [...grantDraft.toolIds]
        : [...document.querySelectorAll('#permission-tool-grants input:checked')].map((item) => item.value);
      await requestJson(`/api/admin/roles/${encodeURIComponent(role.id)}/grants`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ knowledge_folder_ids: knowledgeFolderIds, http_tool_ids: httpToolIds }),
      });
      grantChangesPending = false;
      grantDraft = null;
      permissionDataLoaded = false;
      await loadPermissionData();
      document.querySelector("#permission-grant-save-status").textContent = "授权已保存并生效。";
      showPermissionToast(`已更新“${role.name}”的资源授权。`);
    } catch (error) {
      document.querySelector("#permission-grant-save-status").textContent = error.message;
      showPermissionToast(error.message);
    } finally {
      saveButton.disabled = !selectedGrantRoleId || !grantChangesPending;
    }
  });

  document.querySelector("#permission-role-create").addEventListener("click", () => {
    roleCreateForm.reset();
    roleDialog.showModal();
    roleCreateForm.elements.name.focus();
  });
  document.querySelector("#permission-role-dialog-close").addEventListener("click", () => roleDialog.close());
  document.querySelector("#permission-role-dialog-cancel").addEventListener("click", () => roleDialog.close());
  roleCreateForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = roleCreateForm.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      const payload = Object.fromEntries(new FormData(roleCreateForm));
      const created = await requestJson("/api/admin/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      roleDialog.close();
      selectedRoleId = created.id;
      editingRoleId = null;
      roleSearchTerm = "";
      roleSearch.value = "";
      rolePage = 1;
      permissionDataLoaded = false;
      await loadPermissionData();
      showPermissionToast(`已创建角色“${created.name}”。`);
    } catch (error) {
      showPermissionToast(error.message);
    } finally {
      submit.disabled = false;
    }
  });

  roleEditor.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = roleEditor.querySelector('[type="submit"]');
    submit.disabled = true;
    const roleId = roleEditor.elements.id.value;
    try {
      const name = roleEditor.elements.name.value.trim();
      const description = roleEditor.elements.description.value.trim();
      await requestJson(`/api/admin/roles/${encodeURIComponent(roleId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      editingRoleId = null;
      permissionDataLoaded = false;
      await loadPermissionData();
      showPermissionToast(`已保存“${name}”角色信息。`);
    } catch (error) {
      showPermissionToast(error.message);
    } finally {
      submit.disabled = false;
    }
  });

  document.querySelector("#permission-role-edit-cancel").addEventListener("click", () => {
    editingRoleId = null;
    renderRoles();
  });

  document.querySelector("#permission-role-delete").addEventListener("click", async () => {
    const role = currentRole();
    if (!role || role.is_system) return;
    if (!window.confirm(`删除角色“${role.name}”后，其用户将失去该角色对应的资源权限。确定继续吗？`)) return;
    try {
      await requestJson(`/api/admin/roles/${encodeURIComponent(role.id)}`, { method: "DELETE" });
      selectedRoleId = null;
      editingRoleId = null;
      permissionDataLoaded = false;
      await loadPermissionData();
      showPermissionToast(`已删除角色“${role.name}”。`);
    } catch (error) {
      showPermissionToast(error.message);
    }
  });
})();
