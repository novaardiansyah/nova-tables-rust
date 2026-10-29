use serde_json::{json, Value};

#[tauri::command]
pub fn execute_query(sql: String, connection_id: Option<String>) -> Result<Value, String> {
  // Query execution command handler
  let _ = connection_id;
  Ok(json!({
    "ok": true,
    "columns": [],
    "rows": [],
    "rowsAffected": 0,
    "executionTimeMs": 0,
    "sql": sql
  }))
}

#[tauri::command]
pub fn list_databases(connection_id: Option<String>) -> Result<Value, String> {
  let _ = connection_id;
  Ok(json!({
    "ok": true,
    "databases": [
      { "name": "master" },
      { "name": "model" },
      { "name": "msdb" },
      { "name": "tempdb" }
    ]
  }))
}

#[tauri::command]
pub fn list_tables(connection_id: Option<String>, database: Option<String>) -> Result<Value, String> {
  let _ = connection_id;
  let _ = database;
  Ok(json!({
    "ok": true,
    "tables": []
  }))
}
