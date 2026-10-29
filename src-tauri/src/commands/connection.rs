use crate::database::local_store::{DbConnectionItem, FolderItem, LocalStore};
use crate::file_system::FileSystem;
use serde_json::{json, Value};

#[tauri::command]
pub fn list_connections() -> Result<Value, String> {
  let db_path = FileSystem::get_database_path()?;
  let conn = LocalStore::init(&db_path).map_err(|e| e.to_string())?;
  let connections = LocalStore::list_connections(&conn).map_err(|e| e.to_string())?;
  Ok(json!({
    "ok": true,
    "connections": connections
  }))
}

#[tauri::command]
pub fn save_connection(connection: DbConnectionItem) -> Result<Value, String> {
  let db_path = FileSystem::get_database_path()?;
  let conn = LocalStore::init(&db_path).map_err(|e| e.to_string())?;
  LocalStore::save_connection(&conn, &connection).map_err(|e| e.to_string())?;
  Ok(json!({
    "ok": true,
    "connection": connection
  }))
}

#[tauri::command]
pub fn delete_connection(id: String) -> Result<Value, String> {
  let db_path = FileSystem::get_database_path()?;
  let conn = LocalStore::init(&db_path).map_err(|e| e.to_string())?;
  LocalStore::delete_connection(&conn, &id).map_err(|e| e.to_string())?;
  Ok(json!({
    "ok": true
  }))
}

#[tauri::command]
pub fn list_folders() -> Result<Value, String> {
  let db_path = FileSystem::get_database_path()?;
  let conn = LocalStore::init(&db_path).map_err(|e| e.to_string())?;
  let folders = LocalStore::list_folders(&conn).map_err(|e| e.to_string())?;
  Ok(json!({
    "ok": true,
    "folders": folders
  }))
}

#[tauri::command]
pub fn save_folder(folder: FolderItem) -> Result<Value, String> {
  let db_path = FileSystem::get_database_path()?;
  let conn = LocalStore::init(&db_path).map_err(|e| e.to_string())?;
  LocalStore::save_folder(&conn, &folder).map_err(|e| e.to_string())?;
  Ok(json!({
    "ok": true,
    "folder": folder
  }))
}

#[tauri::command]
pub fn delete_folder(id: String) -> Result<Value, String> {
  let db_path = FileSystem::get_database_path()?;
  let conn = LocalStore::init(&db_path).map_err(|e| e.to_string())?;
  LocalStore::delete_folder(&conn, &id).map_err(|e| e.to_string())?;
  Ok(json!({
    "ok": true
  }))
}

#[tauri::command]
pub fn test_connection(connection: DbConnectionItem) -> Result<Value, String> {
  // Lightweight ping / socket connection test
  use std::net::TcpStream;
  use std::time::Duration;

  let addr = format!("{}:{}", connection.host, connection.port);
  match TcpStream::connect_timeout(
    &addr.parse().unwrap_or_else(|_| "127.0.0.1:1433".parse().unwrap()),
    Duration::from_secs(4),
  ) {
    Ok(_) => Ok(json!({
      "ok": true,
      "message": "Connection successful"
    })),
    Err(e) => Ok(json!({
      "ok": false,
      "error": {
        "message": format!("Could not connect to {}: {}", addr, e)
      }
    })),
  }
}
