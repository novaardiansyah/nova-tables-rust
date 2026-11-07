use chrono::Utc;
use rusqlite::{params, Connection};
use serde_json::{json, Value};
use std::path::PathBuf;

pub fn app_db_path() -> Result<PathBuf, String> {
  let base = dirs::data_dir()
    .or_else(dirs::config_dir)
    .ok_or_else(|| "Could not determine application data directory".to_string())?;
  let app_dir = base.join("nova-tables");
  if !app_dir.exists() {
    std::fs::create_dir_all(&app_dir)
      .map_err(|e| format!("Failed to create app data directory: {e}"))?;
  }
  Ok(app_dir.join("query_history.db"))
}

fn open() -> Result<Connection, String> {
  let path = app_db_path()?;
  let conn = Connection::open(path).map_err(|e| format!("Failed to open SQLite: {e}"))?;
  conn.busy_timeout(std::time::Duration::from_millis(5000))
    .map_err(|e| format!("Failed to set busy timeout: {e}"))?;
  conn.pragma_update(None, "journal_mode", "WAL")
    .map_err(|e| format!("Failed to set journal mode: {e}"))?;
  conn.pragma_update(None, "synchronous", "NORMAL")
    .map_err(|e| format!("Failed to set synchronous mode: {e}"))?;
  Ok(conn)
}

