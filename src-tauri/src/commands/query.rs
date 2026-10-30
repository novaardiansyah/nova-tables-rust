use crate::database::local_store::{LocalStore, QueryHistoryItem};
use crate::database::mssql;
use crate::database::mysql;
use crate::file_system::FileSystem;
use serde_json::{json, Value};

fn record_query_history(
  connection_id: Option<&str>,
  database: Option<&str>,
  sql: &str,
  status: &str,
  duration_ms: i64,
  row_count: i64,
  error_message: Option<&str>,
) {
  let (Some(connection_id), Some(database)) = (connection_id, database) else {
    return;
  };
  if connection_id.is_empty() || database.is_empty() || sql.trim().is_empty() {
    return;
  }

  let Ok(db_path) = FileSystem::get_database_path() else {
    return;
  };
  let Ok(conn) = LocalStore::init(&db_path) else {
    return;
  };

  let item = QueryHistoryItem {
    id: uuid::Uuid::new_v4().to_string(),
    connection_id: connection_id.to_string(),
    database: database.to_string(),
    sql: sql.trim().to_string(),
    status: status.to_string(),
    duration_ms,
    row_count,
    error_message: error_message.map(|message| message.to_string()),
    created_at: chrono::Utc::now().to_rfc3339(),
  };

  let _ = LocalStore::add_query_history(&conn, &item);
}

