use crate::database::connection_registry::get_active_connection;
use crate::database::erd::{mssql_erd, mysql_erd};
use crate::database::mssql;
use crate::database::mysql;
use serde_json::{json, Value};

fn connection_driver_type(connection_id: &str) -> String {
  get_active_connection(connection_id)
    .and_then(|c| c.driver_type)
    .unwrap_or_else(|| "sqlserver".to_string())
}

#[tauri::command]
pub async fn get_erd_data(
  connection_id: Option<String>,
  database: Option<String>,
  tables: Option<Vec<String>>,
  include_related: Option<bool>,
  depth: Option<usize>,
) -> Result<Value, String> {
  let conn_id = connection_id.unwrap_or_default();
  if conn_id.is_empty() {
    return Ok(json!({ "ok": false, "error": "No active connection" }));
  }

  let driver = connection_driver_type(&conn_id);
  let inc_related = include_related.unwrap_or(true);
  let d = depth.unwrap_or(1);
  let tbls = tables.as_deref();

  if driver == "mysql" {
    // Targeted for MySQL: queries information_schema for ERD tables, columns, and foreign keys.
    let mut client = mysql::get_client_for_connection(&conn_id, database.as_deref()).await?;
    mysql_erd(&mut client, database.as_deref(), tbls, inc_related, d).await
  } else {
    // Targeted for SQL Server: queries sys metadata catalogs for ERD tables, columns, and foreign keys.
    let mut client = mssql::get_client_for_connection(&conn_id, database.as_deref()).await?;
    mssql_erd(&mut client, database.as_deref(), tbls, inc_related, d).await
  }
}
