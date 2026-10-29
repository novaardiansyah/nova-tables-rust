use crate::os_integration::{OsIntegration, SystemInfo};
use serde_json::{json, Value};

#[tauri::command]
pub fn get_system_info() -> SystemInfo {
  OsIntegration::get_system_info()
}

#[tauri::command]
pub fn get_app_info() -> Value {
  json!({
    "name": "Nova Tables",
    "version": env!("CARGO_PKG_VERSION")
  })
}

#[tauri::command]
pub fn greet(name: &str) -> String {
  format!("Hello, {}! Welcome to Nova Tables.", name)
}

#[tauri::command]
pub fn get_settings() -> Result<Value, String> {
  let db_path = crate::file_system::FileSystem::get_database_path()?;
  let conn = crate::database::local_store::LocalStore::init(&db_path).map_err(|e| e.to_string())?;
  let stored = crate::database::local_store::LocalStore::get_meta(&conn, "settings").map_err(|e| e.to_string())?;

  if let Some(json_str) = stored {
    if let Ok(val) = serde_json::from_str::<Value>(&json_str) {
      return Ok(json!({
        "ok": true,
        "settings": val
      }));
    }
  }

  Ok(json!({
    "ok": true,
    "settings": null
  }))
}

#[tauri::command]
pub fn save_settings(settings: Value) -> Result<Value, String> {
  let db_path = crate::file_system::FileSystem::get_database_path()?;
  let conn = crate::database::local_store::LocalStore::init(&db_path).map_err(|e| e.to_string())?;
  let json_str = serde_json::to_string(&settings).map_err(|e| e.to_string())?;
  crate::database::local_store::LocalStore::set_meta(&conn, "settings", &json_str).map_err(|e| e.to_string())?;

  Ok(json!({
    "ok": true,
    "settings": settings
  }))
}

#[tauri::command]
pub fn save_file(input: Value) -> Result<Value, String> {
  let file_path = input
    .get("filePath")
    .or_else(|| input.get("file_path"))
    .and_then(|v| v.as_str())
    .unwrap_or("");
  let content = input
    .get("content")
    .and_then(|v| v.as_str())
    .unwrap_or("");

  if !file_path.is_empty() {
    std::fs::write(file_path, content).map_err(|e| e.to_string())?;
  }
  Ok(json!({ "ok": true }))
}
