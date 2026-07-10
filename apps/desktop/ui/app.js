/**
 * Loom desktop UI (PLAN 0.12.x)
 * - invoke only (no sticky fetch; no token in JS)
 * - textContent only for peer-controlled strings (M-20)
 */

const invoke = (cmd, args) => {
  const core = window.__TAURI__?.core;
  if (!core?.invoke) {
    return Promise.reject(
      new Error("Tauri invoke unavailable (open via loom desktop / tauri dev)"),
    );
  }
  return core.invoke(cmd, args ?? {});
};

/** Set element text only — never innerHTML (M-20). */
function setText(el, value) {
  el.textContent = value == null ? "" : String(value);
}

function clearChildren(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

function el(tag, className) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  return n;
}

const banner = document.getElementById("banner");
const statusDl = document.getElementById("status-dl");
const statusCta = document.getElementById("status-cta");
const peersList = document.getElementById("peers-list");
const peersMeta = document.getElementById("peers-meta");
const inboxList = document.getElementById("inbox-list");
const inboxMeta = document.getElementById("inbox-meta");
const boardList = document.getElementById("board-list");
const boardMeta = document.getElementById("board-meta");
const btnRefresh = document.getElementById("btn-refresh");
const lastRefreshEl = document.getElementById("last-refresh");
const autoRefreshEl = document.getElementById("auto-refresh");
const badgeInbox = document.getElementById("badge-inbox");
const badgeBoard = document.getElementById("badge-board");
const inviteBox = document.getElementById("invite-box");
const inviteCodeEl = document.getElementById("invite-code");
const inviteHintEl = document.getElementById("invite-hint");
const sendToEl = document.getElementById("send-to");
const STATUSES = ["todo", "doing", "done", "blocked", "cancelled"];

/** peerId → displayName from last list_peers */
let peerNameMap = new Map();
let lastPeers = [];
let lastMeId = null;
let lastInviteCode = null;
let refreshInFlight = false;
let autoTimer = null;

function showBanner(kind, message) {
  banner.classList.remove("hidden", "ok", "warn", "bad");
  if (!message) {
    banner.classList.add("hidden");
    setText(banner, "");
    return;
  }
  banner.classList.add(kind || "warn");
  setText(banner, message);
}

function hostCta(code) {
  switch (code) {
    case "none":
      return "CTA: Start sticky host\n  loom host start\nThen click Refresh (or wait for auto-refresh).";
    case "stale_pid":
      return "CTA: Dead host process\n  loom host stop\n  loom host start";
    case "session_mismatch":
      return "CTA: Host bound to different room/peer (F-2)\n  loom host stop\n  loom host start";
    case "unauthorized":
      return "CTA: Token/meta mismatch\n  loom host stop && loom host start";
    case "refused":
      return "CTA: Connection refused or RPC error\n  Check relay + loom host start";
    default:
      return "";
  }
}

function setBadge(el, n) {
  if (!el) return;
  if (n > 0) {
    el.hidden = false;
    setText(el, n > 99 ? "99+" : String(n));
  } else {
    el.hidden = true;
    setText(el, "");
  }
}

function renderKv(dl, rows) {
  clearChildren(dl);
  for (const [k, v] of rows) {
    const dt = el("dt");
    setText(dt, k);
    const dd = el("dd");
    setText(dd, v == null || v === "" ? "—" : v);
    dl.appendChild(dt);
    dl.appendChild(dd);
  }
}

function markRefreshed() {
  const t = new Date();
  setText(
    lastRefreshEl,
    `Updated ${t.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`,
  );
}

