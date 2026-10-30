use chrono::{DateTime, FixedOffset, NaiveDate, NaiveDateTime, NaiveTime};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use tiberius::{AuthMethod, Client, ColumnData, Config, EncryptionLevel, FromSql};
use tokio::net::TcpStream;
use tokio_util::compat::{Compat, TokioAsyncWriteCompatExt};

pub type MssqlClient = Client<Compat<TcpStream>>;

pub fn column_data_to_json(data: &ColumnData<'static>) -> Value {
  match data {
    ColumnData::Bit(opt) => opt.map(|flag| Value::from(if flag { 1 } else { 0 })).unwrap_or(Value::Null),
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
    ColumnData::DateTime(_) | ColumnData::SmallDateTime(_) | ColumnData::DateTime2(_) => {
      match NaiveDateTime::from_sql(data) {
        Ok(Some(dt)) => Value::String(dt.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()),
        _ => Value::Null,
      }
    }
    ColumnData::Date(_) => {
      match NaiveDate::from_sql(data) {
        Ok(Some(d)) => Value::String(d.format("%Y-%m-%d").to_string()),
        _ => Value::Null,
      }
    }
    ColumnData::Time(_) => {
      match NaiveTime::from_sql(data) {
        Ok(Some(t)) => Value::String(t.format("%H:%M:%S%.3f").to_string()),
        _ => Value::Null,
      }
    }
    ColumnData::DateTimeOffset(_) => {
      match DateTime::<FixedOffset>::from_sql(data) {
        Ok(Some(dto)) => Value::String(dto.to_rfc3339()),
        _ => Value::Null,
      }
    }
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

fn quote_name(value: &str) -> String {
  format!("[{}]", value.replace(']', "]]"))
}

struct TableColumnItem {
  name: String,
  type_name: String,
  max_length: i16,
  precision: u8,
  scale: u8,
  is_nullable: bool,
  is_identity: bool,
  is_computed: bool,
  computed_definition: Option<String>,
  seed_value: Option<i64>,
  increment_value: Option<i64>,
  collation: Option<String>,
  database_collation: Option<String>,
  default_name: Option<String>,
  default_definition: Option<String>,
}

fn build_column_definition(col: &TableColumnItem) -> String {
  if col.is_computed {
    return format!(
      "{} AS {}",
      quote_name(&col.name),
      col.computed_definition.as_deref().unwrap_or("")
    );
  }

  let type_lower = col.type_name.to_lowercase();
  let type_str = match type_lower.as_str() {
    "decimal" | "numeric" => format!("{}({}, {})", col.type_name, col.precision, col.scale),
    "datetime2" | "datetimeoffset" | "time" => format!("{}({})", col.type_name, col.scale),
    "char" | "varchar" | "binary" | "varbinary" => {
      if col.max_length == -1 {
        format!("{}(MAX)", col.type_name)
      } else {
        format!("{}({})", col.type_name, col.max_length)
      }
    }
    "nchar" | "nvarchar" => {
      if col.max_length == -1 {
        format!("{}(MAX)", col.type_name)
      } else {
        format!("{}({})", col.type_name, col.max_length / 2)
      }
    }
    _ => col.type_name.clone(),
  };

  let mut definition = format!("{} {}", quote_name(&col.name), type_str);

  if col.is_identity {
    let seed = col.seed_value.unwrap_or(1);
    let inc = col.increment_value.unwrap_or(1);
    definition.push_str(&format!(" IDENTITY({}, {})", seed, inc));
  }

  if let Some(collat) = &col.collation {
    if col.database_collation.as_ref() != Some(collat) {
      definition.push_str(&format!(" COLLATE {}", collat));
    }
  }

  if !col.is_nullable {
    definition.push_str(" NOT NULL");
  }

  definition
}

struct KeyEntry {
  name: String,
  primary: bool,
  unique: bool,
  unique_constraint: bool,
  clustered: bool,
  columns: Vec<String>,
  column_names: Vec<String>,
  descending: Vec<bool>,
}

struct FkItem {
  column: String,
  referenced_column: String,
}

struct FkGroup {
  name: String,
  referenced_schema: String,
  referenced_table: String,
  columns: Vec<FkItem>,
}

pub async fn table_relations(
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

  let rel_query = "SELECT pc.name AS columnName,
          rs.name AS referencedSchema,
          rt.name AS referencedTable,
          rc.name AS referencedColumn
     FROM sys.foreign_keys fk
     JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
     JOIN sys.columns pc ON pc.object_id = fkc.parent_object_id AND pc.column_id = fkc.parent_column_id
     JOIN sys.tables rt ON rt.object_id = fkc.referenced_object_id
     JOIN sys.schemas rs ON rs.schema_id = rt.schema_id
     JOIN sys.columns rc ON rc.object_id = fkc.referenced_object_id AND rc.column_id = fkc.referenced_column_id
     JOIN sys.tables t ON t.object_id = fk.parent_object_id
     JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE s.name = @P1 AND t.name = @P2
    ORDER BY fk.name, fkc.constraint_column_id";

  let mut relations = Vec::new();
  if let Ok(stream) = client.query(rel_query, &[&schema, &table]).await {
    if let Ok(rows) = stream.into_first_result().await {
      for row in rows {
        let col: &str = row.get(0).unwrap_or("");
        let ref_schema: &str = row.get(1).unwrap_or("");
        let ref_table: &str = row.get(2).unwrap_or("");
        let ref_col: &str = row.get(3).unwrap_or("");
        relations.push(json!({
          "column": col,
          "referencedSchema": ref_schema,
          "referencedTable": ref_table,
          "referencedColumn": ref_col,
        }));
      }
    }
  }

  Ok(json!({
    "ok": true,
    "relations": relations
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

  // 1. Default constraints
  let def_query = "SELECT c.name AS columnName, d.name AS constraintName, d.definition AS definition
     FROM sys.default_constraints d
     JOIN sys.columns c ON c.object_id = d.parent_object_id AND c.column_id = d.parent_column_id
     JOIN sys.tables t ON t.object_id = d.parent_object_id
     JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE s.name = @P1 AND t.name = @P2";

  let mut defaults: HashMap<String, (String, String)> = HashMap::new();
  if let Ok(stream) = client.query(def_query, &[&schema, &table]).await {
    if let Ok(rows) = stream.into_first_result().await {
      for row in rows {
        let col_name: &str = row.get(0).unwrap_or("");
        let constr_name: &str = row.get(1).unwrap_or("");
        let definition: &str = row.get(2).unwrap_or("");
        if !col_name.is_empty() {
          defaults.insert(col_name.to_string(), (constr_name.to_string(), definition.to_string()));
        }
      }
    }
  }

  // 2. Columns
  let col_query = "SELECT c.name AS columnName,
          c.is_nullable AS isNullable,
          c.is_identity AS isIdentity,
          c.is_computed AS isComputed,
          cc.definition AS computedDefinition,
          CAST(ic.seed_value AS bigint) AS seedValue,
          CAST(ic.increment_value AS bigint) AS incrementValue,
          c.collation_name AS collation,
          CAST(DATABASEPROPERTYEX(DB_NAME(), 'Collation') AS nvarchar(128)) AS databaseCollation,
          ty.name AS typeName,
          c.max_length AS maxLength,
          c.precision AS precision,
          c.scale AS scale
     FROM sys.columns c
     JOIN sys.types ty ON ty.user_type_id = c.user_type_id
     LEFT JOIN sys.identity_columns ic ON ic.object_id = c.object_id AND ic.column_id = c.column_id
     LEFT JOIN sys.computed_columns cc ON cc.object_id = c.object_id AND cc.column_id = c.column_id
     JOIN sys.tables t ON t.object_id = c.object_id
     JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE s.name = @P1 AND t.name = @P2
    ORDER BY c.column_id";

  let stream = client.query(col_query, &[&schema, &table]).await.map_err(|e| e.to_string())?;
  let rows = stream.into_first_result().await.map_err(|e| e.to_string())?;

  let mut columns: Vec<TableColumnItem> = Vec::new();
  for row in rows {
    let col_name: &str = row.get(0).unwrap_or("");
    let is_nullable: bool = row.get(1).unwrap_or(false);
    let is_identity: bool = row.get(2).unwrap_or(false);
    let is_computed: bool = row.get(3).unwrap_or(false);
    let computed_def: Option<&str> = row.get(4);
    let seed_value: Option<i64> = row.get(5);
    let increment_value: Option<i64> = row.get(6);
    let collation: Option<&str> = row.get(7);
    let db_collation: Option<&str> = row.get(8);
    let type_name: &str = row.get(9).unwrap_or("");
    let max_length: i16 = row.get(10).unwrap_or(0);
    let precision: u8 = row.get(11).unwrap_or(0);
    let scale: u8 = row.get(12).unwrap_or(0);

    let (def_name, def_definition) = defaults
      .get(col_name)
      .map(|(n, d)| (Some(n.clone()), Some(d.clone())))
      .unwrap_or((None, None));

    columns.push(TableColumnItem {
      name: col_name.to_string(),
      type_name: type_name.to_string(),
      max_length,
      precision,
      scale,
      is_nullable,
      is_identity,
      is_computed,
      computed_definition: computed_def.map(|s| s.to_string()),
      seed_value,
      increment_value,
      collation: collation.map(|s| s.to_string()),
      database_collation: db_collation.map(|s| s.to_string()),
      default_name: def_name,
      default_definition: def_definition,
    });
  }

  // 3. Keys and Indexes
  let keys_query = "SELECT i.is_primary_key AS isPrimaryKey,
          i.is_unique AS isUnique,
          i.is_unique_constraint AS isUniqueConstraint,
          i.type_desc AS typeDesc,
          i.name AS indexName,
          col.name AS columnName,
          ic.is_descending_key AS isDescending
     FROM sys.indexes i
     JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
     JOIN sys.columns col ON col.object_id = ic.object_id AND col.column_id = ic.column_id
     JOIN sys.tables t ON t.object_id = i.object_id
     JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE s.name = @P1 AND t.name = @P2 AND ic.is_included_column = 0
      AND i.is_hypothetical = 0 AND i.type IN (1, 2)
    ORDER BY i.is_primary_key DESC, i.name, ic.key_ordinal";

  let mut key_order: Vec<String> = Vec::new();
  let mut key_map: HashMap<String, KeyEntry> = HashMap::new();

  if let Ok(stream) = client.query(keys_query, &[&schema, &table]).await {
    if let Ok(rows) = stream.into_first_result().await {
      for row in rows {
        let is_primary: bool = row.get(0).unwrap_or(false);
        let is_unique: bool = row.get(1).unwrap_or(false);
        let is_unique_constraint: bool = row.get(2).unwrap_or(false);
        let type_desc: &str = row.get(3).unwrap_or("");
        let index_name: &str = row.get(4).unwrap_or("");
        let col_name: &str = row.get(5).unwrap_or("");
        let is_descending: bool = row.get(6).unwrap_or(false);

        let prefix = if is_unique_constraint { "uq" } else if is_primary { "pk" } else { "ix" };
        let map_key = format!("{}::{}", prefix, index_name);

        if !key_map.contains_key(&map_key) {
          key_order.push(map_key.clone());
          key_map.insert(map_key.clone(), KeyEntry {
            name: index_name.to_string(),
            primary: is_primary,
            unique: is_unique,
            unique_constraint: is_unique_constraint,
            clustered: type_desc.to_uppercase().starts_with("CLUSTERED"),
            columns: Vec::new(),
            column_names: Vec::new(),
            descending: Vec::new(),
          });
        }

        if let Some(entry) = key_map.get_mut(&map_key) {
          let col_formatted = if is_descending {
            format!("{} DESC", quote_name(col_name))
          } else {
            quote_name(col_name)
          };
          entry.columns.push(col_formatted);
          entry.column_names.push(col_name.to_string());
          entry.descending.push(is_descending);
        }
      }
    }
  }

  let mut keys: Vec<KeyEntry> = Vec::new();
  let mut indexes: Vec<KeyEntry> = Vec::new();

  for map_key in key_order {
    if let Some(entry) = key_map.remove(&map_key) {
      if entry.primary || entry.unique_constraint {
        keys.push(entry);
      } else {
        indexes.push(entry);
      }
    }
  }

  // 4. Foreign Keys
  let fk_query = "SELECT fk.name AS foreignKeyName,
          pc.name AS parentColumn,
          rs.name AS referencedSchema,
          rt.name AS referencedTable,
          rc.name AS referencedColumn
     FROM sys.foreign_keys fk
     JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
     JOIN sys.columns pc ON pc.object_id = fkc.parent_object_id AND pc.column_id = fkc.parent_column_id
     JOIN sys.tables rt ON rt.object_id = fkc.referenced_object_id
     JOIN sys.schemas rs ON rs.schema_id = rt.schema_id
     JOIN sys.columns rc ON rc.object_id = fkc.referenced_object_id AND rc.column_id = fkc.referenced_column_id
     JOIN sys.tables t ON t.object_id = fk.parent_object_id
     JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE s.name = @P1 AND t.name = @P2
    ORDER BY fk.name, fkc.constraint_column_id";

  let mut fk_order: Vec<String> = Vec::new();
  let mut fk_map: HashMap<String, FkGroup> = HashMap::new();

  if let Ok(stream) = client.query(fk_query, &[&schema, &table]).await {
    if let Ok(rows) = stream.into_first_result().await {
      for row in rows {
        let fk_name: &str = row.get(0).unwrap_or("");
        let parent_col: &str = row.get(1).unwrap_or("");
        let ref_schema: &str = row.get(2).unwrap_or("");
        let ref_table: &str = row.get(3).unwrap_or("");
        let ref_col: &str = row.get(4).unwrap_or("");

        if !fk_map.contains_key(fk_name) {
          fk_order.push(fk_name.to_string());
          fk_map.insert(fk_name.to_string(), FkGroup {
            name: fk_name.to_string(),
            referenced_schema: ref_schema.to_string(),
            referenced_table: ref_table.to_string(),
            columns: Vec::new(),
          });
        }

        if let Some(entry) = fk_map.get_mut(fk_name) {
          entry.columns.push(FkItem {
            column: parent_col.to_string(),
            referenced_column: ref_col.to_string(),
          });
        }
      }
    }
  }

  let mut foreign_keys: Vec<FkGroup> = Vec::new();
  for fk_name in fk_order {
    if let Some(entry) = fk_map.remove(&fk_name) {
      foreign_keys.push(entry);
    }
  }

  // 5. Build DDL Statement
  let mut lines = Vec::new();
  for col in &columns {
    let mut def = build_column_definition(col);
    if let Some(default_def) = &col.default_definition {
      if !col.is_computed {
        def.push_str(&format!(" DEFAULT {}", default_def));
      }
    }
    lines.push(def);
  }

  for foreign in &foreign_keys {
    let columns_list = foreign.columns.iter().map(|item| quote_name(&item.column)).collect::<Vec<_>>().join(", ");
    let referenced_list = foreign.columns.iter().map(|item| quote_name(&item.referenced_column)).collect::<Vec<_>>().join(", ");
    lines.push(format!(
      "CONSTRAINT {} FOREIGN KEY ({}) REFERENCES {}.{} ({})",
      quote_name(&foreign.name),
      columns_list,
      quote_name(&foreign.referenced_schema),
      quote_name(&foreign.referenced_table),
      referenced_list
    ));
  }

  for key in &keys {
    if key.primary {
      lines.push(format!("PRIMARY KEY ({})", key.columns.join(", ")));
    } else {
      let modifier = if key.clustered { " CLUSTERED" } else { "" };
      lines.push(format!("CONSTRAINT {} UNIQUE{} ({})", quote_name(&key.name), modifier, key.columns.join(", ")));
    }
  }

  let body = lines.iter().map(|line| format!("  {}", line)).collect::<Vec<_>>().join(", \n");
  let statement = format!("CREATE TABLE {}.{} (\n{}\n);", quote_name(schema), quote_name(table), body);

  // 6. Format JSON responses
  let json_columns: Vec<Value> = columns.iter().map(|col| json!({
    "name": col.name,
    "typeName": col.type_name,
    "maxLength": col.max_length,
    "precision": col.precision,
    "scale": col.scale,
    "isNullable": col.is_nullable,
    "isIdentity": col.is_identity,
    "isComputed": col.is_computed,
    "computedDefinition": col.computed_definition,
    "seedValue": col.seed_value,
    "incrementValue": col.increment_value,
    "collation": col.collation,
    "databaseCollation": col.database_collation,
    "defaultName": col.default_name,
    "defaultDefinition": col.default_definition,
  })).collect();

  let json_primary_key: Vec<Value> = keys.iter().filter(|k| k.primary).map(|k| json!({
    "name": k.name,
    "columns": k.column_names,
    "descending": k.descending,
    "clustered": k.clustered,
  })).collect();

  let json_unique_keys: Vec<Value> = keys.iter().filter(|k| !k.primary).map(|k| json!({
    "name": k.name,
    "columns": k.column_names,
    "descending": k.descending,
    "clustered": k.clustered,
  })).collect();

  let json_indexes: Vec<Value> = indexes.iter().map(|idx| json!({
    "name": idx.name,
    "columns": idx.column_names,
    "descending": idx.descending,
    "unique": idx.unique,
    "clustered": idx.clustered,
  })).collect();

  let json_foreign_keys: Vec<Value> = foreign_keys.iter().map(|fk| json!({
    "name": fk.name,
    "referencedSchema": fk.referenced_schema,
    "referencedTable": fk.referenced_table,
    "columns": fk.columns.iter().map(|c| json!({
      "column": c.column,
      "referencedColumn": c.referenced_column,
    })).collect::<Vec<_>>(),
  })).collect();

  Ok(json!({
    "database": database,
    "schema": schema,
    "table": table,
    "objectName": format!("{}.{}", quote_name(schema), quote_name(table)),
    "statement": statement,
    "columns": json_columns,
    "foreignKeys": json_foreign_keys,
    "primaryKey": json_primary_key,
    "uniqueKeys": json_unique_keys,
    "indexes": json_indexes,
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
