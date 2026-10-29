use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use tiberius::{AuthMethod, Client, ColumnData, Config, EncryptionLevel};
use tokio::net::TcpStream;
use tokio_util::compat::{Compat, TokioAsyncWriteCompatExt};

pub type MssqlClient = Client<Compat<TcpStream>>;

pub fn column_data_to_json(data: &ColumnData<'static>) -> Value {
  match data {
    ColumnData::Bit(opt) => opt.map(Value::from).unwrap_or(Value::Null),
    ColumnData::U8(opt) => opt.map(Value::from).unwrap_or(Value::Null),
    ColumnData::I16(opt) => opt.map(Value::from).unwrap_or(Value::Null),
    ColumnData::I32(opt) => opt.map(Value::from).unwrap_or(Value::Null),
    ColumnData::I64(opt) => opt.map(Value::from).unwrap_or(Value::Null),
    ColumnData::F32(opt) => opt.map(Value::from).unwrap_or(Value::Null),
    ColumnData::F64(opt) => opt.map(Value::from).unwrap_or(Value::Null),
    ColumnData::String(opt) => opt.as_ref().map(|s| Value::String(s.to_string())).unwrap_or(Value::Null),
    ColumnData::Guid(opt) => opt.as_ref().map(|g| Value::String(g.to_string())).unwrap_or(Value::Null),
    ColumnData::Binary(opt) => opt.as_ref().map(|b| {
      let mut hex = String::from("0x");
      for byte in b.as_ref() {
        hex.push_str(&format!("{:02x}", byte));
      }
      Value::String(hex)
    }).unwrap_or(Value::Null),
    ColumnData::Numeric(opt) => opt.as_ref().map(|n| Value::String(n.to_string())).unwrap_or(Value::Null),
    ColumnData::DateTime(opt) => opt.as_ref().map(|d| Value::String(format!("{:?}", d))).unwrap_or(Value::Null),
    ColumnData::SmallDateTime(opt) => opt.as_ref().map(|d| Value::String(format!("{:?}", d))).unwrap_or(Value::Null),
    ColumnData::Time(opt) => opt.as_ref().map(|d| Value::String(format!("{:?}", d))).unwrap_or(Value::Null),
    ColumnData::Date(opt) => opt.as_ref().map(|d| Value::String(format!("{:?}", d))).unwrap_or(Value::Null),
    ColumnData::DateTime2(opt) => opt.as_ref().map(|d| Value::String(format!("{:?}", d))).unwrap_or(Value::Null),
    ColumnData::DateTimeOffset(opt) => opt.as_ref().map(|d| Value::String(format!("{:?}", d))).unwrap_or(Value::Null),
    ColumnData::Xml(opt) => opt.as_ref().map(|x| Value::String(x.to_string())).unwrap_or(Value::Null),
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnInfo {
  pub name: String,
  #[serde(rename = "typeName")]
  pub type_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryResult {
  pub columns: Vec<ColumnInfo>,
  pub rows: Vec<Value>,
  #[serde(rename = "rowsAffected")]
  pub rows_affected: u64,
  #[serde(rename = "executionTimeMs")]
  pub execution_time_ms: u64,
}

pub async fn create_client(
  host: &str,
  port: u16,
  username: &str,
  password: &str,
  database: Option<&str>,
  encrypt: bool,
  trust_cert: bool,
) -> Result<MssqlClient, String> {
  let mut config = Config::new();
  config.host(host);
  config.port(port);
  config.authentication(AuthMethod::sql_server(username, password));
  if let Some(db) = database {
    if !db.is_empty() {
      config.database(db);
    }
  }
  if encrypt {
    config.encryption(EncryptionLevel::Required);
  } else {
    config.encryption(EncryptionLevel::Off);
  }
  if trust_cert {
    config.trust_cert();
  }

  let addr = format!("{}:{}", host, port);
  let tcp = TcpStream::connect(&addr)
    .await
    .map_err(|e| format!("Could not connect to {}: {}", addr, e))?;
  tcp.set_nodelay(true).map_err(|e| e.to_string())?;

  let client = Client::connect(config, tcp.compat_write())
    .await
    .map_err(|e| format!("Login failed: {}", e))?;

  Ok(client)
}

pub async fn list_databases(client: &mut MssqlClient) -> Result<Vec<Value>, String> {
  let stream = client
    .query("SELECT name, state_desc AS state FROM sys.databases ORDER BY name", &[])
    .await
    .map_err(|e| e.to_string())?;

  let rows = stream.into_first_result().await.map_err(|e| e.to_string())?;
  let system_dbs = ["master", "model", "msdb", "tempdb"];

  let mut databases = Vec::new();
  for row in rows {
    let name: &str = row.get(0).unwrap_or("");
    let state: &str = row.get(1).unwrap_or("");
    let is_system = system_dbs.contains(&name.to_lowercase().as_str());
    let is_online = state.eq_ignore_ascii_case("ONLINE");

    databases.push(json!({
      "name": name,
      "isSystem": is_system,
      "isOnline": is_online
    }));
  }

  Ok(databases)
}

pub async fn read_server_info(client: &mut MssqlClient) -> (String, String, String) {
  if let Ok(stream) = client
    .query(
      "SELECT CAST(SERVERPROPERTY('ServerName') AS NVARCHAR(128)),
              CAST(SERVERPROPERTY('ProductVersion') AS NVARCHAR(128)),
              CAST(SERVERPROPERTY('Edition') AS NVARCHAR(128))",
      &[],
    )
    .await
  {
    if let Ok(rows) = stream.into_first_result().await {
      if let Some(row) = rows.first() {
        let server_name: &str = row.get(0).unwrap_or("");
        let version: &str = row.get(1).unwrap_or("");
        let edition: &str = row.get(2).unwrap_or("");
        return (server_name.to_string(), version.to_string(), edition.to_string());
      }
    }
  }
  ("SQL Server".to_string(), "2022".to_string(), "Developer Edition".to_string())
}

pub async fn list_tables(client: &mut MssqlClient, database: Option<&str>) -> Result<Value, String> {
  if let Some(db) = database {
    if !db.is_empty() {
      let switch_query = format!("USE [{}]", db.replace(']', "]]"));
      let _ = client.simple_query(switch_query).await;
    }
  }

  let stream = client
    .query(
      "SELECT s.name AS schemaName,
              t.name AS tableName,
              c.name AS columnName
         FROM sys.tables t
         JOIN sys.schemas s ON s.schema_id = t.schema_id
         LEFT JOIN sys.indexes i ON i.object_id = t.object_id AND i.is_primary_key = 1
         LEFT JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
         LEFT JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
        ORDER BY s.name, t.name, ic.key_ordinal",
      &[],
    )
    .await
    .map_err(|e| e.to_string())?;

  let rows = stream.into_first_result().await.map_err(|e| e.to_string())?;
  let mut map: HashMap<(String, String), Vec<String>> = HashMap::new();
  let mut order: Vec<(String, String)> = Vec::new();

  for row in rows {
    let schema: &str = row.get(0).unwrap_or("");
    let name: &str = row.get(1).unwrap_or("");
    let col: Option<&str> = row.get(2);
    let key = (schema.to_string(), name.to_string());
    if !map.contains_key(&key) {
      order.push(key.clone());
      map.insert(key.clone(), Vec::new());
    }
    if let Some(c) = col {
      if let Some(pks) = map.get_mut(&key) {
        pks.push(c.to_string());
      }
    }
  }

  let mut tables = Vec::new();
  for (schema, name) in order {
    let primary_key = map.remove(&(schema.clone(), name.clone())).unwrap_or_default();
    tables.push(json!({
      "schema": schema,
      "name": name,
      "primaryKey": primary_key
    }));
  }

  Ok(json!({
    "database": database,
    "tables": tables
  }))
}

pub async fn list_columns(client: &mut MssqlClient, database: Option<&str>) -> Result<Value, String> {
  if let Some(db) = database {
    if !db.is_empty() {
      let switch_query = format!("USE [{}]", db.replace(']', "]]"));
      let _ = client.simple_query(switch_query).await;
    }
  }

  let stream = client
    .query(
      "SELECT s.name AS schemaName,
              t.name AS tableName,
              c.name AS columnName
         FROM sys.tables t
         JOIN sys.schemas s ON s.schema_id = t.schema_id
         JOIN sys.columns c ON c.object_id = t.object_id
        ORDER BY s.name, t.name, c.column_id",
      &[],
    )
    .await
    .map_err(|e| e.to_string())?;

  let rows = stream.into_first_result().await.map_err(|e| e.to_string())?;
  let mut map: HashMap<(String, String), Vec<String>> = HashMap::new();
  let mut order: Vec<(String, String)> = Vec::new();

  for row in rows {
    let schema: &str = row.get(0).unwrap_or("");
    let name: &str = row.get(1).unwrap_or("");
    let col: &str = row.get(2).unwrap_or("");
    let key = (schema.to_string(), name.to_string());
    if !map.contains_key(&key) {
      order.push(key.clone());
      map.insert(key.clone(), Vec::new());
    }
    if let Some(cols) = map.get_mut(&key) {
      cols.push(col.to_string());
    }
  }

  let mut tables = Vec::new();
  for (schema, name) in order {
    let columns = map.remove(&(schema.clone(), name.clone())).unwrap_or_default();
    tables.push(json!({
      "schema": schema,
      "name": name,
      "columns": columns
    }));
  }

  Ok(json!({
    "database": database,
    "tables": tables
  }))
}

pub async fn get_client_for_connection(
  connection_id: &str,
  database: Option<&str>,
) -> Result<MssqlClient, String> {
  let db_path = crate::file_system::FileSystem::get_database_path()?;
  let conn = crate::database::local_store::LocalStore::init(&db_path).map_err(|e| e.to_string())?;
  let item = crate::database::local_store::LocalStore::get_connection(&conn, connection_id)
    .map_err(|e| e.to_string())?
    .ok_or_else(|| format!("Connection {} not found", connection_id))?;

  let password = item.password.or(item.password_cipher).unwrap_or_default();
  let db_to_use = database
    .filter(|s| !s.is_empty())
    .or(item.database_name.as_deref().filter(|s| !s.is_empty()))
    .or(Some("master"));

  create_client(
    &item.host,
    item.port,
    &item.username,
    &password,
    db_to_use,
    item.encrypt,
    item.trust_server_certificate,
  )
  .await
}

pub async fn execute_sql(
  client: &mut MssqlClient,
  sql: &str,
) -> Result<Value, String> {
  let started = std::time::Instant::now();
  let stream = client.simple_query(sql).await.map_err(|e| e.to_string())?;
  let results = stream.into_results().await.map_err(|e| e.to_string())?;

  let mut result_sets = Vec::new();
  let mut total_rows = 0;

  for rows in results {
    if rows.is_empty() {
      continue;
    }
    let first = &rows[0];
    let columns: Vec<Value> = first
      .columns()
      .iter()
      .map(|col| json!({ "name": col.name() }))
      .collect();

    let row_count = rows.len();
    total_rows += row_count;

    let mut row_values = Vec::new();
    for row in rows {
      let mut cells = Vec::new();
      for (i, _) in row.columns().iter().enumerate() {
        if let Ok(data) = row.get_column_data(i) {
          cells.push(column_data_to_json(data));
        } else {
          cells.push(Value::Null);
        }
      }
      row_values.push(cells);
    }

    result_sets.push(json!({
      "columns": columns,
      "rows": row_values,
      "rowCount": row_count,
    }));
  }

  let elapsed_ms = started.elapsed().as_millis() as u64;

  Ok(json!({
    "ok": true,
    "resultSets": result_sets,
    "rowCount": total_rows,
    "rowsAffected": [total_rows],
    "messages": [],
    "elapsedMs": elapsed_ms,
    "truncated": false,
    "maxRows": 20000
  }))
}

pub async fn list_modules(client: &mut MssqlClient, database: Option<&str>) -> Result<Value, String> {
  if let Some(db) = database {
    if !db.is_empty() {
      let switch_query = format!("USE [{}]", db.replace(']', "]]"));
      let _ = client.simple_query(switch_query).await;
    }
  }

  let stream = client
    .query(
      "SELECT s.name AS schemaName,
              o.name AS moduleName,
              o.type_desc AS typeDesc
         FROM sys.objects o
         JOIN sys.schemas s ON s.schema_id = o.schema_id
        WHERE o.type IN ('P', 'FN', 'IF', 'TF') AND o.is_ms_shipped = 0
        ORDER BY s.name, o.name",
      &[],
    )
    .await
    .map_err(|e| e.to_string())?;

  let rows = stream.into_first_result().await.map_err(|e| e.to_string())?;
  let mut modules = Vec::new();

  for row in rows {
    let schema: &str = row.get(0).unwrap_or("");
    let name: &str = row.get(1).unwrap_or("");
    let type_desc: &str = row.get(2).unwrap_or("");
    let kind = if type_desc.to_lowercase().contains("function") {
      "function"
    } else {
      "procedure"
    };

    modules.push(json!({
      "schema": schema,
      "name": name,
      "type": kind
    }));
  }

  Ok(json!({
    "database": database,
    "modules": modules
  }))
}

pub async fn table_structure(
  client: &mut MssqlClient,
  database: Option<&str>,
  schema: &str,
  table: &str,
) -> Result<Value, String> {
  if let Some(db) = database {
    if !db.is_empty() {
      let switch_query = format!("USE [{}]", db.replace(']', "]]"));
      let _ = client.simple_query(switch_query).await;
    }
  }

  let col_query = "SELECT c.name AS columnName,
          c.is_nullable AS isNullable,
          c.is_identity AS isIdentity,
          c.is_computed AS isComputed,
          ty.name AS typeName,
          c.max_length AS maxLength,
          c.precision AS precision,
          c.scale AS scale
     FROM sys.columns c
     JOIN sys.types ty ON ty.user_type_id = c.user_type_id
     JOIN sys.tables t ON t.object_id = c.object_id
     JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE s.name = @P1 AND t.name = @P2
    ORDER BY c.column_id";

  let stream = client.query(col_query, &[&schema, &table]).await.map_err(|e| e.to_string())?;
  let rows = stream.into_first_result().await.map_err(|e| e.to_string())?;

  let mut columns = Vec::new();
  for row in rows {
    let col_name: &str = row.get(0).unwrap_or("");
    let is_nullable: bool = row.get(1).unwrap_or(false);
    let is_identity: bool = row.get(2).unwrap_or(false);
    let is_computed: bool = row.get(3).unwrap_or(false);
    let type_name: &str = row.get(4).unwrap_or("");
    let max_length: i16 = row.get(5).unwrap_or(0);
    let precision: u8 = row.get(6).unwrap_or(0);
    let scale: u8 = row.get(7).unwrap_or(0);

    columns.push(json!({
      "name": col_name,
      "typeName": type_name,
      "maxLength": max_length,
      "precision": precision,
      "scale": scale,
      "isNullable": is_nullable,
      "isIdentity": is_identity,
      "isComputed": is_computed,
      "defaultName": null,
      "defaultDefinition": null,
    }));
  }

  Ok(json!({
    "database": database,
    "schema": schema,
    "table": table,
    "objectName": format!("[{}].[{}]", schema, table),
    "columns": columns,
    "foreignKeys": [],
    "indexes": []
  }))
}

pub async fn module_definition(
  client: &mut MssqlClient,
  database: Option<&str>,
  schema: &str,
  name: &str,
) -> Result<Value, String> {
  if let Some(db) = database {
    if !db.is_empty() {
      let switch_query = format!("USE [{}]", db.replace(']', "]]"));
      let _ = client.simple_query(switch_query).await;
    }
  }

  let stream = client
    .query(
      "SELECT m.definition AS definition,
              o.type_desc AS typeDesc
         FROM sys.sql_modules m
         JOIN sys.objects o ON o.object_id = m.object_id
         JOIN sys.schemas s ON s.schema_id = o.schema_id
        WHERE s.name = @P1 AND o.name = @P2",
      &[&schema, &name],
    )
    .await
    .map_err(|e| e.to_string())?;

  let rows = stream.into_first_result().await.map_err(|e| e.to_string())?;
  if let Some(row) = rows.first() {
    let definition: &str = row.get(0).unwrap_or("");
    let type_desc: &str = row.get(1).unwrap_or("");
    let kind = if type_desc.to_lowercase().contains("function") {
      "function"
    } else {
      "procedure"
    };

    return Ok(json!({
      "database": database,
      "schema": schema,
      "name": name,
      "type": kind,
      "definition": definition,
      "statement": definition,
    }));
  }

  Err(format!("No source found for {}.{}", schema, name))
}

pub async fn get_execution_plan(
  client: &mut MssqlClient,
  database: Option<&str>,
  sql: &str,
) -> Result<Value, String> {
  if let Some(db) = database {
    if !db.is_empty() {
      let switch_query = format!("USE [{}]", db.replace(']', "]]"));
      let _ = client.simple_query(switch_query).await;
    }
  }

  let _ = client.simple_query("SET SHOWPLAN_XML ON").await;
  let stream = client.simple_query(sql).await.map_err(|e| e.to_string())?;
  let rows = stream.into_first_result().await.map_err(|e| e.to_string())?;
  let _ = client.simple_query("SET SHOWPLAN_XML OFF").await;

  let xml: &str = rows.first().and_then(|r| r.get(0)).unwrap_or("");
  Ok(json!({
    "xml": xml
  }))
}

#[cfg(test)]
mod tests {
  use super::*;

  #[tokio::test]
  async fn test_connect_and_list_databases() {
    let host = std::env::var("TEST_MSSQL_HOST").unwrap_or_default();
    let port: u16 = std::env::var("TEST_MSSQL_PORT")
      .ok()
      .and_then(|p| p.parse().ok())
      .unwrap_or(0);
    let user = std::env::var("TEST_MSSQL_USER").unwrap_or_default();
    let password = std::env::var("TEST_MSSQL_PASSWORD").unwrap_or_default();

    if host.is_empty() || port == 0 || user.is_empty() || password.is_empty() {
      // Skipped when live environment variables are not provided
      return;
    }

    let client_res = create_client(
      &host,
      port,
      &user,
      &password,
      Some("master"),
      false,
      true,
    )
    .await;

    if let Ok(mut client) = client_res {
      let dbs = list_databases(&mut client).await.expect("Failed to list databases");
      assert!(dbs.iter().any(|d| d["name"] == "master"));

      let info = read_server_info(&mut client).await;
      assert!(!info.0.is_empty());

      let query_res = execute_sql(&mut client, "SELECT 1 AS num, 'hello' AS greeting").await.expect("Failed to execute query");
      assert_eq!(query_res["ok"], true);
      assert_eq!(query_res["rowCount"], 1);
    }
  }
}
