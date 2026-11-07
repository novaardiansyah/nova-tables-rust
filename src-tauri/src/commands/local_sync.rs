use crate::database::local_store;
use serde_json::Value;

#[tauri::command]
pub fn local_upsert_folder(input: Value) -> Result<Value, String> {
  let uid = input
    .get("id")
    .or_else(|| input.get("uid"))
    .and_then(|v| v.as_str())
    .ok_or_else(|| "Folder id/uid is required".to_string())?;
  let name = input.get("name").and_then(|v| v.as_str()).unwrap_or("");
  let parent_id = input
    .get("parentId")
    .or_else(|| input.get("parent_id"))
    .and_then(|v| v.as_str());
  local_store::upsert_folder(uid, name, parent_id)
}

#[tauri::command]
pub fn local_delete_folder(id: String) -> Result<Value, String> {
  let deleted = local_store::delete_folder(&id)?;
  Ok(serde_json::json!({ "ok": true, "deleted": deleted }))
}

#[tauri::command]
pub fn local_list_folders() -> Result<Value, String> {
  let folders = local_store::list_folders()?;
  Ok(serde_json::json!({ "ok": true, "folders": folders }))
}

#[tauri::command]
pub fn local_upsert_connection(input: Value) -> Result<Value, String> {
  let saved = local_store::upsert_connection(&input)?;
  Ok(serde_json::json!({ "ok": true, "connection": saved }))
}

#[tauri::command]
pub fn local_delete_connection(id: String) -> Result<Value, String> {
  let deleted = local_store::delete_connection(&id)?;
  Ok(serde_json::json!({ "ok": true, "deleted": deleted }))
}

#[tauri::command]
pub fn local_list_connections() -> Result<Value, String> {
  let connections = local_store::list_connections()?;
  Ok(serde_json::json!({ "ok": true, "connections": connections }))
}

#[tauri::command]
pub fn local_upsert_saved_query(input: Value) -> Result<Value, String> {
  let saved = local_store::upsert_saved_query(&input)?;
  Ok(serde_json::json!({ "ok": true, "query": saved }))
}

#[tauri::command]
pub fn local_delete_saved_query(id: String) -> Result<Value, String> {
  let deleted = local_store::delete_saved_query(&id)?;
  Ok(serde_json::json!({ "ok": true, "deleted": deleted }))
}

#[tauri::command]
pub fn local_list_saved_queries(
  connection_id: Option<String>,
  database: Option<String>,
) -> Result<Value, String> {
  let queries = local_store::list_saved_queries(connection_id.as_deref(), database.as_deref())?;
  Ok(serde_json::json!({ "ok": true, "queries": queries }))
}

#[tauri::command]
pub fn local_upsert_meta(key: String, value: Value) -> Result<Value, String> {
  let stored = local_store::upsert_meta(&key, &value)?;
  Ok(serde_json::json!({ "ok": true, "value": stored }))
}

#[tauri::command]
pub fn local_get_meta(key: String) -> Result<Value, String> {
  match local_store::get_meta(&key)? {
    Some(value) => Ok(serde_json::json!({ "ok": true, "value": value })),
    None => Ok(serde_json::json!({ "ok": true, "value": null })),
  }
}

#[tauri::command]
pub fn local_delete_meta(key: String) -> Result<Value, String> {
  let deleted = local_store::delete_meta(&key)?;
  Ok(serde_json::json!({ "ok": true, "deleted": deleted }))
}

#[tauri::command]
pub fn local_unsynced_batch() -> Result<Value, String> {
  local_store::get_unsynced_batch()
}

#[tauri::command]
pub fn local_pending_delete_uids(entity: String) -> Result<Value, String> {
  let uids = local_store::pending_delete_uids(&entity)?;
  Ok(serde_json::json!({ "ok": true, "uids": uids }))
}

#[tauri::command]
pub fn local_clean_synced_batch(confirmed: Value) -> Result<Value, String> {
  local_store::clean_synced_batch(&confirmed)
}
