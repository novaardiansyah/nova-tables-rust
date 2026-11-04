use serde_json::Value;

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
