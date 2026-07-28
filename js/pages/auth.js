import { _supabase } from '../config.js';

let isLogin = true;

window.toggleForm = function () {
  isLogin = !isLogin;
  const errorEl = document.getElementById('errorMsg');
  if (errorEl) errorEl.style.display = 'none';

  const formTitle = document.getElementById('formTitle');
  const usernameInput = document.getElementById('username');
  const mainBtn = document.getElementById('mainBtn');
  const toggleBtn = document.getElementById('toggleBtn');

  if (formTitle) formTitle.innerText = isLogin ? "Enter the game" : "Racer Registration";
  if (usernameInput) usernameInput.style.display = isLogin ? "none" : "block";
  if (mainBtn) mainBtn.innerText = isLogin ? "Log in" : "Create profile";
  if (toggleBtn) {
    toggleBtn.innerText = isLogin ?
      "No account? Sign up!" : "Already have a profile? Log in.";
  }
};

window.handleAuth = async function () {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value.trim();
  const username = document.getElementById('username').value.trim();

  if (!email || !password || (!isLogin && !username)) {
    showError("Fill in all the fields.");
    return;
  }

  if (isLogin) {
    const { data, error } = await _supabase.auth.signInWithPassword({ email, password });
    if (error) showError(error.message);
    else window.location.href = 'index.html';
  } else {
    const { data, error } = await _supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username: username },
        emailRedirectTo: window.location.origin + '/index.html'
      }
    });

    if (error) {
      showError(error.message);
    } else {
      Swal.fire({
        title: "DONE!",
        text: "Check your email for confirmation, or try logging in.",
        icon: "success",
        background: "#111",
        color: "#fff",
        confirmButtonColor: "#f1c40f"
      });
    }
  }
};

function showError(text) {
  const errorEl = document.getElementById('errorMsg');
  if (errorEl) {
    errorEl.innerText = ">> " + text;
    errorEl.style.display = 'block';
  }
}
