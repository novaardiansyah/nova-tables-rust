use crate::database::mssql;
use crate::database::mysql;
use serde_json::{json, Value};

fn connection_driver_type(connection_id: &str) -> String {
  crate::database::connection_registry::get_active_connection(connection_id)
    .and_then(|c| c.driver_type)
    .unwrap_or_else(|| "sqlserver".to_string())
}

// Targeted for MySQL: creates MySQL connection client from active connection registry.
async fn mysql_client_for_connection(
  connection_id: &str,
  database: Option<&str>,
) -> Result<mysql::MySqlConn, String> {
  mysql::get_client_for_connection(connection_id, database).await
}

fn input_text(input: &Value, key: &str) -> String {
  input
    .get(key)
    .and_then(|value| value.as_str())
    .unwrap_or("")
    .to_string()
}

fn input_roles(input: &Value) -> Vec<String> {
  input
    .get("roles")
    .and_then(|value| value.as_array())
    .map(|items| {
      items
        .iter()
        .filter_map(|item| item.as_str())
        .map(|item| item.to_string())
        .collect()
    })
    .unwrap_or_default()
}

#[tauri::command]
pub async fn execute_query(
  sql: Option<String>,
  connection_id: Option<String>,
  database: Option<String>,
  _record_history: Option<bool>,
  input: Option<Value>,
) -> Result<Value, String> {
  let query = sql
    .or_else(|| {
      input
        .as_ref()
        .and_then(|i| i.get("sql"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
    })
    .unwrap_or_default();

  let conn_id = connection_id.or_else(|| {
    input
      .as_ref()
      .and_then(|i| i.get("connectionId").or_else(|| i.get("connection_id")))
      .and_then(|v| v.as_str())
      .map(|s| s.to_string())
  });

  let db = database.or_else(|| {
    input
      .as_ref()
      .and_then(|i| i.get("database"))
      .and_then(|v| v.as_str())
      .map(|s| s.to_string())
  });

  let mut driver_type = "sqlserver".to_string();
  if let Some(id) = conn_id.as_deref() {
    driver_type = connection_driver_type(id);
  }

  if let Some(id) = conn_id.as_deref() {
    if driver_type == "mysql" {
      // Targeted for MySQL: execute sql query using mysql_async client.
      match mysql_client_for_connection(id, db.as_deref()).await {
        Ok(mut client) => mysql::execute_sql(&mut client, &query).await,
        Err(error) => Err(error),
      }
    } else {
      // Targeted for SQL Server: execute sql query using Tiberius TDS client.
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
  }
}

#[tauri::command]
pub async fn list_databases(connection_id: Option<String>) -> Result<Value, String> {
  if let Some(id) = connection_id.as_deref() {
    let is_mysql = connection_driver_type(id) == "mysql";

    if is_mysql {
      // Targeted for MySQL: retrieves all databases visible to current user.
      if let Ok(mut client) = mysql_client_for_connection(id, None).await {
        if let Ok(databases) = mysql::list_databases(&mut client).await {
          return Ok(json!({
            "ok": true,
            "databases": databases
          }));
        }
      }
    } else {
      // Targeted for SQL Server: queries sys.databases on master database.
      if let Ok(mut client) = mssql::get_client_for_connection(id, Some("master")).await {
        if let Ok(databases) = mssql::list_databases(&mut client).await {
          return Ok(json!({
            "ok": true,
            "databases": databases
          }));
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
pub async fn list_tables(
  connection_id: Option<String>,
  database: Option<String>,
) -> Result<Value, String> {
  if let Some(id) = connection_id.as_deref() {
    if connection_driver_type(id) == "mysql" {
      // Targeted for MySQL: queries information_schema.tables.
      if let Ok(mut client) = mysql_client_for_connection(id, database.as_deref()).await {
        if let Ok(res) = mysql::list_tables(&mut client, database.as_deref()).await {
          return Ok(res);
        }
      }
    } else {
      // Targeted for SQL Server: queries sys.tables.
      if let Ok(mut client) = mssql::get_client_for_connection(id, database.as_deref()).await {
        if let Ok(res) = mssql::list_tables(&mut client, database.as_deref()).await {
          return Ok(res);
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
pub async fn list_columns(
  connection_id: Option<String>,
  database: Option<String>,
) -> Result<Value, String> {
  if let Some(id) = connection_id.as_deref() {
    if connection_driver_type(id) == "mysql" {
      // Targeted for MySQL: queries information_schema.columns.
      if let Ok(mut client) = mysql_client_for_connection(id, database.as_deref()).await {
        if let Ok(res) = mysql::list_columns(&mut client, database.as_deref()).await {
          return Ok(res);
        }
      }
    } else {
      // Targeted for SQL Server: queries sys.columns.
      if let Ok(mut client) = mssql::get_client_for_connection(id, database.as_deref()).await {
        if let Ok(res) = mssql::list_columns(&mut client, database.as_deref()).await {
          return Ok(res);
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
pub async fn table_structure(
  connection_id: Option<String>,
  database: Option<String>,
  schema: Option<String>,
  table: Option<String>,
) -> Result<Value, String> {
  let s = schema.unwrap_or_else(|| "dbo".to_string());
  let t = table.unwrap_or_default();
  if let Some(id) = connection_id.as_deref() {
    if connection_driver_type(id) == "mysql" {
      // Targeted for MySQL: describes table structure and keys.
      let db_to_use = database
        .as_deref()
        .filter(|value| !value.is_empty())
        .unwrap_or(&s);
      if let Ok(mut client) = mysql_client_for_connection(id, Some(db_to_use)).await {
        if let Ok(res) = mysql::table_structure(&mut client, Some(db_to_use), &s, &t).await {
          return Ok(res);
        }
      }
    } else {
      // Targeted for SQL Server: describes table structure from sys catalog views.
      if let Ok(mut client) = mssql::get_client_for_connection(id, database.as_deref()).await {
        if let Ok(res) = mssql::table_structure(&mut client, database.as_deref(), &s, &t).await {
          return Ok(res);
        }
      }
    }
  }

  Ok(json!({
    "ok": true,
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
    if connection_driver_type(id) == "mysql" {
      // Targeted for MySQL: queries key_column_usage for foreign keys.
      let db_to_use = database
        .as_deref()
        .filter(|value| !value.is_empty())
        .unwrap_or(&s);
      if let Ok(mut client) = mysql_client_for_connection(id, Some(db_to_use)).await {
        if let Ok(res) = mysql::table_relations(&mut client, Some(db_to_use), &s, &t).await {
          return Ok(res);
        }
      }
    } else {
      // Targeted for SQL Server: queries sys.foreign_keys.
      if let Ok(mut client) = mssql::get_client_for_connection(id, database.as_deref()).await {
        if let Ok(res) = mssql::table_relations(&mut client, database.as_deref(), &s, &t).await {
          return Ok(res);
        }
      }
    }
  }

  Ok(json!({
    "ok": true,
    "relations": []
  }))
}

#[tauri::command]
pub async fn list_modules(
  connection_id: Option<String>,
  database: Option<String>,
) -> Result<Value, String> {
  if let Some(id) = connection_id.as_deref() {
    if connection_driver_type(id) == "mysql" {
      // Targeted for MySQL: queries information_schema.routines.
      let db_to_use = database.as_deref().filter(|value| !value.is_empty());
      if let Ok(mut client) = mysql_client_for_connection(id, db_to_use).await {
        if let Ok(res) = mysql::list_modules(&mut client, db_to_use).await {
          return Ok(res);
        }
      }
    } else {
      // Targeted for SQL Server: queries sys.sql_modules.
      if let Ok(mut client) = mssql::get_client_for_connection(id, database.as_deref()).await {
        if let Ok(res) = mssql::list_modules(&mut client, database.as_deref()).await {
          return Ok(res);
        }
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
  _module_type: Option<String>,
) -> Result<Value, String> {
  let s = schema.unwrap_or_else(|| "dbo".to_string());
  let n = name.unwrap_or_default();
  if let Some(id) = connection_id.as_deref() {
    if connection_driver_type(id) == "mysql" {
      // Targeted for MySQL: extracts SHOW CREATE PROCEDURE / FUNCTION.
      let db_to_use = database.as_deref().filter(|value| !value.is_empty());
      if let Ok(mut client) = mysql_client_for_connection(id, db_to_use).await {
        if let Ok(res) = mysql::module_definition(&mut client, db_to_use, &s, &n).await {
          return Ok(res);
        }
      }
    } else {
      // Targeted for SQL Server: uses OBJECT_DEFINITION.
      if let Ok(mut client) = mssql::get_client_for_connection(id, database.as_deref()).await {
        if let Ok(res) = mssql::module_definition(&mut client, database.as_deref(), &s, &n).await {
          return Ok(res);
        }
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
  let query = sql
    .as_deref()
    .map(|s| s.trim().trim_end_matches(';').trim())
    .unwrap_or_default();
  if query.is_empty() {
    return Ok(json!({ "ok": true, "columns": [] }));
  }

  let mut client = mssql::get_client_for_connection(
    &connection_id.unwrap_or_default(),
    database.as_deref(),
  )
  .await
  .map_err(|e| e.to_string())?;

  // Targeted for SQL Server: queries sys.dm_exec_describe_first_result_set.
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

  let rows = stream
    .into_first_result()
    .await
    .map_err(|e| e.to_string())?;

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
    .or_else(|| {
      input
        .as_ref()
        .and_then(|i| i.get("sql"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
    })
    .unwrap_or_default();

  let conn_id = connection_id.or_else(|| {
    input
      .as_ref()
      .and_then(|i| i.get("connectionId").or_else(|| i.get("connection_id")))
      .and_then(|v| v.as_str())
      .map(|s| s.to_string())
  });

  let db = database.or_else(|| {
    input
      .as_ref()
      .and_then(|i| i.get("database"))
      .and_then(|v| v.as_str())
      .map(|s| s.to_string())
  });

  if let Some(id) = conn_id.as_deref() {
    // Targeted for MySQL: estimated execution plan is restricted to SQL Server connections only.
    if connection_driver_type(id) == "mysql" {
      return Err("Estimated execution plan is only supported for SQL Server connections.".to_string());
    }
  }

  if let Some(id) = conn_id.as_deref() {
    // Targeted for SQL Server: generates XML showplan using SET SHOWPLAN_XML ON.
    let mut client = mssql::get_client_for_connection(id, db.as_deref()).await?;
    return mssql::get_execution_plan(&mut client, db.as_deref(), &query).await;
  }

  Err("Missing connection ID".to_string())
}

#[tauri::command]
pub fn list_query_history(
  _connection_id: Option<String>,
  _database: Option<String>,
  _limit: Option<usize>,
) -> Result<Value, String> {
  Ok(json!({ "ok": true, "history": [] }))
}

#[tauri::command]
pub fn clear_query_history(
  _connection_id: Option<String>,
  _database: Option<String>,
) -> Result<Value, String> {
  Ok(json!({ "ok": true, "cleared": true }))
}

#[tauri::command]
pub fn delete_query_history(_id: String) -> Result<Value, String> {
  Ok(json!({ "ok": true, "deleted": true }))
}

#[tauri::command]
pub fn list_saved_queries(
  _connection_id: Option<String>,
  _database: Option<String>,
) -> Result<Value, String> {
  Ok(json!({ "ok": true, "queries": [] }))
}

#[tauri::command]
pub fn save_saved_query(_input: Value) -> Result<Value, String> {
  Ok(json!({ "ok": true, "query": null }))
}

#[tauri::command]
pub fn rename_saved_query(_input: Value) -> Result<Value, String> {
  Ok(json!({ "ok": true, "query": null }))
}

#[tauri::command]
pub fn delete_saved_query(_id: String) -> Result<Value, String> {
  Ok(json!({ "ok": true, "deleted": true }))
}

#[tauri::command]
pub async fn create_database(input: Value) -> Result<Value, String> {
  let connection_id = input_text(&input, "connectionId");
  let database = input_text(&input, "database").trim().to_string();

  if connection_id.is_empty() {
    return Err("Open a connection first.".to_string());
  }
  if database.is_empty() {
    return Err("Enter a database name.".to_string());
  }

  if connection_driver_type(&connection_id) == "mysql" {
    // Targeted for MySQL: creates database schema via MySQL client.
    let mut client = mysql_client_for_connection(&connection_id, None).await?;
    return mysql::create_database(&mut client, &database).await;
  } else {
    // Targeted for SQL Server: creates database schema via TDS client.
    let mut client = mssql::get_client_for_connection(&connection_id, Some("master")).await?;
    let sql = format!("CREATE DATABASE [{}]", database.replace(']', "]]"));
    client.simple_query(sql).await.map_err(|e| e.to_string())?;
  }

  Ok(json!({
    "ok": true,
    "database": database
  }))
}

#[tauri::command]
pub async fn drop_database(input: Value) -> Result<Value, String> {
  let connection_id = input_text(&input, "connectionId");
  let database = input_text(&input, "database");

  if connection_id.is_empty() {
    return Err("Choose a connection first.".to_string());
  }
  if database.is_empty() {
    return Err("Enter a database name.".to_string());
  }

  if connection_driver_type(&connection_id) == "mysql" {
    // Targeted for MySQL: drops database schema via MySQL client.
    let mut client = mysql_client_for_connection(&connection_id, None).await?;
    return mysql::drop_database(&mut client, &database).await;
  }

  // Targeted for SQL Server: forces single-user mode and drops database.
  let mut client = mssql::get_client_for_connection(&connection_id, Some("master")).await?;
  let sql = format!(
    "ALTER DATABASE [{}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [{}]",
    database.replace(']', "]]"),
    database.replace(']', "]]")
  );
  client.simple_query(sql).await.map_err(|e| e.to_string())?;

  Ok(json!({
    "ok": true,
    "database": database
  }))
}

#[tauri::command]
pub async fn list_database_users(
  connection_id: Option<String>,
  database: Option<String>,
) -> Result<Value, String> {
  let Some(id) = connection_id.as_deref().filter(|value| !value.is_empty()) else {
    return Ok(json!({
      "ok": true,
      "users": [],
      "roles": [],
      "logins": []
    }));
  };

  if connection_driver_type(id) == "mysql" {
    // Targeted for MySQL: queries mysql.user table.
    let mut client = mysql_client_for_connection(id, database.as_deref()).await?;
    return mysql::list_database_users(&mut client, database.as_deref()).await;
  }

  // Targeted for SQL Server: queries sys.database_principals and sys.database_role_members.
  let mut client = mssql::get_client_for_connection(id, database.as_deref()).await?;
  mssql::list_database_users(&mut client, database.as_deref()).await
}

#[tauri::command]
pub async fn create_database_user(input: Value) -> Result<Value, String> {
  let connection_id = input_text(&input, "connectionId");
  let database = input_text(&input, "database");
  let name = input_text(&input, "name");
  let roles = input_roles(&input);

  if connection_id.is_empty() || name.is_empty() {
    return Err("Choose a login to map.".to_string());
  }

  if connection_driver_type(&connection_id) == "mysql" {
    // Targeted for MySQL: creates MySQL user and assigns privileges.
    let mut client = mysql_client_for_connection(&connection_id, Some(&database)).await?;
    return mysql::create_database_user(&mut client, Some(&database), &name, &roles).await;
  }

  // Targeted for SQL Server: creates SQL Server database user with roles.
  let mut client = mssql::get_client_for_connection(&connection_id, Some(&database)).await?;
  mssql::create_database_user(&mut client, Some(&database), &name, &roles).await
}

#[tauri::command]
pub async fn update_database_user_roles(input: Value) -> Result<Value, String> {
  let connection_id = input_text(&input, "connectionId");
  let database = input_text(&input, "database");
  let name = input_text(&input, "name");
  let roles = input_roles(&input);

  if connection_id.is_empty() || name.is_empty() {
    return Err("Choose a database user.".to_string());
  }

  if connection_driver_type(&connection_id) == "mysql" {
    // Targeted for MySQL: grants or revokes MySQL privileges.
    let mut client = mysql_client_for_connection(&connection_id, Some(&database)).await?;
    return mysql::update_database_user_roles(&mut client, Some(&database), &name, &roles).await;
  }

  // Targeted for SQL Server: alters role membership with sp_addrolemember / sp_droprolemember.
  let mut client = mssql::get_client_for_connection(&connection_id, Some(&database)).await?;
  mssql::update_database_user_roles(&mut client, Some(&database), &name, &roles).await
}

#[tauri::command]
pub async fn drop_database_user(input: Value) -> Result<Value, String> {
  let connection_id = input_text(&input, "connectionId");
  let database = input_text(&input, "database");
  let name = input_text(&input, "name");

  if connection_id.is_empty() || name.is_empty() {
    return Err("Choose a database user.".to_string());
  }

  if connection_driver_type(&connection_id) == "mysql" {
    // Targeted for MySQL: drops MySQL user account.
    let mut client = mysql_client_for_connection(&connection_id, Some(&database)).await?;
    return mysql::drop_database_user(&mut client, Some(&database), &name).await;
  }

  // Targeted for SQL Server: drops SQL Server database user.
  let mut client = mssql::get_client_for_connection(&connection_id, Some(&database)).await?;
  mssql::drop_database_user(&mut client, Some(&database), &name).await
}
