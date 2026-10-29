use crate::os_integration::{OsIntegration, SystemInfo};

#[tauri::command]
pub fn get_system_info() -> SystemInfo {
  OsIntegration::get_system_info()
}

#[tauri::command]
pub fn greet(name: &str) -> String {
  format!("Hello, {}! Welcome to Nova Tables.", name)
}
