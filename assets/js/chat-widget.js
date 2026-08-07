/*!
 * HVAC portfolio chat widget - zero-config drop-in.
 *
 * Reads everything it needs from tags SiteLayout.astro already emits:
 *   - brand  : <meta property="og:site_name">
 *   - color  : <meta name="theme-color">   (the site's navy / palette.themeColor)
 *   - origin : location.hostname            (passed to n8n for site-aware context)
 *
 * POSTs each turn to the n8n "HVAC Chat" workflow:
 *   { sessionId, message, origin }  ->  { reply }
 *
 * The browser holds NO LLM key and posts NO lead directly - lead capture happens
 * server-side in n8n's capture_lead tool, so attribution is trusted and the
 * "Valid lead?" gate applies naturally.
 *
 * Opt-out on a site:  <meta name="hc-chat" content="off">
 * Override the endpoint (staging): <meta name="hc-chat-url" content="https://...">
 */
(function () {
  "use strict";
  if (document.querySelector("[data-hc-chat]")) return; // double-load guard
  if (document.querySelector('meta[name="hc-chat"][content="off"]')) return;

  var d = document;
  var META = function (n) { var m = d.querySelector('meta[name="' + n + '"]'); return m ? m.getAttribute("content") : ""; };
  var OG = function (p) { var m = d.querySelector('meta[property="' + p + '"]'); return m ? m.getAttribute("content") : ""; };

  var BRAND = OG("og:site_name") || (location.hostname.replace(/^www\./, "").split(".")[0]);
  var COLOR = META("theme-color") || "#0f2544";
  var ENDPOINT = META("hc-chat-url") || "https://auto.sdagents.ai/webhook/hvac-chat";
  var SESSION_KEY = "hc_chat_sid";

  function sid() {
    try {
      var s = localStorage.getItem(SESSION_KEY);
      if (s) return s;
      s = "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      localStorage.setItem(SESSION_KEY, s);
      return s;
    } catch (e) { return "c" + Date.now().toString(36); }
  }

  /* ---------- styles ---------- */
  var css = "" +
    "[data-hc-chat]{all:initial}" +
    ".hc-bubble{position:fixed;z-index:2147483000;right:20px;bottom:20px;width:60px;height:60px;border-radius:50%;" +
      "background:" + COLOR + ";box-shadow:0 6px 20px rgba(0,0,0,.25);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;" +
      "transition:transform .15s ease}" +
    ".hc-bubble:hover{transform:scale(1.06)}" +
    ".hc-bubble svg{width:28px;height:28px;fill:#fff}" +
    ".hc-panel{position:fixed;z-index:2147483001;right:20px;bottom:20px;width:min(380px,calc(100vw - 32px));height:min(600px,calc(100vh - 96px));" +
      "background:#fff;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.28);display:none;flex-direction:column;overflow:hidden;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}" +
    ".hc-panel.open{display:flex;animation:hc-pop .16s ease}" +
    "@keyframes hc-pop{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}" +
    ".hc-head{background:" + COLOR + ";color:#fff;padding:14px 16px;display:flex;align-items:center;gap:10px}" +
    ".hc-head .hc-t{font-weight:700;font-size:15px;line-height:1.2;flex:1}" +
    ".hc-head .hc-s{font-size:11px;opacity:.85;font-weight:500}" +
    ".hc-x{background:transparent;border:none;color:#fff;cursor:pointer;font-size:22px;line-height:1;padding:0 4px;opacity:.9}" +
    ".hc-msgs{flex:1;overflow-y:auto;padding:14px;background:#f6f7f9;display:flex;flex-direction:column;gap:10px}" +
    ".hc-m{max-width:82%;padding:10px 12px;border-radius:12px;font-size:14px;line-height:1.4;white-space:pre-wrap;word-wrap:break-word}" +
    ".hc-m.bot{align-self:flex-start;background:#fff;border:1px solid #e6e8eb;border-bottom-left-radius:4px}" +
    ".hc-m.me{align-self:flex-end;background:" + COLOR + ";color:#fff;border-bottom-right-radius:4px}" +
    ".hc-typ{align-self:flex-start;display:flex;gap:4px;padding:12px}" +
    ".hc-typ i{width:7px;height:7px;border-radius:50%;background:#aab2bd;animation:hc-b 1s infinite}" +
    ".hc-typ i:nth-child(2){animation-delay:.15s}.hc-typ i:nth-child(3){animation-delay:.3s}" +
    "@keyframes hc-b{0%,60%,100%{opacity:.3;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}" +
    ".hc-in{display:flex;gap:8px;padding:12px;border-top:1px solid #e6e8eb;background:#fff}" +
    ".hc-in input{flex:1;border:1px solid #d4d8dd;border-radius:10px;padding:10px 12px;font-size:14px;font-family:inherit;outline:none}" +
    ".hc-in input:focus{border-color:" + COLOR + "}" +
    ".hc-send{background:" + COLOR + ";color:#fff;border:none;border-radius:10px;padding:0 16px;font-weight:600;font-size:14px;cursor:pointer}" +
    ".hc-attach{background:transparent;border:none;color:#6b7280;cursor:pointer;padding:0 4px;display:flex;align-items:center}" +
    ".hc-attach:hover{color:" + COLOR + "}" +
    ".hc-photo-chip{display:flex;align-items:center;gap:8px;padding:4px 14px 0;font-size:12px;color:#444}" +
    ".hc-photo-chip button{background:#eef0f3;border:none;border-radius:8px;padding:2px 8px;cursor:pointer;font-size:11px;color:#555}" +
    ".hc-err{font-size:12px;color:#b00020;padding:0 12px 8px}" +
    "@media (max-width:560px){.hc-panel{right:8px;bottom:8px}}";
  var st = d.createElement("style"); st.textContent = css; d.head.appendChild(st);

  /* ---------- DOM ---------- */
  var host = d.createElement("div"); host.setAttribute("data-hc-chat", ""); d.body.appendChild(host);

  var bubble = d.createElement("button");
  bubble.className = "hc-bubble";
  bubble.setAttribute("aria-label", "Open chat");
  bubble.setAttribute("aria-expanded", "false");
  bubble.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 3C6.5 3 2 6.6 2 11c0 2 .9 3.8 2.5 5.2-.1 1.2-.5 2.6-1.3 3.7-.2.3 0 .7.4.6 1.8-.3 3.2-.9 4.2-1.5 1.3.5 2.7.8 4.2.8 5.5 0 10-3.6 10-8s-4.5-8-10-8z"/></svg>';
  host.appendChild(bubble);

  var panel = d.createElement("div");
  panel.className = "hc-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Chat with " + BRAND);
  panel.innerHTML =
    '<div class="hc-head"><div><div class="hc-t">Chat with ' + BRAND + '</div><div class="hc-s">We typically reply in minutes</div></div>' +
    '<button class="hc-x" aria-label="Close chat">&times;</button></div>' +
    '<div class="hc-msgs" data-hc-msgs></div>' +
    '<div class="hc-err" data-hc-err hidden></div>' +
    '<form class="hc-in"><button class="hc-attach" type="button" aria-label="Attach a photo" title="Attach a photo"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.5" fill="currentColor" stroke="none"/><path d="M21 16l-5-5-9 9"/></svg></button>' +
    '<input type="text" placeholder="Type your message..." aria-label="Message" autocomplete="off">' +
    '<button class="hc-send" type="submit">Send</button></form>' +
    '<input type="file" accept="image/*" data-hc-file hidden>' +
    '<div class="hc-photo-chip" data-hc-chip hidden></div>';
  host.appendChild(panel);

  var msgs = panel.querySelector("[data-hc-msgs]");
  var errEl = panel.querySelector("[data-hc-err]");
  var form = panel.querySelector("form");
  var input = form.querySelector("input");

  /* ---------- photo attachment (resized client-side, sent as base64) ---------- */
  var fileInput = host.querySelector("[data-hc-file]");
  var chip = host.querySelector("[data-hc-chip]");
  var pendingPhoto = null; // { mediaType, data(base64, no prefix) }
  function setPhoto(p) {
    pendingPhoto = p;
    if (p) {
      chip.innerHTML = '<span>Photo attached</span> <button type="button" data-hc-rm>remove</button>';
      chip.hidden = false;
      chip.querySelector("[data-hc-rm]").addEventListener("click", function () { setPhoto(null); });
    } else { chip.hidden = true; chip.innerHTML = ""; }
  }
  form.querySelector(".hc-attach").addEventListener("click", function () { fileInput.click(); });
  fileInput.addEventListener("change", function () {
    var f = fileInput.files && fileInput.files[0]; if (!f) return;
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var max = 1280, scale = Math.min(1, max / Math.max(img.width, img.height));
        var w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        var c = d.createElement("canvas"); c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        var b64 = (c.toDataURL("image/jpeg", 0.72).split(",")[1]) || "";
        fileInput.value = "";
        if (!b64) { flash("Could not process that image."); return; }
        if (b64.length > 3 * 1024 * 1024) { flash("Photo too large after resize - try a smaller one."); return; }
        setPhoto({ mediaType: "image/jpeg", data: b64 }); flash("");
      };
      img.onerror = function () { fileInput.value = ""; flash("Could not read that image."); };
      img.src = reader.result;
    };
    reader.onerror = function () { fileInput.value = ""; flash("Could not read that file."); };
    reader.readAsDataURL(f);
  });

  /* ---------- behaviour ---------- */
  var opened = false, busy = false;
  function set(open) {
    opened = open;
    panel.classList.toggle("open", open);
    bubble.style.display = open ? "none" : "flex";
    bubble.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) { input.focus(); if (!msgs.childElementCount) push("bot", "Hi! Need a quote or have a question about our services? Tell me what you need and I'll point you in the right direction."); }
  }
  bubble.addEventListener("click", function () { set(true); });
  panel.querySelector(".hc-x").addEventListener("click", function () { set(false); });
  d.addEventListener("keydown", function (e) { if (e.key === "Escape" && opened) set(false); });

  function push(who, text) {
    var el = d.createElement("div");
    el.className = "hc-m " + who;
    el.textContent = text;
    msgs.appendChild(el);
    msgs.scrollTop = msgs.scrollHeight;
    return el;
  }
  function typing(on) {
    var t = panel.querySelector(".hc-typ");
    if (on && !t) {
      t = d.createElement("div"); t.className = "hc-typ";
      t.innerHTML = "<i></i><i></i><i></i>";
      msgs.appendChild(t); msgs.scrollTop = msgs.scrollHeight;
    } else if (!on && t) { t.remove(); }
  }
  function flash(msg) { errEl.textContent = msg; errEl.hidden = !msg; }

  async function send(text) {
    if (busy || !text.trim()) return;
    busy = true; flash("");

    // Collect prior turns for multi-turn memory (the n8n Resolve node folds these
    // into the prompt). Snapshot BEFORE pushing the current message.
    var history = [];
    msgs.querySelectorAll(".hc-m").forEach(function (el) {
      history.push({ role: el.classList.contains("me") ? "user" : "assistant", text: el.textContent });
    });
    if (history.length > 6) history = history.slice(-6);

    push("me", text);
    input.value = "";
    typing(true);
    try {
      var r = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sid(), message: text, origin: location.hostname, history: history, photo: pendingPhoto })
      });
      typing(false);
      if (!r.ok) throw new Error("HTTP " + r.status);
      var data = await r.json().catch(function () { return {}; });
      push("bot", data.reply || data.output || "Sorry, I didn't get a response - please try again.");
    } catch (e) {
      typing(false);
      push("bot", "I'm having trouble connecting right now. Please use the contact form or call us - we'll get right back to you.");
      flash("Connection issue: " + (e.message || "unknown"));
    } finally {
      setPhoto(null);
      busy = false;
      input.focus();
    }
  }

  form.addEventListener("submit", function (e) { e.preventDefault(); send(input.value); });
})();
