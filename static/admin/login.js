const loginForm = document.querySelector("#admin-login-form");
const loginButton = loginForm.querySelector("button");
const loginError = document.querySelector("#login-error");

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (loginButton.disabled) return;
  loginError.hidden = true;
  loginButton.disabled = true;
  loginButton.textContent = "正在登录…";
  try {
    const response = await fetch(loginForm.action, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: loginForm.elements.username.value.trim(),
        password: loginForm.elements.password.value,
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail || "登录失败，请重试。");
    if (!payload.user?.is_super_admin) throw new Error("请使用超级管理员账号登录。");
    window.location.replace("/admin");
  } catch (error) {
    loginError.textContent = error instanceof TypeError ? "连接失败，请稍后重试。" : error.message;
    loginError.hidden = false;
    loginButton.disabled = false;
    loginButton.textContent = "登录工作台";
  }
});
