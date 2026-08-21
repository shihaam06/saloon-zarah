/* =====================================================
   OWNER ACCESS LOCK (ownerLock.js)
   Prompts for Owner Password EVERY TIME Analytics or Settings is accessed
===================================================== */

(function () {
  // Inject CSS styles for Owner Lock Modal
  const style = document.createElement("style");
  style.textContent = `
    .owner-lock-modal {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.8);
        backdrop-filter: blur(8px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 99999;
        font-family: 'Inter', system-ui, -apple-system, sans-serif;
    }
    .owner-lock-box {
        background: #111827;
        color: #f9fafb;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 20px;
        width: 400px;
        max-width: 90%;
        padding: 30px;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    }
    .owner-lock-header {
        text-align: center;
        margin-bottom: 20px;
    }
    .owner-lock-icon {
        font-size: 36px;
        margin-bottom: 8px;
    }
    .owner-lock-header h2 {
        font-size: 20px;
        font-weight: 800;
        letter-spacing: -0.5px;
        color: #ffffff;
        margin-top: 6px;
    }
    .owner-lock-header p {
        font-size: 13px;
        color: #9ca3af;
        margin-top: 6px;
    }
    .owner-lock-body {
        margin-bottom: 20px;
    }
    .owner-lock-body label {
        display: block;
        font-size: 12px;
        font-weight: 600;
        color: #d1d5db;
        margin-bottom: 6px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }
    .owner-lock-body input {
        width: 100%;
        padding: 12px 14px;
        border-radius: 10px;
        border: 1px solid #374151;
        background: #1f2937;
        color: #ffffff;
        font-size: 15px;
        outline: none;
        box-sizing: border-box;
        transition: border-color 0.2s ease;
    }
    .owner-lock-body input:focus {
        border-color: #ef8274;
        box-shadow: 0 0 0 3px rgba(239, 130, 116, 0.2);
    }
    .owner-lock-error {
        color: #f87171;
        font-size: 13px;
        margin-top: 10px;
        display: none;
        font-weight: 500;
    }
    .owner-lock-footer {
        display: flex;
        gap: 10px;
    }
    .owner-lock-btn {
        flex: 1;
        padding: 12px;
        border: none;
        border-radius: 10px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
    }
    .owner-lock-btn.cancel {
        background: #374151;
        color: #d1d5db;
    }
    .owner-lock-btn.cancel:hover {
        background: #4b5563;
    }
    .owner-lock-btn.unlock {
        background: #ef8274;
        color: #ffffff;
    }
    .owner-lock-btn.unlock:hover {
        background: #e06b5b;
    }
  `;
  document.head.appendChild(style);

  let pendingTargetUrl = null;

  function initModal() {
    if (document.getElementById("ownerLockModal")) return;

    const modalDiv = document.createElement("div");
    modalDiv.id = "ownerLockModal";
    modalDiv.className = "owner-lock-modal";
    modalDiv.style.display = "none";
    modalDiv.innerHTML = `
      <div class="owner-lock-box">
        <div class="owner-lock-header">
          <div class="owner-lock-icon">🔒</div>
          <h2>OWNER ACCESS</h2>
          <p>This section is restricted. Please enter the owner password.</p>
        </div>
        <div class="owner-lock-body">
          <label for="ownerLockPassword">Owner Password</label>
          <input type="password" id="ownerLockPassword" placeholder="••••••••" autocomplete="current-password">
          <div id="ownerLockError" class="owner-lock-error">Incorrect owner password.</div>
        </div>
        <div class="owner-lock-footer">
          <button type="button" class="owner-lock-btn cancel" id="ownerLockCancelBtn">Cancel</button>
          <button type="button" class="owner-lock-btn unlock" id="ownerLockUnlockBtn">Unlock</button>
        </div>
      </div>
    `;
    document.body.appendChild(modalDiv);

    // Event Listeners for Modal
    document.getElementById("ownerLockUnlockBtn")?.addEventListener("click", verifyAndUnlock);
    document.getElementById("ownerLockPassword")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        verifyAndUnlock();
      }
    });

    document.getElementById("ownerLockCancelBtn")?.addEventListener("click", () => {
      hideLockModal();
      const currentFile = window.location.pathname.split("/").pop();
      if (currentFile === "analytics.html" || currentFile === "settings.html") {
        window.location.href = "dashboard.html";
      }
    });
  }

  function showLockModal(targetUrl) {
    initModal();
    pendingTargetUrl = targetUrl || null;
    const modal = document.getElementById("ownerLockModal");
    const pwdInput = document.getElementById("ownerLockPassword");
    const errDiv = document.getElementById("ownerLockError");

    if (pwdInput) pwdInput.value = "";
    if (errDiv) {
      errDiv.style.display = "none";
      errDiv.textContent = "";
    }
    if (modal) {
      modal.style.display = "flex";
      pwdInput?.focus();
    }
  }

  function hideLockModal() {
    const modal = document.getElementById("ownerLockModal");
    if (modal) modal.style.display = "none";
  }

  async function verifyAndUnlock() {
    const pwdInput = document.getElementById("ownerLockPassword");
    const errDiv = document.getElementById("ownerLockError");
    const enteredPassword = pwdInput?.value;

    if (!enteredPassword) {
      if (errDiv) {
        errDiv.textContent = "Please enter the owner password.";
        errDiv.style.display = "block";
      }
      return;
    }

    if (errDiv) errDiv.style.display = "none";

    const supabaseClient = window.client || window.supabaseClient;
    if (!supabaseClient) {
      if (errDiv) {
        errDiv.textContent = "System error: Supabase client not initialized.";
        errDiv.style.display = "block";
      }
      return;
    }

    try {
      const { data: { user } } = await supabaseClient.auth.getUser();
      if (!user) {
        window.location.href = "login.html";
        return;
      }

      // Fetch profile to check role and owner_pin
      const { data: profile } = await supabaseClient
        .from("profiles")
        .select("role, owner_pin")
        .eq("id", user.id)
        .single();

      if (profile && profile.role === "staff") {
        if (errDiv) {
          errDiv.textContent = "Access restricted: Only account owners can unlock this section.";
          errDiv.style.display = "block";
        }
        return;
      }

      let isVerified = false;

      // Verify STRICTLY against configured owner_pin
      if (profile && profile.owner_pin && profile.owner_pin.trim() !== "") {
        if (enteredPassword === profile.owner_pin) {
          isVerified = true;
        }
      }

      if (!isVerified) {
        if (errDiv) {
          errDiv.textContent = "Incorrect owner password.";
          errDiv.style.display = "block";
        }
        return;
      }

      // Successful verification -> set one-time grant flag for the target page navigation
      sessionStorage.setItem("owner_just_unlocked", "true");
      hideLockModal();

      if (pendingTargetUrl) {
        window.location.href = pendingTargetUrl;
      } else {
        // Unlock direct view on analytics.html / settings.html
      }

    } catch (err) {
      console.error("Owner unlock error:", err);
      if (errDiv) {
        errDiv.textContent = "Verification failed. Please try again.";
        errDiv.style.display = "block";
      }
    }
  }

  // Always Intercept Clicks on Analytics or Settings links
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll('a[href*="analytics.html"], a[href*="settings.html"]').forEach(link => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        const targetUrl = link.getAttribute("href");
        showLockModal(targetUrl);
      });
    });

    // Check Direct URL access on restricted pages
    const currentFile = window.location.pathname.split("/").pop();
    if (currentFile === "analytics.html" || currentFile === "settings.html") {
      const justUnlocked = sessionStorage.getItem("owner_just_unlocked") === "true";
      sessionStorage.removeItem("owner_just_unlocked"); // Consume single-use grant so next visit requires password again

      if (!justUnlocked) {
        showLockModal(null);
      }
    }
  });

  // Expose global prompt function
  window.promptOwnerAccess = showLockModal;
})();