#[tauri::command]
pub async fn execute_query(
  sql: Option<String>,
  connection_id: Option<String>,
  database: Option<String>,
  record_history: Option<bool>,
  input: Option<Value>,
) -> Result<Value, String> {
  let started = std::time::Instant::now();
  let query = sql
    .or_else(|| input.as_ref().and_then(|i| i.get("sql")).and_then(|v| v.as_str()).map(|s| s.to_string()))
    .unwrap_or_default();

  let conn_id = connection_id
    .or_else(|| input.as_ref().and_then(|i| i.get("connectionId").or_else(|| i.get("connection_id"))).and_then(|v| v.as_str()).map(|s| s.to_string()));

  let db = database
    .or_else(|| input.as_ref().and_then(|i| i.get("database")).and_then(|v| v.as_str()).map(|s| s.to_string()));

  let record_history = record_history
    .or_else(|| input.as_ref().and_then(|i| i.get("recordHistory").or_else(|| i.get("record_history"))).and_then(|v| v.as_bool()))
    .unwrap_or(false);

  // Check connection driver type from local_store
  let mut driver_type = "sqlserver".to_string();
  if let Some(id) = conn_id.as_deref() {
    if let Ok(db_path) = FileSystem::get_database_path() {
      if let Ok(conn) = LocalStore::init(&db_path) {
        if let Ok(Some(item)) = LocalStore::get_connection(&conn, id) {
          if let Some(dt) = item.driver_type {
            driver_type = dt;
          }
        }
      }
    }
  }

  let outcome = if let Some(id) = conn_id.as_deref() {
    if driver_type == "mysql" {
      // For MySQL, get client info and execute
      let db_path = FileSystem::get_database_path()?;
      let conn = LocalStore::init(&db_path).map_err(|e| e.to_string())?;
      let item = LocalStore::get_connection(&conn, id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Connection {} not found", id))?;
      let password = item.password.or(item.password_cipher).unwrap_or_default();
      let db_to_use = db.as_deref().or(item.database_name.as_deref());

      match mysql::create_client(
        &item.host,
        item.port,
        &item.username,
        &password,
        db_to_use,
        item.encrypt,
        item.trust_server_certificate,
      ).await {
        Ok(mut client) => mysql::execute_sql(&mut client, &query).await,
        Err(error) => Err(error),
      }
    } else {
      // SQL Server path
      match mssql::get_client_for_connection(id, db.as_deref()).await {
        Ok(mut client) => mssql::execute_sql(&mut client, &query).await,
        Err(error) => Err(error),
      }
    }
  } else {
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
  };

  if record_history {
    match &outcome {
      Ok(result) => record_query_history(
        conn_id.as_deref(),
        db.as_deref(),
        &query,
        "success",
        result.get("elapsedMs").and_then(|v| v.as_i64()).unwrap_or(0),
        result.get("rowCount").and_then(|v| v.as_i64()).unwrap_or(0),
        None,
      ),
      Err(error) => record_query_history(
        conn_id.as_deref(),
        db.as_deref(),
        &query,
        "error",
        started.elapsed().as_millis() as i64,
        0,
        Some(error),
      ),
    }
  }

  outcome
}

#[tauri::command]
pub async fn list_databases(connection_id: Option<String>) -> Result<Value, String> {
  // Try SQL Server first
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

  // Then try MySQL
  if let Some(id) = connection_id.as_deref() {
    if let Ok(db_path) = FileSystem::get_database_path() {
      if let Ok(conn) = LocalStore::init(&db_path) {
        if let Ok(Some(item)) = LocalStore::get_connection(&conn, id) {
          let driver_type = item.driver_type.as_deref().unwrap_or("sqlserver");
          if driver_type == "mysql" {
            let password = item.password.or(item.password_cipher).unwrap_or_default();
            let db_to_use = item.database_name.as_deref().unwrap_or("");
            
            match mysql::create_client(
              &item.host,
              item.port,
              &item.username,
              &password,
              Some(db_to_use),
              item.encrypt,
              item.trust_server_certificate,
            ).await
            {
              Ok(mut client) => {
                if let Ok(databases) = mysql::list_databases(&mut client).await {
                  return Ok(json!({
                    "ok": true,
                    "databases": databases
                  }));
                }
              }
              Err(_) => {
                // Ignore error, fall through to default
              }
            }
          }
        }
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
  // Try SQL Server first
  if let Some(id) = connection_id.as_deref() {
    if let Ok(mut client) = mssql::get_client_for_connection(id, database.as_deref()).await {
      if let Ok(res) = mssql::list_tables(&mut client, database.as_deref()).await {
        return Ok(res);
      }
    }
  }

  // Then try MySQL
  if let Some(id) = connection_id.as_deref() {
    if let Ok(db_path) = FileSystem::get_database_path() {
      if let Ok(conn) = LocalStore::init(&db_path) {
        if let Ok(Some(item)) = LocalStore::get_connection(&conn, id) {
          let driver_type = item.driver_type.as_deref().unwrap_or("sqlserver");
          if driver_type == "mysql" {
            let db_to_use = database.as_deref().or(item.database_name.as_deref()).unwrap_or("");
            let password = item.password.or(item.password_cipher).unwrap_or_default();
            if let Ok(mut client) = mysql::create_client(
              &item.host,
              item.port,
              &item.username,
              &password,
              Some(db_to_use),
              item.encrypt,
              item.trust_server_certificate,
            ).await {
              if let Ok(res) = mysql::list_tables(&mut client, Some(db_to_use)).await {
                return Ok(res);
              }
            }
          }
        }
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
    "database": database,
    "schema": s,
    "table": t,
    "objectName": format!("[{}].[{}]", s.replace(']', "]]"), t.replace(']', "]]")),
    "columns": [],
    "primaryKey": [],
    "uniqueKeys": [],
    "indexes": [],
    "foreignKeys": [],
    "statement": ""
  }))
}

#[tauri::command]
pub async fn table_relations(
  connection_id: Option<String>,
  database: Option<String>,
  schema: Option<String>,
  table: Option<String>,
) -> Result<Value, String> {
  let s = schema.unwrap_or_else(|| "dbo".to_string());
  let t = table.unwrap_or_default();
  if let Some(id) = connection_id.as_deref() {
    if let Ok(mut client) = mssql::get_client_for_connection(id, database.as_deref()).await {
      if let Ok(res) = mssql::table_relations(&mut client, database.as_deref(), &s, &t).await {
        return Ok(res);
      }
    }
  }
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
pub async fn describe_result(
  connection_id: Option<String>,
  database: Option<String>,
  sql: Option<String>,
) -> Result<Value, String> {
  let query = sql.as_deref().map(|s| s.trim().trim_end_matches(';').trim()).unwrap_or_default();
  if query.is_empty() {
    return Ok(json!({ "ok": true, "columns": [] }));
  }

  let mut client = mssql::get_client_for_connection(
    &connection_id.clone().unwrap_or_default(),
    database.as_deref(),
  )
  .await
  .map_err(|e| e.to_string())?;

  let stream = client
    .query(
      "SELECT column_ordinal,
              name,
              source_schema,
              source_table,
              source_column,
              is_updateable,
              is_computed_column
       FROM sys.dm_exec_describe_first_result_set(@P1, NULL, 1)
       WHERE is_hidden = 0
       ORDER BY column_ordinal",
      &[&query],
    )
    .await
    .map_err(|e| e.to_string())?;

  let rows = stream.into_first_result().await.map_err(|e| e.to_string())?;

  let mut columns = Vec::new();
  for row in rows {
    let name: &str = row.get(1).unwrap_or("");
    if name.is_empty() {
      continue;
    }
    let source_schema: Option<&str> = row.get(2);
    let source_table: Option<&str> = row.get(3);
    let source_column: Option<&str> = row.get(4);
    let is_updateable: bool = row.get(5).unwrap_or(false);
    let is_computed_column: bool = row.get(6).unwrap_or(false);

    columns.push(json!({
      "name": name,
      "schema": source_schema,
      "table": source_table,
      "column": source_column,
      "updateable": is_updateable,
      "computed": is_computed_column,
    }));
  }

  Ok(json!({ "ok": true, "columns": columns }))
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
  let Some(connection_id) = connection_id.as_deref().filter(|value| !value.is_empty()) else {
    return Ok(json!({ "ok": true, "history": [] }));
  };

  let db_path = FileSystem::get_database_path()?;
  let conn = LocalStore::init(&db_path).map_err(|e| e.to_string())?;
  let history = LocalStore::list_query_history(&conn, connection_id, database.as_deref(), limit.unwrap_or(100))
    .map_err(|e| e.to_string())?;

  Ok(json!({
    "ok": true,
    "history": history
  }))
}

#[tauri::command]
pub fn clear_query_history(connection_id: Option<String>, database: Option<String>) -> Result<Value, String> {
  let Some(connection_id) = connection_id.as_deref().filter(|value| !value.is_empty()) else {
    return Ok(json!({ "ok": true, "cleared": false }));
  };

  let db_path = FileSystem::get_database_path()?;
  let conn = LocalStore::init(&db_path).map_err(|e| e.to_string())?;
  let cleared = LocalStore::clear_query_history(&conn, connection_id, database.as_deref())
    .map_err(|e| e.to_string())?;

  Ok(json!({
    "ok": true,
    "cleared": cleared
  }))
}

#[tauri::command]
pub fn delete_query_history(id: String) -> Result<Value, String> {
  let db_path = FileSystem::get_database_path()?;
  let conn = LocalStore::init(&db_path).map_err(|e| e.to_string())?;
  let deleted = LocalStore::delete_query_history(&conn, &id).map_err(|e| e.to_string())?;

  Ok(json!({
    "ok": true,
    "deleted": deleted,
    "id": id
  }))
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
