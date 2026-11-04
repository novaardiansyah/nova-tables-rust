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

      let (title, message, badge_text, status_color, status_bg, status_border, icon_svg) = if !error.is_empty() {
        (
          "Sign in Failed",
          "Authentication cancelled or denied.",
          "Authentication issue",
          "#f87171",
          "rgba(239, 68, 68, 0.12)",
          "rgba(239, 68, 68, 0.28)",
          "<svg width=\"28\" height=\"28\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#f87171\" stroke-width=\"2.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"12\" r=\"10\"></circle><line x1=\"12\" y1=\"8\" x2=\"12\" y2=\"12\"></line><line x1=\"12\" y1=\"16\" x2=\"12.01\" y2=\"16\"></line></svg>",
        )
      } else if !code.is_empty() {
        (
          "Sign in Successful",
          "You may return to Nova Tables.",
          "Authentication complete",
          "#10b981",
          "rgba(16, 185, 129, 0.12)",
          "rgba(16, 185, 129, 0.28)",
          "<svg width=\"28\" height=\"28\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#10b981\" stroke-width=\"2.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M22 11.08V12a10 10 0 1 1-5.93-9.14\"></path><polyline points=\"22 4 12 14.01 9 11.01\"></polyline></svg>",
        )
      } else {
        (
          "Sign in",
          "Processing...",
          "Authenticating",
          "#3b82f6",
          "rgba(59, 130, 246, 0.12)",
          "rgba(59, 130, 246, 0.28)",
          "<svg width=\"28\" height=\"28\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#3b82f6\" stroke-width=\"2.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"12\" r=\"10\"></circle></svg>",
        )
      };

      let html = format!(
        "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>{} — Nova Tables</title><style>*,*::before,*::after{{box-sizing:border-box;margin:0;padding:0;}}:root{{color-scheme:light dark;--bg:#09100c;--card-bg:#111a14;--card-border:rgba(255,255,255,0.08);--ink:#eef3ef;--ink-muted:#9aa79f;--line:rgba(255,255,255,0.08);}}@media (prefers-color-scheme: light){{:root{{--bg:#f7f8f7;--card-bg:#ffffff;--card-border:rgba(8,15,11,0.12);--ink:#080f0b;--ink-muted:#53615a;--line:rgba(8,15,11,0.08);}}}}body{{background-color:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;-webkit-font-smoothing:antialiased;}}.wrapper{{width:100%;max-width:440px;display:flex;flex-direction:column;align-items:center;gap:20px;}}.brand{{display:inline-flex;align-items:center;gap:10px;text-decoration:none;color:var(--ink);font-weight:600;font-size:15px;letter-spacing:-0.01em;}}.card{{background:var(--card-bg);border:1px solid var(--card-border);border-radius:16px;padding:36px 32px;width:100%;text-align:center;box-shadow:0 20px 40px -15px rgba(0,0,0,0.35);position:relative;overflow:hidden;}}.card::before{{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:{};}}.badge{{display:inline-flex;align-items:center;gap:6px;background:{};border:1px solid {};color:{};font-size:11px;font-weight:600;padding:4px 10px;border-radius:9999px;margin-bottom:20px;text-transform:uppercase;letter-spacing:0.04em;}}.icon-wrapper{{width:56px;height:56px;margin:0 auto 20px auto;border-radius:14px;background:{};border:1px solid {};display:flex;align-items:center;justify-content:center;}}h1{{font-size:21px;font-weight:700;letter-spacing:-0.02em;margin-bottom:8px;color:var(--ink);}}p{{color:var(--ink-muted);font-size:14px;line-height:1.55;margin-bottom:24px;}}.footer-action{{border-top:1px solid var(--line);padding-top:20px;display:flex;flex-direction:column;gap:8px;align-items:center;}}.action-hint{{font-size:12px;color:var(--ink-muted);}}</style></head><body><div class=\"wrapper\"><div class=\"brand\"><span>Nova Tables</span></div><div class=\"card\"><div class=\"badge\">{}</div><div class=\"icon-wrapper\">{}</div><h1>{}</h1><p>{}</p><div class=\"footer-action\"><span class=\"action-hint\">You may now close this browser tab and continue using Nova Tables.</span></div></div></div></body></html>",
        title, status_color, status_bg, status_border, status_color, status_bg, status_border, badge_text, icon_svg, title, message
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
