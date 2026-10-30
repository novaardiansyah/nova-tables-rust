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
pub fn get_workspace_state() -> Result<Value, String> {
  let db_path = crate::file_system::FileSystem::get_database_path()?;
  let conn = crate::database::local_store::LocalStore::init(&db_path).map_err(|e| e.to_string())?;
  let stored = crate::database::local_store::LocalStore::get_meta(&conn, "workspace").map_err(|e| e.to_string())?;

  if let Some(json_str) = stored {
    if let Ok(val) = serde_json::from_str::<Value>(&json_str) {
      return Ok(json!({
        "ok": true,
        "workspace": val
      }));
    }
  }

  Ok(json!({
    "ok": true,
    "workspace": null
  }))
}

#[tauri::command]
pub fn save_workspace_state(workspace: Value) -> Result<Value, String> {
  let db_path = crate::file_system::FileSystem::get_database_path()?;
  let conn = crate::database::local_store::LocalStore::init(&db_path).map_err(|e| e.to_string())?;
  let json_str = serde_json::to_string(&workspace).map_err(|e| e.to_string())?;
  crate::database::local_store::LocalStore::set_meta(&conn, "workspace", &json_str).map_err(|e| e.to_string())?;

  Ok(json!({
    "ok": true,
    "workspace": workspace
  }))
}

fn requested_file_name(default_path: &str) -> String {
  std::path::Path::new(default_path)
    .file_name()
    .map(|name| name.to_string_lossy().to_string())
    .unwrap_or_else(|| default_path.to_string())
}

#[tauri::command]
pub async fn save_file(app: tauri::AppHandle, input: Value) -> Result<Value, String> {
  use tauri_plugin_dialog::DialogExt;

  let file_path = input
    .get("filePath")
    .or_else(|| input.get("file_path"))
    .and_then(|v| v.as_str())
    .unwrap_or("");
  let default_path = input
    .get("defaultPath")
    .or_else(|| input.get("default_path"))
    .and_then(|v| v.as_str())
    .unwrap_or("");
  let content = input
    .get("content")
    .and_then(|v| v.as_str())
    .unwrap_or("");

  let target = if file_path.is_empty() {
    let mut dialog = app.dialog().file().set_title("Save File");

    if !default_path.is_empty() {
      dialog = dialog.set_file_name(requested_file_name(default_path));
    }

    let filters = input
      .get("filters")
      .and_then(|v| v.as_array())
      .cloned()
      .unwrap_or_default();

    for filter in filters {
      let name = filter.get("name").and_then(|v| v.as_str()).unwrap_or("Files");
      let extensions: Vec<String> = filter
        .get("extensions")
        .and_then(|v| v.as_array())
        .map(|items| {
          items
            .iter()
            .filter_map(|item| item.as_str().map(|ext| ext.to_string()))
            .collect()
        })
        .unwrap_or_default();

      if !extensions.is_empty() {
        let refs: Vec<&str> = extensions.iter().map(|ext| ext.as_str()).collect();
        dialog = dialog.add_filter(name, &refs);
      }
    }

    let (sender, receiver) = tokio::sync::oneshot::channel();
    dialog.save_file(move |path| {
      let _ = sender.send(path);
    });

    match receiver.await.map_err(|e| e.to_string())? {
      Some(path) => Some(path.into_path().map_err(|e| e.to_string())?),
      None => None,
    }
  } else {
    Some(std::path::PathBuf::from(file_path))
  };

  match target {
    Some(path) => {
      std::fs::write(&path, content).map_err(|e| e.to_string())?;
      Ok(json!({
        "ok": true,
        "saved": true,
        "canceled": false,
        "filePath": path.to_string_lossy()
      }))
    }
    None => Ok(json!({
      "ok": true,
      "saved": false,
      "canceled": true
    })),
  }
}
