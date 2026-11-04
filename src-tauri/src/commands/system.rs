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
    Ok(json!({
      "ok": true,
      "settings": null
    }))
}

#[tauri::command]
pub fn save_settings(settings: Value) -> Result<Value, String> {
    Ok(json!({
      "ok": true,
      "settings": settings
    }))
}

#[tauri::command]
pub fn get_workspace_state() -> Result<Value, String> {
    Ok(json!({
      "ok": true,
      "workspace": null
    }))
}

#[tauri::command]
pub fn save_workspace_state(workspace: Value) -> Result<Value, String> {
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
    let content = input.get("content").and_then(|v| v.as_str()).unwrap_or("");

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
            let name = filter
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("Files");
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

#[tauri::command]
pub async fn select_import_file(app: tauri::AppHandle, input: Option<Value>) -> Result<Value, String> {
    use tauri_plugin_dialog::DialogExt;

    let mut dialog = app.dialog().file().set_title("Select File");

    let filters = input
        .as_ref()
        .and_then(|inp| inp.get("filters"))
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_else(|| {
            vec![
                json!({
                    "name": "Nova Tables (*.nova-tables)",
                    "extensions": ["nova-tables"]
                })
            ]
        });

    for filter in filters {
        let name = filter
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("Files");
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
    dialog.pick_file(move |path| {
        let _ = sender.send(path);
    });

    match receiver.await.map_err(|e| e.to_string())? {
        Some(path) => {
            let std_path = path.into_path().map_err(|e| e.to_string())?;
            let is_nova_tables = std_path
                .extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| ext.eq_ignore_ascii_case("nova-tables"))
                .unwrap_or(false);
            if !is_nova_tables {
                return Err("Only .nova-tables files are supported".to_string());
            }
            let content = std::fs::read_to_string(&std_path).map_err(|e| e.to_string())?;
            let file_name = std_path
                .file_name()
                .map(|name| name.to_string_lossy().to_string())
                .unwrap_or_default();
            Ok(json!({
                "canceled": false,
                "filePath": std_path.to_string_lossy(),
                "fileName": file_name,
                "content": content
            }))
        }
        None => Ok(json!({
            "canceled": true
        })),
    }
}
