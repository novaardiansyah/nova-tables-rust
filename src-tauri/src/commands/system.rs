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
pub fn get_settings() -> Value {
  json!({
    "ok": true,
    "settings": null
  })
}

#[tauri::command]
pub fn save_settings(settings: Value) -> Value {
  json!({
    "ok": true,
    "settings": settings
  })
}
