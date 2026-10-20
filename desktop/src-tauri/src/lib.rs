//! Desktop shell of the untis GUI.
//!
//! The shell is deliberately thin: it starts the Go backend (`untisd`)
//! as a sidecar, reads the connection line the backend prints on start
//! and hands it to the frontend through the `backend_info` command. All
//! application logic lives in the backend and the TypeScript frontend.

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{Manager, RunEvent, State};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tokio::sync::watch;

/// Connection details printed by `untisd` as its first stdout line.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BackendInfo {
    pub port: u16,
    pub token: String,
    pub version: String,
}

type Handshake = Result<BackendInfo, String>;

/// Parses the first complete line of the sidecar's stdout. Returns None
/// while no full line has arrived yet.
fn parse_handshake(buf: &str) -> Option<Handshake> {
    let (line, _) = buf.split_once('\n')?;
    Some(
        serde_json::from_str::<BackendInfo>(line.trim())
            .map_err(|e| format!("unexpected handshake from untisd: {e}")),
    )
}

/// Shared state: the handshake (once known) and the running child.
struct Backend {
    info: watch::Receiver<Option<Handshake>>,
    child: Mutex<Option<CommandChild>>,
}

/// Returns the backend connection details, waiting for the sidecar to
/// start if necessary.
#[tauri::command]
async fn backend_info(state: State<'_, Backend>) -> Result<BackendInfo, String> {
    let mut rx = state.info.clone();
    let res = rx
        .wait_for(|v| v.is_some())
        .await
        .map_err(|_| "backend stopped before it was ready".to_string())?;
    res.clone().expect("checked by wait_for")
}

fn spawn_backend(app: &tauri::AppHandle) -> Result<(CommandChild, watch::Receiver<Option<Handshake>>), String> {
    let (tx, rx) = watch::channel(None);
    let (mut events, child) = app
        .shell()
        .sidecar("untisd")
        .map_err(|e| format!("untisd sidecar missing: {e}"))?
        // The backend exits when our end of its stdin closes, so it never
        // outlives the shell, even if the shell is killed.
        .args(["--watch-stdin"])
        .spawn()
        .map_err(|e| format!("could not start untisd: {e}"))?;

    tauri::async_runtime::spawn(async move {
        let mut buf = String::new();
        let mut ready = false;
        while let Some(ev) = events.recv().await {
            match ev {
                CommandEvent::Stdout(bytes) if !ready => {
                    buf.push_str(&String::from_utf8_lossy(&bytes));
                    if let Some(parsed) = parse_handshake(&buf) {
                        ready = true;
                        let _ = tx.send(Some(parsed));
                    }
                }
                CommandEvent::Stderr(bytes) => eprint!("{}", String::from_utf8_lossy(&bytes)),
                CommandEvent::Error(err) => eprintln!("untisd: {err}"),
                CommandEvent::Terminated(status) => {
                    eprintln!("untisd exited: {:?}", status.code);
                    if !ready {
                        let _ = tx.send(Some(Err(format!("untisd exited early (code {:?})", status.code))));
                    }
                    break;
                }
                _ => {}
            }
        }
    });
    Ok((child, rx))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let handle = app.handle();
            let backend = match spawn_backend(handle) {
                Ok((child, info)) => Backend { info, child: Mutex::new(Some(child)) },
                Err(err) => {
                    eprintln!("{err}");
                    let (_tx, info) = watch::channel(Some(Err(err)));
                    Backend { info, child: Mutex::new(None) }
                }
            };
            app.manage(backend);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![backend_info])
        .build(tauri::generate_context!())
        .expect("error while building the untis desktop app");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            if let Some(child) = handle.state::<Backend>().child.lock().unwrap().take() {
                let _ = child.kill();
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn waits_for_a_full_line() {
        assert!(parse_handshake(r#"{"port": 1"#).is_none());
    }

    #[test]
    fn parses_the_first_line() {
        let info = parse_handshake("{\"port\":41234,\"token\":\"abc\",\"version\":\"dev\"}\r\nlog line\n")
            .unwrap()
            .unwrap();
        assert_eq!(info.port, 41234);
        assert_eq!(info.token, "abc");
        assert_eq!(info.version, "dev");
    }

    #[test]
    fn reports_garbage() {
        let err = parse_handshake("panic: boom\n").unwrap().unwrap_err();
        assert!(err.contains("unexpected handshake"));
    }
}
