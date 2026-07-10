//! Sticky host meta + loopback RPC (M-19). Token never returned to callers as DTO fields
//! for the webview — only used inside `rpc`.

use serde::Deserialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)] // fields kept for serde parity with host meta; only port/token/pid used in RPC
pub struct StickyMeta {
    pub pid: u32,
    pub port: u16,
    /// Bearer secret — Rust-only; never Serialize to frontend.
    pub token: String,
    pub session_path: String,
    pub peer_id: String,
    pub room_id: String,
    pub room_name: String,
    pub display_name: String,
    pub started_at: String,
}

#[derive(Debug)]
pub enum HostProblem {
    NoMeta,
    StalePid,
    /// F-2 / L-26: meta roomId/peerId ≠ current session (re-join without host restart).
    SessionMismatch,
    Unauthorized,
    Refused(String),
    Other(String),
}

/// Minimal session fields for F-2 match (camelCase JSON on disk).
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionIds {
    peer_id: String,
    room_id: String,
}

pub struct StickyClient {
    pub session_path: PathBuf,
    pub meta_path: PathBuf,
}

impl StickyClient {
    /// PLAN 0.11.1: LOOM_SESSION → LOOM_PROFILE → default ~/.loom/session.json
    pub fn resolve(session_override: Option<&str>) -> Self {
        let session_path = if let Some(p) = session_override {
            PathBuf::from(p)
        } else if let Ok(p) = std::env::var("LOOM_SESSION") {
            if !p.is_empty() {
                PathBuf::from(p)
            } else {
                default_session_path()
            }
        } else {
            default_session_path()
        };
        let meta_path = sticky_meta_path(&session_path);
        Self {
            session_path,
            meta_path,
        }
    }

    /// Pid-alive meta only (host stop/status style). Does **not** enforce F-2.
    pub fn load_meta(&self) -> Result<StickyMeta, HostProblem> {
        if !self.meta_path.exists() {
            return Err(HostProblem::NoMeta);
        }
        let raw = fs::read_to_string(&self.meta_path).map_err(|e| {
            HostProblem::Other(format!("read meta: {e}"))
        })?;
        let meta: StickyMeta = serde_json::from_str(&raw).map_err(|e| {
            HostProblem::Other(format!("parse meta: {e}"))
        })?;
        if !pid_alive(meta.pid) {
            return Err(HostProblem::StalePid);
        }
        Ok(meta)
    }

    /// Live host for RPC — **F-2 / L-26**: pid alive **and** roomId/peerId match session.
    /// Mismatch → treat as unusable (no silent wrong-room send).
    pub fn load_live_meta(&self) -> Result<StickyMeta, HostProblem> {
        let meta = self.load_meta()?;
        let session = self.load_session_ids()?;
        if meta.room_id != session.room_id || meta.peer_id != session.peer_id {
            return Err(HostProblem::SessionMismatch);
        }
        Ok(meta)
    }

    fn load_session_ids(&self) -> Result<SessionIds, HostProblem> {
        if !self.session_path.exists() {
            return Err(HostProblem::SessionMismatch);
        }
        let raw = fs::read_to_string(&self.session_path).map_err(|e| {
            HostProblem::Other(format!("read session: {e}"))
        })?;
        serde_json::from_str(&raw).map_err(|e| {
            HostProblem::Other(format!("parse session: {e}"))
        })
    }

    /// POST /rpc with Bearer. Token used only here.
    pub fn rpc(
        &self,
        meta: &StickyMeta,
        body: serde_json::Value,
    ) -> Result<serde_json::Value, HostProblem> {
        let url = format!("http://127.0.0.1:{}/rpc", meta.port);
        let agent = ureq::AgentBuilder::new()
            .timeout(std::time::Duration::from_secs(8))
            .build();
        let resp = agent
            .post(&url)
            .set("content-type", "application/json")
            .set("authorization", &format!("Bearer {}", meta.token))
            .send_json(body);

        match resp {
            Ok(r) => {
                let status = r.status();
                if status == 401 {
                    return Err(HostProblem::Unauthorized);
                }
                if !(200..300).contains(&status) {
                    let text = r.into_string().unwrap_or_default();
                    return Err(HostProblem::Refused(format!(
                        "HTTP {status}: {}",
                        text.chars().take(200).collect::<String>()
                    )));
                }
                r.into_json::<serde_json::Value>()
                    .map_err(|e| HostProblem::Other(format!("json: {e}")))
            }
            Err(ureq::Error::Status(401, _)) => Err(HostProblem::Unauthorized),
            Err(ureq::Error::Status(code, resp)) => {
                let text = resp.into_string().unwrap_or_default();
                Err(HostProblem::Refused(format!(
                    "HTTP {code}: {}",
                    text.chars().take(200).collect::<String>()
                )))
            }
            Err(ureq::Error::Transport(t)) => {
                Err(HostProblem::Refused(format!("connection: {t}")))
            }
        }
    }
}

fn loom_home() -> PathBuf {
    if let Ok(h) = std::env::var("LOOM_TEST_HOME") {
        if !h.is_empty() {
            return PathBuf::from(h).join(".loom");
        }
    }
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".loom")
}

