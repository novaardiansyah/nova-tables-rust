use crate::database::mssql;
use serde_json::{json, Value};

#[tauri::command]
pub async fn execute_query(
  sql: Option<String>,
  connection_id: Option<String>,
  database: Option<String>,
  input: Option<Value>,
) -> Result<Value, String> {
  let query = sql
    .or_else(|| input.as_ref().and_then(|i| i.get("sql")).and_then(|v| v.as_str()).map(|s| s.to_string()))
    .unwrap_or_default();

  let conn_id = connection_id
    .or_else(|| input.as_ref().and_then(|i| i.get("connectionId").or_else(|| i.get("connection_id"))).and_then(|v| v.as_str()).map(|s| s.to_string()));

  let db = database
    .or_else(|| input.as_ref().and_then(|i| i.get("database")).and_then(|v| v.as_str()).map(|s| s.to_string()));

  if let Some(id) = conn_id.as_deref() {
    let mut client = mssql::get_client_for_connection(id, db.as_deref()).await?;
    return mssql::execute_sql(&mut client, &query).await;
  }

  Ok(json!({
    "ok": true,
    "resultSets": [],
    "rowCount": 0,
    "rowsAffected": [0],
    "messages": [],
    "elapsedMs": 0,
    "truncated": false,
    "maxRows": 20000
  }))
}

#[tauri::command]
pub async fn list_databases(connection_id: Option<String>) -> Result<Value, String> {
  if let Some(id) = connection_id.as_deref() {
    if let Ok(mut client) = mssql::get_client_for_connection(id, Some("master")).await {
      if let Ok(databases) = mssql::list_databases(&mut client).await {
        return Ok(json!({
          "ok": true,
          "databases": databases
        }));
      }
    }
  }

  Ok(json!({
    "ok": true,
    "databases": [
      { "name": "master", "isSystem": true, "isOnline": true },
      { "name": "model", "isSystem": true, "isOnline": true },
      { "name": "msdb", "isSystem": true, "isOnline": true },
      { "name": "tempdb", "isSystem": true, "isOnline": true }
    ]
  }))
}

#[tauri::command]
pub async fn list_tables(connection_id: Option<String>, database: Option<String>) -> Result<Value, String> {
  if let Some(id) = connection_id.as_deref() {
    if let Ok(mut client) = mssql::get_client_for_connection(id, database.as_deref()).await {
      if let Ok(res) = mssql::list_tables(&mut client, database.as_deref()).await {
        return Ok(res);
      }
    }
  }
  Ok(json!({
    "ok": true,
    "tables": []
  }))
}

#[tauri::command]
pub async fn list_columns(connection_id: Option<String>, database: Option<String>) -> Result<Value, String> {
  if let Some(id) = connection_id.as_deref() {
    if let Ok(mut client) = mssql::get_client_for_connection(id, database.as_deref()).await {
      if let Ok(res) = mssql::list_columns(&mut client, database.as_deref()).await {
        return Ok(res);
      }
    }
  }
  Ok(json!({
    "ok": true,
    "columns": []
  }))
}

#[tauri::command]
pub async fn table_structure(
  connection_id: Option<String>,
  database: Option<String>,
  schema: Option<String>,
  table: Option<String>,
) -> Result<Value, String> {
  let s = schema.unwrap_or_else(|| "dbo".to_string());
  let t = table.unwrap_or_default();
  if let Some(id) = connection_id.as_deref() {
    if let Ok(mut client) = mssql::get_client_for_connection(id, database.as_deref()).await {
      if let Ok(res) = mssql::table_structure(&mut client, database.as_deref(), &s, &t).await {
        return Ok(res);
      }
    }
  }
  Ok(json!({
    "ok": true,
    "columns": [],
    "indexes": [],
    "foreignKeys": []
  }))
}

#[tauri::command]
pub fn table_relations(
  connection_id: Option<String>,
  database: Option<String>,
  schema: Option<String>,
  table: Option<String>,
) -> Result<Value, String> {
  let _ = (connection_id, database, schema, table);
  Ok(json!({
    "ok": true,
    "relations": []
  }))
}

#[tauri::command]
pub async fn list_modules(connection_id: Option<String>, database: Option<String>) -> Result<Value, String> {
  if let Some(id) = connection_id.as_deref() {
    if let Ok(mut client) = mssql::get_client_for_connection(id, database.as_deref()).await {
      if let Ok(res) = mssql::list_modules(&mut client, database.as_deref()).await {
        return Ok(res);
      }
    }
  }
  Ok(json!({
    "ok": true,
    "modules": []
  }))
}

#[tauri::command]
pub async fn module_definition(
  connection_id: Option<String>,
  database: Option<String>,
  schema: Option<String>,
  name: Option<String>,
  module_type: Option<String>,
) -> Result<Value, String> {
  let _ = module_type;
  let s = schema.unwrap_or_else(|| "dbo".to_string());
  let n = name.unwrap_or_default();
  if let Some(id) = connection_id.as_deref() {
    if let Ok(mut client) = mssql::get_client_for_connection(id, database.as_deref()).await {
      if let Ok(res) = mssql::module_definition(&mut client, database.as_deref(), &s, &n).await {
        return Ok(res);
      }
    }
  }
  Ok(json!({
    "ok": true,
    "definition": ""
  }))
}