pub fn init() -> Result<(), String> {
  let conn = open()?;
  conn.execute_batch(
    "CREATE TABLE IF NOT EXISTS local_folders (
      uid TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      action TEXT NOT NULL DEFAULT 'upsert',
      synced INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_lf_synced ON local_folders(synced);

    CREATE TABLE IF NOT EXISTS local_connections (
      uid TEXT PRIMARY KEY,
      folder_id TEXT,
      name TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER NOT NULL DEFAULT 1433,
      username TEXT NOT NULL DEFAULT '',
      password_cipher TEXT,
      database_name TEXT NOT NULL DEFAULT '',
      environment TEXT NOT NULL DEFAULT '',
      encrypt INTEGER NOT NULL DEFAULT 1,
      trust_server_certificate INTEGER NOT NULL DEFAULT 1,
      driver_type TEXT NOT NULL DEFAULT 'sqlserver',
      timezone TEXT,
      last_database_used TEXT,
      last_connected_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      action TEXT NOT NULL DEFAULT 'upsert',
      synced INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_lc_synced ON local_connections(synced);

    CREATE TABLE IF NOT EXISTS local_saved_queries (
      uid TEXT PRIMARY KEY,
      connection_id TEXT,
      database_name TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL,
      sql TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      action TEXT NOT NULL DEFAULT 'upsert',
      synced INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_lsq_synced ON local_saved_queries(synced);

    CREATE TABLE IF NOT EXISTS local_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      action TEXT NOT NULL DEFAULT 'upsert',
      synced INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_lm_synced ON local_meta(synced);",
  )
  .map_err(|e| format!("Failed to initialize local_store tables: {e}"))?;

  Ok(())
}

pub fn upsert_folder(uid: &str, name: &str, parent_id: Option<&str>) -> Result<Value, String> {
  let conn = open()?;
  let now = Utc::now().to_rfc3339();

  conn.execute(
    "INSERT INTO local_folders (uid, name, parent_id, created_at, updated_at, action, synced)
     VALUES (?1, ?2, ?3, ?4, ?4, 'upsert', 0)
     ON CONFLICT(uid) DO UPDATE SET
       name = excluded.name,
       parent_id = excluded.parent_id,
       updated_at = excluded.updated_at,
       action = 'upsert',
       synced = 0",
    params![uid, name, parent_id, now],
  )
  .map_err(|e| format!("Failed to upsert local folder: {e}"))?;

  Ok(json!({
    "id": uid,
    "uid": uid,
    "name": name,
    "parentId": parent_id,
    "createdAt": now,
  }))
}

pub fn delete_folder(uid: &str) -> Result<bool, String> {
  let conn = open()?;
  let now = Utc::now().to_rfc3339();

  conn.execute(
    "INSERT INTO local_folders (uid, name, parent_id, created_at, updated_at, action, synced)
     VALUES (?1, '', NULL, ?2, ?2, 'delete', 0)
     ON CONFLICT(uid) DO UPDATE SET
       action = 'delete',
       updated_at = excluded.updated_at,
       synced = 0",
    params![uid, now],
  )
  .map_err(|e| format!("Failed to record delete local folder: {e}"))?;

  Ok(true)
}

pub fn list_folders() -> Result<Vec<Value>, String> {
  let conn = open()?;
  let mut stmt = conn
    .prepare("SELECT uid, name, parent_id, created_at FROM local_folders WHERE action != 'delete' ORDER BY name ASC")
    .map_err(|e| format!("Failed to prepare list folders: {e}"))?;

  let rows = stmt
    .query_map([], |row| {
      let uid: String = row.get(0)?;
      let name: String = row.get(1)?;
      let parent_id: Option<String> = row.get(2)?;
      let created_at: String = row.get(3)?;
      Ok(json!({
        "id": uid,
        "uid": uid,
        "name": name,
        "parentId": parent_id,
        "createdAt": created_at,
      }))
    })
    .map_err(|e| format!("Failed to query local folders: {e}"))?;

  let mut list = Vec::new();
  for r in rows {
    list.push(r.map_err(|e| format!("Failed to read folder row: {e}"))?);
  }
  Ok(list)
}

pub fn upsert_connection(data: &Value) -> Result<Value, String> {
  let conn = open()?;
  let uid = data.get("id").or_else(|| data.get("uid")).and_then(|v| v.as_str()).unwrap_or("");
  if uid.is_empty() {
    return Err("Connection id/uid is required".to_string());
  }

  let name = data.get("name").and_then(|v| v.as_str()).unwrap_or("");
  let host = data.get("host").and_then(|v| v.as_str()).unwrap_or("");
  let port = data.get("port").and_then(|v| v.as_i64()).unwrap_or(1433);
  let username = data.get("username").and_then(|v| v.as_str()).unwrap_or("");
  let password_cipher = data.get("password").and_then(|v| v.as_str());
  let database_name = data.get("databaseName").or_else(|| data.get("database")).and_then(|v| v.as_str()).unwrap_or("");
  let environment = data.get("environment").and_then(|v| v.as_str()).unwrap_or("");
  let encrypt = if data.get("encrypt").and_then(|v| v.as_bool()).unwrap_or(true) { 1 } else { 0 };
  let trust_cert = if data.get("trustServerCertificate").and_then(|v| v.as_bool()).unwrap_or(true) { 1 } else { 0 };
  let driver_type = data.get("driverType").and_then(|v| v.as_str()).unwrap_or("sqlserver");
  let folder_id = data.get("folderId").or_else(|| data.get("folder_id")).and_then(|v| v.as_str());
  let timezone = data.get("timezone").and_then(|v| v.as_str());
  let last_db = data.get("lastDatabaseUsed").and_then(|v| v.as_str());
  let last_conn = data.get("lastConnectedAt").and_then(|v| v.as_str());
  let now = Utc::now().to_rfc3339();

  conn.execute(
    "INSERT INTO local_connections (uid, folder_id, name, host, port, username, password_cipher, database_name, environment, encrypt, trust_server_certificate, driver_type, timezone, last_database_used, last_connected_at, created_at, updated_at, action, synced)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?16, 'upsert', 0)
     ON CONFLICT(uid) DO UPDATE SET
       folder_id = excluded.folder_id,
       name = excluded.name,
       host = excluded.host,
       port = excluded.port,
       username = excluded.username,
       password_cipher = COALESCE(excluded.password_cipher, local_connections.password_cipher),
       database_name = excluded.database_name,
       environment = excluded.environment,
       encrypt = excluded.encrypt,
       trust_server_certificate = excluded.trust_server_certificate,
       driver_type = excluded.driver_type,
       timezone = excluded.timezone,
       last_database_used = COALESCE(excluded.last_database_used, local_connections.last_database_used),
       last_connected_at = COALESCE(excluded.last_connected_at, local_connections.last_connected_at),
       updated_at = excluded.updated_at,
       action = 'upsert',
       synced = 0",
    params![uid, folder_id, name, host, port, username, password_cipher, database_name, environment, encrypt, trust_cert, driver_type, timezone, last_db, last_conn, now],
  )
  .map_err(|e| format!("Failed to upsert local connection: {e}"))?;

  Ok(json!({
    "id": uid,
    "uid": uid,
    "name": name,
    "host": host,
    "port": port,
    "username": username,
    "database": database_name,
    "databaseName": database_name,
    "folderId": folder_id,
    "environment": environment,
    "encrypt": encrypt != 0,
    "trustServerCertificate": trust_cert != 0,
    "driverType": driver_type,
    "timezone": timezone,
    "lastDatabaseUsed": last_db,
    "lastConnectedAt": last_conn,
  }))
}

pub fn delete_connection(uid: &str) -> Result<bool, String> {
  let conn = open()?;
  let now = Utc::now().to_rfc3339();

  conn.execute(
    "INSERT INTO local_connections (uid, folder_id, name, host, port, username, password_cipher, database_name, environment, encrypt, trust_server_certificate, driver_type, timezone, last_database_used, last_connected_at, created_at, updated_at, action, synced)
     VALUES (?1, NULL, '', '', 1433, '', NULL, '', '', 1, 1, 'sqlserver', NULL, NULL, NULL, ?2, ?2, 'delete', 0)
     ON CONFLICT(uid) DO UPDATE SET
       action = 'delete',
       updated_at = excluded.updated_at,
       synced = 0",
    params![uid, now],
  )
  .map_err(|e| format!("Failed to record delete local connection: {e}"))?;

  Ok(true)
}

pub fn list_connections() -> Result<Vec<Value>, String> {
  let conn = open()?;
  let mut stmt = conn
    .prepare("SELECT uid, folder_id, name, host, port, username, password_cipher, database_name, environment, encrypt, trust_server_certificate, driver_type, timezone, last_database_used, last_connected_at, created_at, updated_at FROM local_connections WHERE action != 'delete' ORDER BY name ASC")
    .map_err(|e| format!("Failed to prepare list connections: {e}"))?;

  let rows = stmt
    .query_map([], |row| {
      let uid: String = row.get(0)?;
      let folder_id: Option<String> = row.get(1)?;
      let name: String = row.get(2)?;
      let host: String = row.get(3)?;
      let port: i64 = row.get(4)?;
      let username: String = row.get(5)?;
      let password_cipher: Option<String> = row.get(6)?;
      let database_name: String = row.get(7)?;
      let environment: String = row.get(8)?;
      let encrypt: i64 = row.get(9)?;
      let trust_cert: i64 = row.get(10)?;
      let driver_type: String = row.get(11)?;
      let timezone: Option<String> = row.get(12)?;
      let last_db: Option<String> = row.get(13)?;
      let last_conn: Option<String> = row.get(14)?;
      let created_at: String = row.get(15)?;
      let updated_at: String = row.get(16)?;

      let has_pass = password_cipher.as_ref().map(|s| !s.is_empty()).unwrap_or(false);

      Ok(json!({
        "id": uid,
        "uid": uid,
        "name": name,
        "host": host,
        "port": port,
        "username": username,
        "password": password_cipher,
        "hasPassword": has_pass,
        "database": database_name,
        "databaseName": database_name,
        "folderId": folder_id,
        "environment": environment,
        "encrypt": encrypt != 0,
        "trustServerCertificate": trust_cert != 0,
        "driverType": driver_type,
        "timezone": timezone,
        "lastDatabaseUsed": last_db,
        "lastConnectedAt": last_conn,
        "createdAt": created_at,
        "updatedAt": updated_at,
      }))
    })
    .map_err(|e| format!("Failed to query local connections: {e}"))?;

  let mut list = Vec::new();
  for r in rows {
    list.push(r.map_err(|e| format!("Failed to read connection row: {e}"))?);
  }
  Ok(list)
}

pub fn upsert_saved_query(data: &Value) -> Result<Value, String> {
  let conn = open()?;
  let uid = data.get("id").or_else(|| data.get("uid")).and_then(|v| v.as_str()).unwrap_or("");
  if uid.is_empty() {
    return Err("Saved query id/uid is required".to_string());
  }

  let connection_id = data.get("connectionId").or_else(|| data.get("connection_id")).and_then(|v| v.as_str());
  let database_name = data.get("databaseName").or_else(|| data.get("database_name")).or_else(|| data.get("database")).and_then(|v| v.as_str()).unwrap_or("");
  let name = data.get("name").or_else(|| data.get("title")).and_then(|v| v.as_str()).unwrap_or("");
  let sql = data.get("sql").or_else(|| data.get("query")).and_then(|v| v.as_str()).unwrap_or("");
  let now = Utc::now().to_rfc3339();

  conn.execute(
    "INSERT INTO local_saved_queries (uid, connection_id, database_name, name, sql, created_at, updated_at, action, synced)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6, 'upsert', 0)
     ON CONFLICT(uid) DO UPDATE SET
       connection_id = COALESCE(excluded.connection_id, local_saved_queries.connection_id),
       database_name = excluded.database_name,
       name = excluded.name,
       sql = excluded.sql,
       updated_at = excluded.updated_at,
       action = 'upsert',
       synced = 0",
    params![uid, connection_id, database_name, name, sql, now],
  )
  .map_err(|e| format!("Failed to upsert local saved query: {e}"))?;

  Ok(json!({
    "id": uid,
    "uid": uid,
    "connectionId": connection_id,
    "databaseName": database_name,
    "name": name,
    "sql": sql,
    "createdAt": now,
    "updatedAt": now,
  }))
}

pub fn delete_saved_query(uid: &str) -> Result<bool, String> {
  let conn = open()?;
  let now = Utc::now().to_rfc3339();

  conn.execute(
    "INSERT INTO local_saved_queries (uid, connection_id, database_name, name, sql, created_at, updated_at, action, synced)
     VALUES (?1, NULL, '', '', '', ?2, ?2, 'delete', 0)
     ON CONFLICT(uid) DO UPDATE SET
       action = 'delete',
       updated_at = excluded.updated_at,
       synced = 0",
    params![uid, now],
  )
  .map_err(|e| format!("Failed to record delete local saved query: {e}"))?;

  Ok(true)
}

pub fn list_saved_queries(connection_id: Option<&str>, database: Option<&str>) -> Result<Vec<Value>, String> {
  let conn = open()?;
  let mut sql = String::from(
    "SELECT uid, connection_id, database_name, name, sql, created_at, updated_at FROM local_saved_queries WHERE action != 'delete'",
  );
  let mut params_vec: Vec<String> = Vec::new();
  if let Some(cid) = connection_id {
    if !cid.is_empty() {
      sql.push_str(" AND (connection_id = ? OR connection_id IS NULL)");
      params_vec.push(cid.to_string());
    }
  }
  if let Some(db) = database {
    if !db.is_empty() {
      sql.push_str(" AND (database_name = ? OR database_name = '')");
      params_vec.push(db.to_string());
    }
  }
  sql.push_str(" ORDER BY name ASC");

  let mut stmt = conn.prepare(&sql).map_err(|e| format!("Failed to prepare list saved queries: {e}"))?;
  let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|s| s as &dyn rusqlite::ToSql).collect();

  let rows = stmt
    .query_map(params_refs.as_slice(), |row| {
      let uid: String = row.get(0)?;
      let conn_id: Option<String> = row.get(1)?;
      let db_name: String = row.get(2)?;
      let name: String = row.get(3)?;
      let qsql: String = row.get(4)?;
      let created_at: String = row.get(5)?;
      let updated_at: String = row.get(6)?;

      Ok(json!({
        "id": uid,
        "uid": uid,
        "connectionId": conn_id,
        "databaseName": db_name,
        "name": name,
        "sql": qsql,
        "createdAt": created_at,
        "updatedAt": updated_at,
      }))
    })
    .map_err(|e| format!("Failed to query saved queries: {e}"))?;

  let mut list = Vec::new();
  for r in rows {
    list.push(r.map_err(|e| format!("Failed to read saved query row: {e}"))?);
  }
  Ok(list)
}

pub fn upsert_meta(key: &str, value: &Value) -> Result<Value, String> {
  let conn = open()?;
  let now = Utc::now().to_rfc3339();
  let val_str = value.to_string();

  conn.execute(
    "INSERT INTO local_meta (key, value, updated_at, action, synced)
     VALUES (?1, ?2, ?3, 'upsert', 0)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at,
       action = 'upsert',
       synced = 0",
    params![key, val_str, now],
  )
  .map_err(|e| format!("Failed to upsert local meta: {e}"))?;

  Ok(value.clone())
}

pub fn get_meta(key: &str) -> Result<Option<Value>, String> {
  let conn = open()?;
  let mut stmt = conn
    .prepare("SELECT value FROM local_meta WHERE key = ?1 AND action != 'delete'")
    .map_err(|e| format!("Failed to prepare get meta: {e}"))?;

  let mut rows = stmt
    .query(params![key])
    .map_err(|e| format!("Failed to query meta: {e}"))?;

  if let Some(row) = rows.next().map_err(|e| format!("Failed to read meta: {e}"))? {
    let raw: String = row.get(0).map_err(|e| format!("Failed to parse meta text: {e}"))?;
    let parsed: Value = serde_json::from_str(&raw).unwrap_or(Value::String(raw));
    Ok(Some(parsed))
  } else {
    Ok(None)
  }
}

pub fn delete_meta(key: &str) -> Result<bool, String> {
  let conn = open()?;
  let now = Utc::now().to_rfc3339();

  conn.execute(
    "INSERT INTO local_meta (key, value, updated_at, action, synced)
     VALUES (?1, '', ?2, 'delete', 0)
     ON CONFLICT(key) DO UPDATE SET
       action = 'delete',
       updated_at = excluded.updated_at,
       synced = 0",
    params![key, now],
  )
  .map_err(|e| format!("Failed to record delete meta: {e}"))?;

  Ok(true)
}

pub fn get_unsynced_batch() -> Result<Value, String> {
  let conn = open()?;
  let mut folders = Vec::new();

  {
    let mut stmt = conn
      .prepare("SELECT uid, name, parent_id, action, created_at FROM local_folders WHERE synced = 0 ORDER BY created_at ASC")
      .map_err(|e| format!("Failed to get unsynced folders: {e}"))?;
    let rows = stmt
      .query_map([], |row| {
        let uid: String = row.get(0)?;
        let name: String = row.get(1)?;
        let parent_id: Option<String> = row.get(2)?;
        let action: String = row.get(3)?;
        let created_at: String = row.get(4)?;
        Ok(json!({
          "uid": uid,
          "id": uid,
          "name": name,
          "parentId": parent_id,
          "_action": action,
          "createdAt": created_at,
        }))
      })
      .map_err(|e| format!("Query unsynced folders failed: {e}"))?;
    for r in rows {
      folders.push(r.map_err(|e| format!("Row err: {e}"))?);
    }
  }

  let mut connections = Vec::new();
  {
    let mut stmt = conn
      .prepare("SELECT uid, folder_id, name, host, port, username, password_cipher, database_name, environment, encrypt, trust_server_certificate, driver_type, timezone, last_database_used, action, created_at FROM local_connections WHERE synced = 0 ORDER BY created_at ASC")
      .map_err(|e| format!("Failed to get unsynced connections: {e}"))?;
    let rows = stmt
      .query_map([], |row| {
        let uid: String = row.get(0)?;
        let folder_id: Option<String> = row.get(1)?;
        let name: String = row.get(2)?;
        let host: String = row.get(3)?;
        let port: i64 = row.get(4)?;
        let username: String = row.get(5)?;
        let password_cipher: Option<String> = row.get(6)?;
        let database_name: String = row.get(7)?;
        let environment: String = row.get(8)?;
        let encrypt: i64 = row.get(9)?;
        let trust_cert: i64 = row.get(10)?;
        let driver_type: String = row.get(11)?;
        let timezone: Option<String> = row.get(12)?;
        let last_db: Option<String> = row.get(13)?;
        let action: String = row.get(14)?;
        let created_at: String = row.get(15)?;
        Ok(json!({
          "uid": uid,
          "id": uid,
          "folderId": folder_id,
          "name": name,
          "host": host,
          "port": port,
          "username": username,
          "password": password_cipher,
          "databaseName": database_name,
          "environment": environment,
          "encrypt": encrypt != 0,
          "trustServerCertificate": trust_cert != 0,
          "driverType": driver_type,
          "timezone": timezone,
          "lastDatabaseUsed": last_db,
          "_action": action,
          "createdAt": created_at,
        }))
      })
      .map_err(|e| format!("Query unsynced connections failed: {e}"))?;
    for r in rows {
      connections.push(r.map_err(|e| format!("Row err: {e}"))?);
    }
  }

  let mut saved_queries = Vec::new();
  {
    let mut stmt = conn
      .prepare("SELECT uid, connection_id, database_name, name, sql, action, created_at FROM local_saved_queries WHERE synced = 0 ORDER BY created_at ASC")
      .map_err(|e| format!("Failed to get unsynced saved queries: {e}"))?;
    let rows = stmt
      .query_map([], |row| {
        let uid: String = row.get(0)?;
        let connection_id: Option<String> = row.get(1)?;
        let database_name: String = row.get(2)?;
        let name: String = row.get(3)?;
        let sql: String = row.get(4)?;
        let action: String = row.get(5)?;
        let created_at: String = row.get(6)?;
        Ok(json!({
          "uid": uid,
          "id": uid,
          "connectionId": connection_id,
          "databaseName": database_name,
          "name": name,
          "sql": sql,
          "_action": action,
          "createdAt": created_at,
        }))
      })
      .map_err(|e| format!("Query unsynced saved queries failed: {e}"))?;
    for r in rows {
      saved_queries.push(r.map_err(|e| format!("Row err: {e}"))?);
    }
  }

  let query_history = crate::database::query_history_store::list_unsynced(Some(200))?;

  let mut meta = Vec::new();
  {
    let mut stmt = conn
      .prepare("SELECT key, value, action FROM local_meta WHERE synced = 0 ORDER BY updated_at ASC")
      .map_err(|e| format!("Failed to get unsynced meta: {e}"))?;
    let rows = stmt
      .query_map([], |row| {
        let key: String = row.get(0)?;
        let raw: String = row.get(1)?;
        let action: String = row.get(2)?;
        let val: Value = serde_json::from_str(&raw).unwrap_or(Value::String(raw));
        Ok(json!({
          "key": key,
          "value": val,
          "_action": action,
        }))
      })
      .map_err(|e| format!("Query unsynced meta failed: {e}"))?;
    for r in rows {
      meta.push(r.map_err(|e| format!("Row err: {e}"))?);
    }
  }

  Ok(json!({
    "folders": folders,
    "connections": connections,
    "savedQueries": saved_queries,
    "queryHistory": query_history,
    "meta": meta,
  }))
}

pub fn pending_delete_uids(entity: &str) -> Result<Vec<String>, String> {
  let conn = open()?;
  let table = match entity {
    "folders" => "local_folders",
    "connections" => "local_connections",
    "savedQueries" => "local_saved_queries",
    _ => return Err(format!("Unknown entity for pending deletes: {entity}")),
  };
  let mut stmt = conn
    .prepare(&format!("SELECT uid FROM {table} WHERE action = 'delete'"))
    .map_err(|e| format!("Failed to prepare pending delete query: {e}"))?;
  let rows = stmt
    .query_map([], |row| row.get::<_, String>(0))
    .map_err(|e| format!("Failed to query pending deletes: {e}"))?;
  let mut uids = Vec::new();
  for r in rows {
    uids.push(r.map_err(|e| format!("Row parse: {e}"))?);
  }
  Ok(uids)
}

pub fn clean_synced_batch(confirmed: &Value) -> Result<Value, String> {
  let conn = open()?;

  let mut cleaned_folders = 0;
  if let Some(folder_uids) = confirmed.get("folders").and_then(|v| v.as_array()) {
    for u in folder_uids {
      if let Some(uid) = u.as_str() {
        let count = conn.execute("DELETE FROM local_folders WHERE uid = ?1", params![uid]).unwrap_or(0);
        cleaned_folders += count;
      }
    }
  }

  let mut cleaned_conns = 0;
  if let Some(conn_uids) = confirmed.get("connections").and_then(|v| v.as_array()) {
    for u in conn_uids {
      if let Some(uid) = u.as_str() {
        let count = conn.execute("DELETE FROM local_connections WHERE uid = ?1", params![uid]).unwrap_or(0);
        cleaned_conns += count;
      }
    }
  }

  let mut cleaned_queries = 0;
  if let Some(query_uids) = confirmed.get("savedQueries").and_then(|v| v.as_array()) {
    for u in query_uids {
      if let Some(uid) = u.as_str() {
        let count = conn.execute("DELETE FROM local_saved_queries WHERE uid = ?1", params![uid]).unwrap_or(0);
        cleaned_queries += count;
      }
    }
  }

  let mut cleaned_history = 0;
  if let Some(history_uids) = confirmed.get("queryHistory").and_then(|v| v.as_array()) {
    let uids: Vec<String> = history_uids.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect();
    if !uids.is_empty() {
      cleaned_history = crate::database::query_history_store::delete_by_uids(&uids).unwrap_or(0);
    }
  }

  let mut cleaned_meta = 0;
  if let Some(meta_keys) = confirmed.get("meta").and_then(|v| v.as_array()) {
    for k in meta_keys {
      if let Some(key) = k.as_str() {
        let count = conn.execute("DELETE FROM local_meta WHERE key = ?1", params![key]).unwrap_or(0);
        cleaned_meta += count;
      }
    }
  }

  Ok(json!({
    "cleanedFolders": cleaned_folders,
    "cleanedConnections": cleaned_conns,
    "cleanedSavedQueries": cleaned_queries,
    "cleanedQueryHistory": cleaned_history,
    "cleanedMeta": cleaned_meta,
  }))
}
