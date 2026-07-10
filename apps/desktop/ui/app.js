/**
 * Loom desktop UI (PLAN 0.11.1 / 0.11.2)
 * - invoke only (no sticky fetch; no token in JS)
 * - textContent only for peer-controlled strings (M-20)
 */

const invoke = (cmd, args) => {
  const core = window.__TAURI__?.core;
  if (!core?.invoke) {
    return Promise.reject(new Error("Tauri invoke unavailable (open via loom desktop / tauri dev)"));
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
const STATUSES = ["todo", "doing", "done", "blocked", "cancelled"];

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
      return "CTA: Start sticky host\n  loom host start\nThen click Refresh.";
    case "stale_pid":
      return "CTA: Dead host process\n  loom host stop\n  loom host start";
    case "unauthorized":
      return "CTA: Token/meta mismatch\n  loom host stop && loom host start";
    case "refused":
      return "CTA: Connection refused or RPC error\n  Check relay + loom host start";
    default:
      return "";
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
        ["Relay", s.relayConnected == null ? "—" : s.relayConnected ? "connected" : "disconnected"],
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

async function refreshPeers() {
  clearChildren(peersList);
  try {
    const r = await invoke("list_peers");
    setText(peersMeta, r.message || "");
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
    const empty = el("li", "empty");
    setText(empty, e?.message || String(e));
    peersList.appendChild(empty);
  }
}

async function refreshInbox() {
  clearChildren(inboxList);
  try {
    const r = await invoke("list_inbox");
    setText(inboxMeta, r.message || "");
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
      setText(from, e.fromName || e.fromPeerId || "?");
      const mode = el("span", "pill");
      setText(mode, e.mode || "message");
      const id = el("span", "muted");
      setText(id, e.id);
      head.appendChild(from);
      head.appendChild(mode);
      head.appendChild(id);
      const body = el("p", "body-text");
      // M-20: text only — malicious HTML stays as characters
      setText(body, e.body || "");
      const actions = el("div", "card-actions");
      const claimBtn = el("button", "btn small");
      setText(claimBtn, "Claim");
      claimBtn.type = "button";
      claimBtn.addEventListener("click", async () => {
        claimBtn.disabled = true;
        try {
          const res = await invoke("claim_handoff", { id: e.id, via: "claim" });
          showBanner(res.claimed ? "ok" : "warn", res.message || (res.claimed ? "claimed" : "not claimed"));
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
          const res = await invoke("claim_handoff", { id: e.id, via: "accept" });
          showBanner(res.claimed ? "ok" : "warn", res.message || (res.claimed ? "accepted" : "not accepted"));
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
    for (const t of r.tasks) {
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
          const res = await invoke("update_task", { id: t.id, status: sel.value });
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
  } catch (e) {
    const empty = el("li", "empty");
    setText(empty, e?.message || String(e));
    boardList.appendChild(empty);
  }
}

async function refreshAll() {
  await refreshStatus();
  await refreshPeers();
  await refreshInbox();
  await refreshBoard();
}

document.getElementById("board-add").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const input = document.getElementById("board-title");
  const title = (input.value || "").trim();
  if (!title) return;
  try {
    const res = await invoke("add_task", { title, status: "todo" });
    showBanner(res.ok ? "ok" : "warn", res.message || (res.ok ? "added" : "failed"));
    if (res.ok) {
      input.value = "";
      await refreshBoard();
    }
  } catch (e) {
    showBanner("bad", e?.message || String(e));
  }
});

// Tabs
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    const name = tab.getAttribute("data-tab");
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === tab));
    document.querySelectorAll(".panel").forEach((p) => {
      const on = p.id === `panel-${name}`;
      p.hidden = !on;
      p.classList.toggle("active", on);
    });
  });
});

document.getElementById("btn-refresh").addEventListener("click", () => {
  refreshAll();
});

// boot
refreshAll();