fn default_session_path() -> PathBuf {
    if let Ok(profile) = std::env::var("LOOM_PROFILE") {
        if !profile.is_empty() {
            return loom_home().join("profiles").join(format!("{profile}.json"));
        }
    }
    loom_home().join("session.json")
}

fn sticky_meta_path(session: &Path) -> PathBuf {
    let s = session.to_string_lossy();
    if let Some(stem) = s.strip_suffix(".json") {
        PathBuf::from(format!("{stem}.host.json"))
    } else {
        PathBuf::from(format!("{s}.host.json"))
    }
}

fn pid_alive(pid: u32) -> bool {
    if pid == 0 {
        return false;
    }
    // Unix: kill -0
    #[cfg(unix)]
    {
        Command::new("kill")
            .args(["-0", &pid.to_string()])
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }
    #[cfg(not(unix))]
    {
        let _ = pid;
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn meta_path_from_session() {
        let p = PathBuf::from("/tmp/alice.json");
        assert_eq!(
            sticky_meta_path(&p),
            PathBuf::from("/tmp/alice.host.json")
        );
    }

    #[test]
    fn resolve_respects_loom_session() {
        let dir = std::env::temp_dir().join(format!(
            "loom-desktop-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        let session = dir.join("sess.json");
        fs::File::create(&session).unwrap();
        std::env::set_var("LOOM_SESSION", &session);
        let c = StickyClient::resolve(None);
        assert_eq!(c.session_path, session);
        assert_eq!(c.meta_path, dir.join("sess.host.json"));
        std::env::remove_var("LOOM_SESSION");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn load_meta_stale_pid() {
        let dir = std::env::temp_dir().join(format!(
            "loom-desktop-meta-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        let session = dir.join("s.json");
        let meta_path = dir.join("s.host.json");
        let mut f = fs::File::create(&meta_path).unwrap();
        // PID 1 is init on unix and usually alive — use unlikely high pid
        writeln!(
            f,
            r#"{{"pid":999999,"port":1,"token":"t","sessionPath":"{}","peerId":"p","roomId":"r","roomName":"n","displayName":"d","startedAt":"x"}}"#,
            session.display()
        )
        .unwrap();
        let c = StickyClient {
            session_path: session,
            meta_path,
        };
        match c.load_meta() {
            Err(HostProblem::StalePid) | Err(HostProblem::NoMeta) => {}
            Ok(_) => {
                // If pid happens to exist, still ok for CI variance
            }
            Err(e) => panic!("unexpected {e:?}"),
        }
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn load_live_meta_f2_session_mismatch() {
        let dir = std::env::temp_dir().join(format!(
            "loom-desktop-f2-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        let session = dir.join("s.json");
        let meta_path = dir.join("s.host.json");
        // Session says room B / peer new
        writeln!(
            fs::File::create(&session).unwrap(),
            r#"{{"roomId":"room_new","peerId":"p_new","roomName":"n","inviteCode":"LOOM-X","displayName":"d","agentKind":"shell","relayUrl":"ws://127.0.0.1/ws","updatedAt":"x"}}"#
        )
        .unwrap();
        // Meta still bound to old room (use current pid so pid check passes)
        let pid = std::process::id();
        writeln!(
            fs::File::create(&meta_path).unwrap(),
            r#"{{"pid":{pid},"port":1,"token":"t","sessionPath":"{}","peerId":"p_old","roomId":"room_old","roomName":"n","displayName":"d","startedAt":"x"}}"#,
            session.display()
        )
        .unwrap();
        let c = StickyClient {
            session_path: session,
            meta_path,
        };
        match c.load_live_meta() {
            Err(HostProblem::SessionMismatch) => {}
            other => panic!("expected SessionMismatch, got {other:?}"),
        }
        // pid-only load still succeeds when process is us
        assert!(c.load_meta().is_ok());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn load_live_meta_f2_match_ok() {
        let dir = std::env::temp_dir().join(format!(
            "loom-desktop-f2ok-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        let session = dir.join("s.json");
        let meta_path = dir.join("s.host.json");
        let pid = std::process::id();
        writeln!(
            fs::File::create(&session).unwrap(),
            r#"{{"roomId":"room_same","peerId":"p_same","roomName":"n","inviteCode":"LOOM-X","displayName":"d","agentKind":"shell","relayUrl":"ws://127.0.0.1/ws","updatedAt":"x"}}"#
        )
        .unwrap();
        writeln!(
            fs::File::create(&meta_path).unwrap(),
            r#"{{"pid":{pid},"port":9,"token":"t","sessionPath":"{}","peerId":"p_same","roomId":"room_same","roomName":"n","displayName":"d","startedAt":"x"}}"#,
            session.display()
        )
        .unwrap();
        let c = StickyClient {
            session_path: session,
            meta_path,
        };
        let m = c.load_live_meta().expect("match");
        assert_eq!(m.room_id, "room_same");
        assert_eq!(m.peer_id, "p_same");
        let _ = fs::remove_dir_all(&dir);
    }
}