async function refreshStatus() {
  try {
    const s = await invoke("get_host_status");
    if (s.ok) {
      showBanner("ok", s.message);
      setText(statusCta, "");
      renderKv(statusDl, [
        ["State", s.code],
        ["Peer", s.displayName ? `${s.displayName} (${s.peerId})` : s.peerId],
        ["Room", s.roomName ? `${s.roomName} (${s.roomId})` : s.roomId],
        [
          "Relay",
          s.relayConnected == null
            ? "—"
            : s.relayConnected
              ? "connected"
              : "disconnected",
        ],
        ["PID", s.pid],
        ["Port", s.port],
        ["Started", s.startedAt],
        ["Session", s.sessionPath],
        ["Meta", s.metaPath],
      ]);
    } else {
      showBanner(s.code === "stale_pid" ? "warn" : "bad", s.message);
      setText(statusCta, hostCta(s.code));
      renderKv(statusDl, [
        ["State", s.code],
        ["Session", s.sessionPath],
        ["Meta", s.metaPath],
      ]);
    }
    return s;
  } catch (e) {
    showBanner("bad", e?.message || String(e));
    return null;
  }
}

function fillSendToSelect() {
  if (!sendToEl) return;
  const prev = sendToEl.value;
  clearChildren(sendToEl);
  const broadcast = el("option");
  broadcast.value = "*";
  setText(broadcast, "* (broadcast)");
  sendToEl.appendChild(broadcast);
  for (const p of lastPeers) {
    if (lastMeId && p.id === lastMeId) continue;
    const opt = el("option");
    // Prefer @name for sticky handoff resolution
    const name = p.displayName || p.id;
    opt.value = name ? `@${name}` : p.id;
    setText(opt, `${name}${p.online ? "" : " (offline)"} · ${p.id}`);
    sendToEl.appendChild(opt);
  }
  if (prev) {
    for (const o of sendToEl.options) {
      if (o.value === prev) {
        sendToEl.value = prev;
        break;
      }
    }
  }
}

function updateInviteBox() {
  if (!inviteBox) return;
  if (lastInviteCode) {
    inviteBox.hidden = false;
    setText(inviteCodeEl, lastInviteCode);
    setText(inviteHintEl, `loom room join ${lastInviteCode}`);
  } else {
    inviteBox.hidden = true;
    setText(inviteCodeEl, "");
    setText(inviteHintEl, "");
  }
}

async function refreshPeers() {
  clearChildren(peersList);
  try {
    const r = await invoke("list_peers");
    setText(peersMeta, r.message || "");
    peerNameMap = new Map();
    lastPeers = r.ok ? r.peers || [] : [];
    lastMeId = r.ok ? r.meId || null : null;
    lastInviteCode = r.ok ? r.inviteCode || null : null;
    updateInviteBox();
    fillSendToSelect();
    if (!r.ok) {
      const empty = el("li", "empty");
      setText(empty, r.message || "Host unavailable");
      peersList.appendChild(empty);
      return;
    }
    if (!r.peers?.length) {
      const empty = el("li", "empty");
      setText(empty, "No peers");
      peersList.appendChild(empty);
      return;
    }
    for (const p of r.peers) {
      if (p.id) peerNameMap.set(p.id, p.displayName || p.id);
      const li = el("li", "card");
      const head = el("div", "card-head");
      const dot = el("span", `dot ${p.online ? "on" : "off"}`);
      const name = el("strong");
      setText(name, p.displayName || p.id);
      const id = el("span", "muted");
      setText(id, p.id);
      const agent = el("span", "pill");
      setText(agent, p.agentKind || "unknown");
      const online = el("span", "pill");
      setText(online, p.online ? "online" : "offline");
      if (r.meId && p.id === r.meId) {
        const me = el("span", "pill");
        setText(me, "you");
        head.appendChild(me);
      }
      head.appendChild(dot);
      head.appendChild(name);
      head.appendChild(id);
      head.appendChild(agent);
      head.appendChild(online);
      li.appendChild(head);
      peersList.appendChild(li);
    }
  } catch (e) {
    lastPeers = [];
    lastInviteCode = null;
    updateInviteBox();
    fillSendToSelect();
    const empty = el("li", "empty");
    setText(empty, e?.message || String(e));
    peersList.appendChild(empty);
  }
}

function displayFrom(entry) {
  if (entry.fromName && entry.fromName !== entry.fromPeerId) {
    return entry.fromName;
  }
  const mapped = peerNameMap.get(entry.fromPeerId);
  if (mapped) return mapped;
  return entry.fromName || entry.fromPeerId || "?";
}

