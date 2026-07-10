//! Loom desktop — sticky host RPC via Rust only (PLAN 0.11.1 M-19/M-20).
//! Host token and `*.host.json` never leave this process.

mod sticky;

use serde::Serialize;
use sticky::{HostProblem, StickyClient, StickyMeta};
use tauri::State;

#[derive(Default)]
struct AppState {
    /// Optional override path (tests); normally resolved from env each call.
    session_override: std::sync::Mutex<Option<String>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HostStatusDto {
    ok: bool,
    /// none | stale_pid | unauthorized | refused | ok
    code: String,
    message: String,
    session_path: String,
    meta_path: String,
    /// Present only when host is usable (never includes token).
    peer_id: Option<String>,
    display_name: Option<String>,
    room_id: Option<String>,
    room_name: Option<String>,
    pid: Option<u32>,
    port: Option<u16>,
    relay_connected: Option<bool>,
    started_at: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PeerDto {
    id: String,
    display_name: String,
    agent_kind: String,
    online: bool,
    color: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PeersDto {
    ok: bool,
    code: String,
    message: String,
    me_id: Option<String>,
    room_name: Option<String>,
    invite_code: Option<String>,
    peers: Vec<PeerDto>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct InboxEntryDto {
    id: String,
    from_peer_id: String,
    from_name: String,
    body: String,
    mode: String,
    created_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct InboxDto {
    ok: bool,
    code: String,
    message: String,
    entries: Vec<InboxEntryDto>,
    count: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ClaimDto {
    ok: bool,
    code: String,
    message: String,
    claimed: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TaskDto {
    id: String,
    title: String,
    status: String,
    assignee: Option<String>,
    notes: Option<String>,
    updated_at: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BoardDto {
    ok: bool,
    code: String,
    message: String,
    room_id: Option<String>,
    room_name: Option<String>,
    tasks: Vec<TaskDto>,
    count: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TaskMutDto {
    ok: bool,
    code: String,
    message: String,
    task: Option<TaskDto>,
}

fn task_from_json(t: &serde_json::Value) -> Option<TaskDto> {
    Some(TaskDto {
        id: t.get("id")?.as_str()?.to_string(),
        title: t
            .get("title")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string(),
        status: t
            .get("status")
            .and_then(|x| x.as_str())
            .unwrap_or("todo")
            .to_string(),
        assignee: t
            .get("assignee")
            .and_then(|x| x.as_str())
            .map(str::to_string),
        notes: t.get("notes").and_then(|x| x.as_str()).map(str::to_string),
        updated_at: t
            .get("updatedAt")
            .or_else(|| t.get("updated_at"))
            .and_then(|x| x.as_str())
            .map(str::to_string),
    })
}

fn client_from_state(state: &AppState) -> StickyClient {
    let guard = state.session_override.lock().ok();
    let override_path = guard.and_then(|g| g.clone());
    StickyClient::resolve(override_path.as_deref())
}

fn problem_dto(client: &StickyClient, problem: HostProblem) -> HostStatusDto {
    let (code, message) = match problem {
        HostProblem::NoMeta => (
            "none".into(),
            "No sticky host meta. Run: loom host start".into(),
        ),
        HostProblem::StalePid => (
            "stale_pid".into(),
            "Sticky host meta exists but process is dead. Run: loom host stop && loom host start"
                .into(),
        ),
        HostProblem::SessionMismatch => (
            "session_mismatch".into(),
            "Sticky host is bound to a different room/peer than this session (F-2). Run: loom host stop && loom host start"
                .into(),
        ),
        HostProblem::Unauthorized => (
            "unauthorized".into(),
            "Host rejected token (401). Meta may not match running host — restart host.".into(),
        ),
        HostProblem::Refused(msg) => ("refused".into(), msg),
        HostProblem::Other(msg) => ("refused".into(), msg),
    };
    HostStatusDto {
        ok: false,
        code,
        message,
        session_path: client.session_path.display().to_string(),
        meta_path: client.meta_path.display().to_string(),
        peer_id: None,
        display_name: None,
        room_id: None,
        room_name: None,
        pid: None,
        port: None,
        relay_connected: None,
        started_at: None,
    }
}

#[tauri::command]
fn get_host_status(state: State<'_, AppState>) -> HostStatusDto {
    let client = client_from_state(&state);
    // L-26: F-2 live meta (room/peer match session) for all RPC paths
    match client.load_live_meta() {
        Err(p) => problem_dto(&client, p),
        Ok(meta) => match client.rpc(&meta, serde_json::json!({ "op": "status" })) {
            Ok(v) => {
                if v.get("ok").and_then(|x| x.as_bool()) == Some(true) {
                    HostStatusDto {
                        ok: true,
                        code: "ok".into(),
                        message: "sticky host connected".into(),
                        session_path: client.session_path.display().to_string(),
                        meta_path: client.meta_path.display().to_string(),
                        peer_id: v
                            .get("peerId")
                            .or_else(|| v.get("peer_id"))
                            .and_then(|x| x.as_str())
                            .map(str::to_string),
                        display_name: v
                            .get("displayName")
                            .or_else(|| v.get("display_name"))
                            .and_then(|x| x.as_str())
                            .map(str::to_string),
                        room_id: v
                            .get("roomId")
                            .or_else(|| v.get("room_id"))
                            .and_then(|x| x.as_str())
                            .map(str::to_string),
                        room_name: v
                            .get("roomName")
                            .or_else(|| v.get("room_name"))
                            .and_then(|x| x.as_str())
                            .map(str::to_string),
                        pid: v.get("pid").and_then(|x| x.as_u64()).map(|n| n as u32),
                        port: Some(meta.port),
                        relay_connected: v
                            .get("relayConnected")
                            .or_else(|| v.get("relay_connected"))
                            .and_then(|x| x.as_bool()),
                        started_at: v
                            .get("startedAt")
                            .or_else(|| v.get("started_at"))
                            .and_then(|x| x.as_str())
                            .map(str::to_string),
                    }
                } else {
                    let err = v
                        .get("error")
                        .and_then(|x| x.as_str())
                        .unwrap_or("status failed");
                    problem_dto(&client, HostProblem::Other(err.into()))
                }
            }
            Err(p) => problem_dto(&client, p),
        },
    }
}

#[tauri::command]
fn list_peers(state: State<'_, AppState>) -> PeersDto {
    let client = client_from_state(&state);
    let meta = match client.load_live_meta() {
        Ok(m) => m,
        Err(p) => {
            let d = problem_dto(&client, p);
            return PeersDto {
                ok: false,
                code: d.code,
                message: d.message,
                me_id: None,
                room_name: None,
                invite_code: None,
                peers: vec![],
            };
        }
    };
    match client.rpc(&meta, serde_json::json!({ "op": "list_peers" })) {
        Ok(v) if v.get("ok").and_then(|x| x.as_bool()) == Some(true) => {
            let peers: Vec<PeerDto> = v
                .get("peers")
                .and_then(|x| x.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|p| {
                            Some(PeerDto {
                                id: p.get("id")?.as_str()?.to_string(),
                                display_name: p
                                    .get("displayName")
                                    .or_else(|| p.get("display_name"))
                                    .and_then(|x| x.as_str())
                                    .unwrap_or("")
                                    .to_string(),
                                agent_kind: p
                                    .get("agentKind")
                                    .or_else(|| p.get("agent_kind"))
                                    .and_then(|x| x.as_str())
                                    .unwrap_or("unknown")
                                    .to_string(),
                                online: p.get("online").and_then(|x| x.as_bool()).unwrap_or(false),
                                color: p
                                    .get("color")
                                    .and_then(|x| x.as_str())
                                    .map(str::to_string),
                            })
                        })
                        .collect()
                })
                .unwrap_or_default();
            PeersDto {
                ok: true,
                code: "ok".into(),
                message: format!("{} peers", peers.len()),
                me_id: v
                    .get("meId")
                    .or_else(|| v.get("me_id"))
                    .and_then(|x| x.as_str())
                    .map(str::to_string),
                room_name: v
                    .get("roomName")
                    .or_else(|| v.get("room_name"))
                    .and_then(|x| x.as_str())
                    .map(str::to_string),
                invite_code: v
                    .get("inviteCode")
                    .or_else(|| v.get("invite_code"))
                    .and_then(|x| x.as_str())
                    .map(str::to_string),
                peers,
            }
        }
        Ok(v) => PeersDto {
            ok: false,
            code: "refused".into(),
            message: v
                .get("error")
                .and_then(|x| x.as_str())
                .unwrap_or("list_peers failed")
                .into(),
            me_id: None,
            room_name: None,
            invite_code: None,
            peers: vec![],
        },
        Err(p) => {
            let d = problem_dto(&client, p);
            PeersDto {
                ok: false,
                code: d.code,
                message: d.message,
                me_id: None,
                room_name: None,
                invite_code: None,
                peers: vec![],
            }
        }
    }
}

#[tauri::command]
fn list_inbox(state: State<'_, AppState>) -> InboxDto {
    let client = client_from_state(&state);
    let meta = match client.load_live_meta() {
        Ok(m) => m,
        Err(p) => {
            let d = problem_dto(&client, p);
            return InboxDto {
                ok: false,
                code: d.code,
                message: d.message,
                entries: vec![],
                count: 0,
            };
        }
    };
    match client.rpc(&meta, serde_json::json!({ "op": "list_inbox" })) {
        Ok(v) if v.get("ok").and_then(|x| x.as_bool()) == Some(true) => {
            let entries = v
                .get("entries")
                .and_then(|x| x.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|e| {
                            let handoff = e.get("handoff")?;
                            let id = handoff
                                .get("id")
                                .or_else(|| e.get("id"))
                                .and_then(|x| x.as_str())?
                                .to_string();
                            let from_peer_id = handoff
                                .get("fromPeerId")
                                .or_else(|| handoff.get("from"))
                                .and_then(|x| x.as_str())
                                .unwrap_or("")
                                .to_string();
                            // HandoffPayload has no fromDisplayName — show peer id (UI may map later)
                            let from_name = from_peer_id.clone();
                            let body = handoff
                                .get("body")
                                .and_then(|x| x.as_str())
                                .unwrap_or("")
                                .to_string();
                            let mode = handoff
                                .get("mode")
                                .and_then(|x| x.as_str())
                                .unwrap_or("message")
                                .to_string();
                            let created_at = handoff
                                .get("createdAt")
                                .and_then(|x| x.as_str())
                                .unwrap_or("")
                                .to_string();
                            Some(InboxEntryDto {
                                id,
                                from_peer_id,
                                from_name,
                                body,
                                mode,
                                created_at,
                            })
                        })
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            let count = entries.len();
            InboxDto {
                ok: true,
                code: "ok".into(),
                message: format!("{count} pending"),
                entries,
                count,
            }
        }
        Ok(v) => InboxDto {
            ok: false,
            code: "refused".into(),
            message: v
                .get("error")
                .and_then(|x| x.as_str())
                .unwrap_or("list_inbox failed")
                .into(),
            entries: vec![],
            count: 0,
        },
        Err(p) => {
            let d = problem_dto(&client, p);
            InboxDto {
                ok: false,
                code: d.code,
                message: d.message,
                entries: vec![],
                count: 0,
            }
        }
    }
}

#[tauri::command]
fn claim_handoff(state: State<'_, AppState>, id: String, via: Option<String>) -> ClaimDto {
    let client = client_from_state(&state);
    let meta = match client.load_live_meta() {
        Ok(m) => m,
        Err(p) => {
            let d = problem_dto(&client, p);
            return ClaimDto {
                ok: false,
                code: d.code,
                message: d.message,
                claimed: false,
            };
        }
    };
    let via = via.unwrap_or_else(|| "claim".into());
    match client.rpc(
        &meta,
        serde_json::json!({ "op": "claim", "id": id, "via": via }),
    ) {
        Ok(v) if v.get("ok").and_then(|x| x.as_bool()) == Some(true) => {
            let claimed = v.get("claimed").and_then(|x| x.as_bool()).unwrap_or(false);
            ClaimDto {
                ok: true,
                code: if claimed {
                    "ok".into()
                } else {
                    "not_claimed".into()
                },
                message: v
                    .get("error")
                    .and_then(|x| x.as_str())
                    .unwrap_or(if claimed {
                        "claimed"
                    } else {
                        "not claimed"
                    })
                    .into(),
                claimed,
            }
        }
        Ok(v) => ClaimDto {
            ok: false,
            code: "refused".into(),
            message: v
                .get("error")
                .and_then(|x| x.as_str())
                .unwrap_or("claim failed")
                .into(),
            claimed: false,
        },
        Err(p) => {
            let d = problem_dto(&client, p);
            ClaimDto {
                ok: false,
                code: d.code,
                message: d.message,
                claimed: false,
            }
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HandoffSendDto {
    ok: bool,
    code: String,
    message: String,
    handoff_id: Option<String>,
    status: Option<String>,
    notified: Option<bool>,
}

#[tauri::command]
fn send_handoff(
    state: State<'_, AppState>,
    to: String,
    body: String,
    mode: Option<String>,
) -> HandoffSendDto {
    let client = client_from_state(&state);
    let meta = match client.load_live_meta() {
        Ok(m) => m,
        Err(p) => {
            let d = problem_dto(&client, p);
            return HandoffSendDto {
                ok: false,
                code: d.code,
                message: d.message,
                handoff_id: None,
                status: None,
                notified: None,
            };
        }
    };
    let mode = mode.unwrap_or_else(|| "message".into());
    match client.rpc(
        &meta,
        serde_json::json!({ "op": "handoff", "to": to, "body": body, "mode": mode }),
    ) {
        Ok(v) if v.get("ok").and_then(|x| x.as_bool()) == Some(true) => HandoffSendDto {
            ok: true,
            code: "ok".into(),
            message: v
                .get("message")
                .and_then(|x| x.as_str())
                .unwrap_or("sent")
                .into(),
            handoff_id: v
                .get("handoffId")
                .or_else(|| v.get("handoff_id"))
                .and_then(|x| x.as_str())
                .map(str::to_string),
            status: v
                .get("status")
                .and_then(|x| x.as_str())
                .map(str::to_string),
            notified: v.get("notified").and_then(|x| x.as_bool()),
        },
        Ok(v) => HandoffSendDto {
            ok: false,
            code: "refused".into(),
            message: v
                .get("error")
                .and_then(|x| x.as_str())
                .or_else(|| v.get("message").and_then(|x| x.as_str()))
                .unwrap_or("handoff failed")
                .into(),
            handoff_id: None,
            status: None,
            notified: None,
        },
        Err(p) => {
            let d = problem_dto(&client, p);
            HandoffSendDto {
                ok: false,
                code: d.code,
                message: d.message,
                handoff_id: None,
                status: None,
                notified: None,
            }
        }
    }
}

#[tauri::command]
fn send_chat(state: State<'_, AppState>, text: String) -> HandoffSendDto {
    let client = client_from_state(&state);
    let meta = match client.load_live_meta() {
        Ok(m) => m,
        Err(p) => {
            let d = problem_dto(&client, p);
            return HandoffSendDto {
                ok: false,
                code: d.code,
                message: d.message,
                handoff_id: None,
                status: None,
                notified: None,
            };
        }
    };
    match client.rpc(&meta, serde_json::json!({ "op": "chat", "text": text })) {
        Ok(v) if v.get("ok").and_then(|x| x.as_bool()) == Some(true) => HandoffSendDto {
            ok: true,
            code: "ok".into(),
            message: "chat sent".into(),
            handoff_id: None,
            status: Some("chat".into()),
            notified: None,
        },
        Ok(v) => HandoffSendDto {
            ok: false,
            code: "refused".into(),
            message: v
                .get("error")
                .and_then(|x| x.as_str())
                .unwrap_or("chat failed")
                .into(),
            handoff_id: None,
            status: None,
            notified: None,
        },
        Err(p) => {
            let d = problem_dto(&client, p);
            HandoffSendDto {
                ok: false,
                code: d.code,
                message: d.message,
                handoff_id: None,
                status: None,
                notified: None,
            }
        }
    }
}

#[tauri::command]
fn list_tasks(state: State<'_, AppState>) -> BoardDto {
    let client = client_from_state(&state);
    let meta = match client.load_live_meta() {
        Ok(m) => m,
        Err(p) => {
            let d = problem_dto(&client, p);
            return BoardDto {
                ok: false,
                code: d.code,
                message: d.message,
                room_id: None,
                room_name: None,
                tasks: vec![],
                count: 0,
            };
        }
    };
    match client.rpc(&meta, serde_json::json!({ "op": "list_tasks" })) {
        Ok(v) if v.get("ok").and_then(|x| x.as_bool()) == Some(true) => {
            let board = v.get("board");
            let tasks: Vec<TaskDto> = board
                .and_then(|b| b.get("tasks"))
                .and_then(|x| x.as_array())
                .map(|arr| arr.iter().filter_map(task_from_json).collect())
                .unwrap_or_default();
            let count = v
                .get("count")
                .and_then(|x| x.as_u64())
                .map(|n| n as usize)
                .unwrap_or(tasks.len());
            BoardDto {
                ok: true,
                code: "ok".into(),
                message: format!("{count} tasks"),
                room_id: board
                    .and_then(|b| b.get("roomId"))
                    .and_then(|x| x.as_str())
                    .map(str::to_string),
                room_name: board
                    .and_then(|b| b.get("roomName"))
                    .and_then(|x| x.as_str())
                    .map(str::to_string),
                tasks,
                count,
            }
        }
        Ok(v) => BoardDto {
            ok: false,
            code: "refused".into(),
            message: v
                .get("error")
                .and_then(|x| x.as_str())
                .unwrap_or("list_tasks failed")
                .into(),
            room_id: None,
            room_name: None,
            tasks: vec![],
            count: 0,
        },
        Err(p) => {
            let d = problem_dto(&client, p);
            BoardDto {
                ok: false,
                code: d.code,
                message: d.message,
                room_id: None,
                room_name: None,
                tasks: vec![],
                count: 0,
            }
        }
    }
}

#[tauri::command]
fn add_task(
    state: State<'_, AppState>,
    title: String,
    status: Option<String>,
) -> TaskMutDto {
    let client = client_from_state(&state);
    let meta = match client.load_live_meta() {
        Ok(m) => m,
        Err(p) => {
            let d = problem_dto(&client, p);
            return TaskMutDto {
                ok: false,
                code: d.code,
                message: d.message,
                task: None,
            };
        }
    };
    let mut body = serde_json::json!({ "op": "add_task", "title": title });
    if let Some(s) = status {
        body["status"] = serde_json::Value::String(s);
    }
    match client.rpc(&meta, body) {
        Ok(v) if v.get("ok").and_then(|x| x.as_bool()) == Some(true) => TaskMutDto {
            ok: true,
            code: "ok".into(),
            message: "added".into(),
            task: v.get("task").and_then(task_from_json),
        },
        Ok(v) => TaskMutDto {
            ok: false,
            code: "refused".into(),
            message: v
                .get("error")
                .and_then(|x| x.as_str())
                .unwrap_or("add_task failed")
                .into(),
            task: None,
        },
        Err(p) => {
            let d = problem_dto(&client, p);
            TaskMutDto {
                ok: false,
                code: d.code,
                message: d.message,
                task: None,
            }
        }
    }
}

#[tauri::command]
fn update_task(
    state: State<'_, AppState>,
    id: String,
    status: Option<String>,
    title: Option<String>,
) -> TaskMutDto {
    let client = client_from_state(&state);
    let meta = match client.load_live_meta() {
        Ok(m) => m,
        Err(p) => {
            let d = problem_dto(&client, p);
            return TaskMutDto {
                ok: false,
                code: d.code,
                message: d.message,
                task: None,
            };
        }
    };
    let mut body = serde_json::json!({ "op": "update_task", "id": id });
    if let Some(s) = status {
        body["status"] = serde_json::Value::String(s);
    }
    if let Some(t) = title {
        body["title"] = serde_json::Value::String(t);
    }
    match client.rpc(&meta, body) {
        Ok(v) if v.get("ok").and_then(|x| x.as_bool()) == Some(true) => TaskMutDto {
            ok: true,
            code: "ok".into(),
            message: "updated".into(),
            task: v.get("task").and_then(task_from_json),
        },
        Ok(v) => TaskMutDto {
            ok: false,
            code: "refused".into(),
            message: v
                .get("error")
                .and_then(|x| x.as_str())
                .unwrap_or("update_task failed")
                .into(),
            task: None,
        },
        Err(p) => {
            let d = problem_dto(&client, p);
            TaskMutDto {
                ok: false,
                code: d.code,
                message: d.message,
                task: None,
            }
        }
    }
}

/// Dev/test helper: never exposes token. Confirms meta path resolution only.
#[tauri::command]
fn debug_paths(state: State<'_, AppState>) -> serde_json::Value {
    let client = client_from_state(&state);
    serde_json::json!({
        "sessionPath": client.session_path.display().to_string(),
        "metaPath": client.meta_path.display().to_string(),
        "metaExists": client.meta_path.exists(),
    })
}

// Keep StickyMeta referenced for clarity (token field never serialized out).
#[allow(dead_code)]
fn _meta_token_stays_private(m: &StickyMeta) -> usize {
    m.token.len()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            get_host_status,
            list_peers,
            list_inbox,
            claim_handoff,
            send_handoff,
            send_chat,
            list_tasks,
            add_task,
            update_task,
            debug_paths,
        ])
        .run(tauri::generate_context!())
        .expect("error while running loom desktop");
}