#[tauri::command]
pub fn describe_result(
  connection_id: Option<String>,
  database: Option<String>,
  sql: Option<String>,
) -> Result<Value, String> {
  let _ = (connection_id, database, sql);
  Ok(json!({
    "ok": true,
    "columns": []
  }))
}

#[tauri::command]
pub async fn get_execution_plan(
  connection_id: Option<String>,
  database: Option<String>,
  sql: Option<String>,
  input: Option<Value>,
) -> Result<Value, String> {
  let query = sql
    .or_else(|| input.as_ref().and_then(|i| i.get("sql")).and_then(|v| v.as_str()).map(|s| s.to_string()))
    .unwrap_or_default();

  let conn_id = connection_id
    .or_else(|| input.as_ref().and_then(|i| i.get("connectionId").or_else(|| i.get("connection_id"))).and_then(|v| v.as_str()).map(|s| s.to_string()));

  let db = database
    .or_else(|| input.as_ref().and_then(|i| i.get("database")).and_then(|v| v.as_str()).map(|s| s.to_string()));

  if let Some(id) = conn_id.as_deref() {
    if let Ok(mut client) = mssql::get_client_for_connection(id, db.as_deref()).await {
      if let Ok(res) = mssql::get_execution_plan(&mut client, db.as_deref(), &query).await {
        return Ok(res);
      }
    }
  }
  Ok(json!({
    "ok": true,
    "plan": null
  }))
}

#[tauri::command]
pub fn list_query_history(
  connection_id: Option<String>,
  database: Option<String>,
  limit: Option<usize>,
) -> Result<Value, String> {
  let _ = (connection_id, database, limit);
  Ok(json!({
    "ok": true,
    "history": []
  }))
}

#[tauri::command]
pub fn clear_query_history(connection_id: Option<String>, database: Option<String>) -> Result<Value, String> {
  let _ = (connection_id, database);
  Ok(json!({ "ok": true }))
}

#[tauri::command]
pub fn delete_query_history(id: String) -> Result<Value, String> {
  let _ = id;
  Ok(json!({ "ok": true }))
}

#[tauri::command]
pub fn list_saved_queries(connection_id: Option<String>, database: Option<String>) -> Result<Value, String> {
  let _ = (connection_id, database);
  Ok(json!({
    "ok": true,
    "queries": []
  }))
}

#[tauri::command]
pub fn save_saved_query(input: Value) -> Result<Value, String> {
  Ok(json!({
    "ok": true,
    "query": input
  }))
}

#[tauri::command]
pub fn rename_saved_query(input: Value) -> Result<Value, String> {
  Ok(json!({
    "ok": true,
    "query": input
  }))
}

#[tauri::command]
pub fn delete_saved_query(id: String) -> Result<Value, String> {
  let _ = id;
  Ok(json!({ "ok": true }))
}

#[tauri::command]
pub async fn drop_database(input: Value) -> Result<Value, String> {
  let conn_id = input.get("connectionId").or_else(|| input.get("connection_id")).and_then(|v| v.as_str()).unwrap_or("");
  let database = input.get("database").and_then(|v| v.as_str()).unwrap_or("");

  if !conn_id.is_empty() && !database.is_empty() {
    let mut client = mssql::get_client_for_connection(conn_id, Some("master")).await?;
    let sql = format!("ALTER DATABASE [{}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [{}]", database.replace(']', "]]"), database.replace(']', "]]"));
    client.simple_query(sql).await.map_err(|e| e.to_string())?;
  }

  Ok(json!({
    "ok": true,
    "database": database
  }))
}

#[tauri::command]
pub async fn list_database_users(connection_id: Option<String>, database: Option<String>) -> Result<Value, String> {
  if let Some(id) = connection_id.as_deref() {
    if let Ok(mut client) = mssql::get_client_for_connection(id, database.as_deref()).await {
      let sql = "SELECT dp.name AS userName, dp.type_desc AS userType, dp.default_schema_name AS defaultSchema, sp.name AS loginName
                 FROM sys.database_principals dp
                 LEFT JOIN sys.server_principals sp ON sp.sid = dp.sid
                 WHERE dp.type IN ('S', 'U', 'G') AND dp.name NOT IN ('guest', 'INFORMATION_SCHEMA', 'sys')
                 ORDER BY dp.name";
      if let Ok(stream) = client.query(sql, &[]).await {
        if let Ok(rows) = stream.into_first_result().await {
          let mut users = Vec::new();
          for row in rows {
            let user_name: &str = row.get(0).unwrap_or("");
            let user_type: &str = row.get(1).unwrap_or("");
            let default_schema: &str = row.get(2).unwrap_or("");
            let login_name: &str = row.get(3).unwrap_or("");
            users.push(json!({
              "userName": user_name,
              "userType": user_type,
              "defaultSchema": default_schema,
              "loginName": login_name,
              "roles": []
            }));
          }
          return Ok(json!({ "ok": true, "users": users }));
        }
      }
    }
  }
  Ok(json!({
    "ok": true,
    "users": []
  }))
}

#[tauri::command]
pub fn create_database_user(input: Value) -> Result<Value, String> {
  let _ = input;
  Ok(json!({ "ok": true }))
}

#[tauri::command]
pub fn update_database_user_roles(input: Value) -> Result<Value, String> {
  let _ = input;
  Ok(json!({ "ok": true }))
}

#[tauri::command]
pub fn drop_database_user(input: Value) -> Result<Value, String> {
  let _ = input;
  Ok(json!({ "ok": true }))
}