async function refreshInbox() {
  clearChildren(inboxList);
  try {
    const r = await invoke("list_inbox");
    setText(inboxMeta, r.message || "");
    const n = r.ok ? r.entries?.length || 0 : 0;
    setBadge(badgeInbox, n);
    if (!r.ok) {
      const empty = el("li", "empty");
      setText(empty, r.message || "Host unavailable");
      inboxList.appendChild(empty);
      return;
    }
    if (!r.entries?.length) {
      const empty = el("li", "empty");
      setText(empty, "Inbox empty");
      inboxList.appendChild(empty);
      return;
    }
    for (const e of r.entries) {
      const li = el("li", "card");
      const head = el("div", "card-head");
      const from = el("strong");
      setText(from, displayFrom(e));
      const mode = el("span", "pill");
      setText(mode, e.mode || "message");
      const id = el("span", "muted");
      setText(id, e.id);
      head.appendChild(from);
      head.appendChild(mode);
      head.appendChild(id);
      const body = el("p", "body-text");
      setText(body, e.body || "");
      const actions = el("div", "card-actions");
      const claimBtn = el("button", "btn small");
      setText(claimBtn, "Claim");
      claimBtn.type = "button";
      claimBtn.addEventListener("click", async () => {
        claimBtn.disabled = true;
        try {
          const res = await invoke("claim_handoff", { id: e.id, via: "claim" });
          showBanner(
            res.claimed ? "ok" : "warn",
            res.message || (res.claimed ? "claimed" : "not claimed"),
          );
          await refreshInbox();
        } catch (err) {
          showBanner("bad", err?.message || String(err));
          claimBtn.disabled = false;
        }
      });
      const acceptBtn = el("button", "btn small");
      setText(acceptBtn, "Accept");
      acceptBtn.type = "button";
      acceptBtn.addEventListener("click", async () => {
        acceptBtn.disabled = true;
        try {
          const res = await invoke("claim_handoff", {
            id: e.id,
            via: "accept",
          });
          showBanner(
            res.claimed ? "ok" : "warn",
            res.message || (res.claimed ? "accepted" : "not accepted"),
          );
          await refreshInbox();
        } catch (err) {
          showBanner("bad", err?.message || String(err));
          acceptBtn.disabled = false;
        }
      });
      actions.appendChild(claimBtn);
      actions.appendChild(acceptBtn);
      li.appendChild(head);
      li.appendChild(body);
      li.appendChild(actions);
      inboxList.appendChild(li);
    }
  } catch (e) {
    setBadge(badgeInbox, 0);
    const empty = el("li", "empty");
    setText(empty, e?.message || String(e));
    inboxList.appendChild(empty);
  }
}

async function refreshBoard() {
  clearChildren(boardList);
  try {
    const r = await invoke("list_tasks");
    setText(boardMeta, r.message || "");
    const n = r.ok ? r.tasks?.length || 0 : 0;
    setBadge(badgeBoard, n);
    if (!r.ok) {
      const empty = el("li", "empty");
      setText(empty, r.message || "Host unavailable");
      boardList.appendChild(empty);
      return;
    }
    if (!r.tasks?.length) {
      const empty = el("li", "empty");
      setText(empty, "No tasks — add one above");
      boardList.appendChild(empty);
      return;
    }
    // Group by status for scanability
    const byStatus = new Map(STATUSES.map((s) => [s, []]));
    for (const t of r.tasks) {
      const s = STATUSES.includes(t.status) ? t.status : "todo";
      byStatus.get(s).push(t);
    }
    for (const status of STATUSES) {
      const group = byStatus.get(status) || [];
      if (!group.length) continue;
      const header = el("li", "group-head");
      setText(header, `${status} (${group.length})`);
      boardList.appendChild(header);
      for (const t of group) {
        const li = el("li", "card");
        const head = el("div", "card-head");
        const title = el("strong");
        setText(title, t.title || t.id);
        const id = el("span", "muted");
        setText(id, t.id);
        const sel = el("select", "status-select");
        for (const s of STATUSES) {
          const opt = el("option");
          opt.value = s;
          setText(opt, s);
          if (s === t.status) opt.selected = true;
          sel.appendChild(opt);
        }
        sel.addEventListener("change", async () => {
          sel.disabled = true;
          try {
            const res = await invoke("update_task", {
              id: t.id,
              status: sel.value,
            });
            showBanner(res.ok ? "ok" : "warn", res.message || "updated");
            await refreshBoard();
          } catch (err) {
            showBanner("bad", err?.message || String(err));
            sel.disabled = false;
          }
        });
        head.appendChild(title);
        head.appendChild(sel);
        head.appendChild(id);
        li.appendChild(head);
        if (t.notes) {
          const notes = el("p", "body-text");
          setText(notes, t.notes);
          li.appendChild(notes);
        }
        if (t.assignee) {
          const asg = el("p", "muted");
          setText(asg, `assignee: ${t.assignee}`);
          li.appendChild(asg);
        }
        boardList.appendChild(li);
      }
    }
  } catch (e) {
    setBadge(badgeBoard, 0);
    const empty = el("li", "empty");
    setText(empty, e?.message || String(e));
    boardList.appendChild(empty);
  }
}

