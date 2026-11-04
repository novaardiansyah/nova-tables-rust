use serde_json::Value;
use std::collections::HashMap;
use std::sync::Mutex;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

static OAUTH_RESULTS: Mutex<Option<HashMap<String, Result<String, String>>>> = Mutex::new(None);

#[tauri::command]
pub async fn start_oauth_listener(state: String) -> Result<Value, String> {
  let listener = TcpListener::bind("127.0.0.1:0")
    .await
    .map_err(|e| format!("Failed to bind local OAuth listener: {}", e))?;
  let port = listener
    .local_addr()
    .map_err(|e| format!("Failed to read local OAuth port: {}", e))?
    .port();

  let target_state = state.clone();

  tokio::spawn(async move {
    let timeout = tokio::time::Duration::from_secs(180);
    let accept_res = tokio::time::timeout(timeout, listener.accept()).await;

    if let Ok(Ok((mut stream, _))) = accept_res {
      let mut buffer = [0u8; 4096];
      let bytes_read = stream.read(&mut buffer).await.unwrap_or(0);
      let request = String::from_utf8_lossy(&buffer[..bytes_read]);

      let path = request.lines().next().unwrap_or("").to_string();
      let query_str = path
        .split_whitespace()
        .nth(1)
        .and_then(|p| p.split_once('?'))
        .map(|(_, q)| q)
        .unwrap_or("");

      let mut code = String::new();
      let mut req_state = String::new();
      let mut error = String::new();

      for part in query_str.split('&') {
        if let Some((k, v)) = part.split_once('=') {
          let decoded = urlencoding_decode(v);
          if k == "code" {
            code = decoded;
          } else if k == "state" {
            req_state = decoded;
          } else if k == "error" {
            error = decoded;
          }
        }
      }

      let (title, message, color) = if !error.is_empty() {
        ("Sign in Failed", "Authentication cancelled or denied.", "#ef4444")
      } else if !code.is_empty() {
        ("Sign in Successful", "You may return to Nova Tables.", "#10b981")
      } else {
        ("Sign in", "Processing...", "#3b82f6")
      };

      let html = format!(
        "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>{} - Nova Tables</title><style>body{{background-color:#0b0e13;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;}}.card{{background:#151922;border:1px solid #232a3b;border-radius:12px;padding:32px;max-width:420px;text-align:center;box-shadow:0 20px 25px -5px rgba(0,0,0,0.5);}}h1{{color:{};font-size:20px;margin:0 0 12px 0;}}p{{color:#94a3b8;font-size:14px;line-height:1.5;margin:0;}}</style></head><body><div class=\"card\"><h1>{}</h1><p>{}</p></div></body></html>",
        title, color, title, message
      );

      let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        html.len(),
        html
      );

      let _ = stream.write_all(response.as_bytes()).await;
      let _ = stream.flush().await;

      let key = if !req_state.is_empty() {
        req_state
      } else {
        target_state
      };

      let mut guard = OAUTH_RESULTS.lock().unwrap();
      let map = guard.get_or_insert_with(HashMap::new);

      if !error.is_empty() {
        map.insert(key, Err(format!("OAuth error: {}", error)));
      } else if !code.is_empty() {
        map.insert(key, Ok(code));
      } else {
        map.insert(key, Err("No code returned from OAuth callback".to_string()));
      }
    }
  });

  Ok(serde_json::json!({
    "port": port,
    "redirectUri": format!("http://127.0.0.1:{}/callback", port),
  }))
}

#[tauri::command]
pub fn check_oauth_result(state: String) -> Result<Value, String> {
  let mut guard = OAUTH_RESULTS.lock().unwrap();
  if let Some(map) = guard.as_mut() {
    if let Some(res) = map.remove(&state) {
      return match res {
        Ok(code) => Ok(serde_json::json!({ "status": "completed", "code": code })),
        Err(err) => Ok(serde_json::json!({ "status": "failed", "error": err })),
      };
    }
  }

  Ok(serde_json::json!({ "status": "pending" }))
}

fn urlencoding_decode(s: &str) -> String {
  let mut res = Vec::new();
  let bytes = s.as_bytes();
  let mut i = 0;
  while i < bytes.len() {
    if bytes[i] == b'%' && i + 2 < bytes.len() {
      if let Ok(val) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
        res.push(val);
        i += 3;
        continue;
      }
    } else if bytes[i] == b'+' {
      res.push(b' ');
      i += 1;
      continue;
    }
    res.push(bytes[i]);
    i += 1;
  }
  String::from_utf8_lossy(&res).to_string()
}

#[tauri::command]
pub fn auth_register(
  _username: String,
  _password_hash: String,
  _salt: String,
) -> Result<Value, String> {
  Ok(serde_json::json!({ "ok": true }))
}

#[tauri::command]
pub fn auth_get_user_credentials(
  _username: String,
) -> Result<Option<Value>, String> {
  Ok(None)
}

#[tauri::command]
pub fn auth_create_session(_user_id: String) -> Result<Value, String> {
  Ok(serde_json::json!({ "ok": true }))
}

#[tauri::command]
pub fn auth_get_current_session() -> Result<Option<Value>, String> {
  Ok(None)
}

#[tauri::command]
pub fn auth_logout() -> Result<Value, String> {
  Ok(serde_json::json!({ "ok": true }))
}