async function refreshAll() {
  if (refreshInFlight) return;
  refreshInFlight = true;
  btnRefresh.disabled = true;
  try {
    await refreshStatus();
    await refreshPeers();
    await refreshInbox();
    await refreshBoard();
    markRefreshed();
  } finally {
    refreshInFlight = false;
    btnRefresh.disabled = false;
  }
}

function setupAutoRefresh() {
  if (autoTimer) {
    clearInterval(autoTimer);
    autoTimer = null;
  }
  if (autoRefreshEl?.checked) {
    autoTimer = setInterval(() => {
      refreshAll();
    }, 5000);
  }
}

// Tabs
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    const name = tab.getAttribute("data-tab");
    document
      .querySelectorAll(".tab")
      .forEach((t) => t.classList.toggle("active", t === tab));
    document.querySelectorAll(".panel").forEach((p) => {
      const on = p.id === `panel-${name}`;
      p.hidden = !on;
      p.classList.toggle("active", on);
    });
  });
});

btnRefresh.addEventListener("click", () => {
  refreshAll();
});

document.getElementById("send-form")?.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const to = sendToEl?.value || "";
  const mode = document.getElementById("send-mode")?.value || "message";
  const body = (document.getElementById("send-body")?.value || "").trim();
  if (!body) return;
  const submit = document.getElementById("send-submit");
  if (submit) submit.disabled = true;
  try {
    if (mode === "chat") {
      const res = await invoke("send_chat", { text: body });
      showBanner(res.ok ? "ok" : "warn", res.message || (res.ok ? "chat sent" : "failed"));
    } else {
      const res = await invoke("send_handoff", { to, body, mode });
      const detail = res.ok
        ? `${res.message || "sent"} · ${res.status || ""}${res.handoffId ? ` · ${res.handoffId}` : ""}`
        : res.message || "failed";
      showBanner(res.ok ? "ok" : "warn", detail.trim());
    }
    if (document.getElementById("send-body")) {
      document.getElementById("send-body").value = "";
    }
    await refreshInbox();
    markRefreshed();
  } catch (e) {
    showBanner("bad", e?.message || String(e));
  } finally {
    if (submit) submit.disabled = false;
  }
});

document.getElementById("board-add").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const input = document.getElementById("board-title");
  const title = (input.value || "").trim();
  if (!title) return;
  try {
    const res = await invoke("add_task", { title, status: "todo" });
    showBanner(
      res.ok ? "ok" : "warn",
      res.message || (res.ok ? "added" : "failed"),
    );
    if (res.ok) {
      input.value = "";
      await refreshBoard();
      markRefreshed();
    }
  } catch (e) {
    showBanner("bad", e?.message || String(e));
  }
});

autoRefreshEl?.addEventListener("change", setupAutoRefresh);

// Keyboard: r / Cmd+R style without fighting browser — only when not typing
document.addEventListener("keydown", (ev) => {
  const tag = (ev.target && ev.target.tagName) || "";
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  if (ev.key === "r" || ev.key === "R") {
    ev.preventDefault();
    refreshAll();
  }
});

// boot
refreshAll();
setupAutoRefresh();
