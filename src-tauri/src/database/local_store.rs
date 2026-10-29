use rusqlite::{params, Connection as SqliteConnection, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbConnectionItem {
  pub id: String,
  pub name: String,
  pub host: String,
  pub port: u16,
  pub username: String,
  #[serde(default)]
  pub password: Option<String>,
  #[serde(rename = "databaseName", alias = "database")]
  pub database_name: Option<String>,
  #[serde(rename = "folderId")]
  pub folder_id: Option<String>,
  pub environment: Option<String>,
  pub encrypt: bool,
  #[serde(rename = "trustServerCertificate")]
  pub trust_server_certificate: bool,
  #[serde(rename = "passwordCipher")]
  pub password_cipher: Option<String>,
  #[serde(rename = "lastConnectedAt")]
  pub last_connected_at: Option<String>,
  #[serde(rename = "createdAt")]
  pub created_at: Option<String>,
  #[serde(rename = "updatedAt")]
  pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FolderItem {
  pub id: String,
  pub name: String,
  #[serde(rename = "parentId")]
  pub parent_id: Option<String>,
  #[serde(rename = "createdAt")]
  pub created_at: Option<String>,
}

pub struct LocalStore;

impl LocalStore {
  pub fn init(path: &Path) -> Result<SqliteConnection> {
    let conn = SqliteConnection::open(path)?;
    conn.execute_batch(
      "PRAGMA journal_mode = WAL;
       PRAGMA foreign_keys = ON;

       CREATE TABLE IF NOT EXISTS meta (
         key TEXT PRIMARY KEY,
         value TEXT NOT NULL
       );

       CREATE TABLE IF NOT EXISTS folders (
         id TEXT PRIMARY KEY,
         name TEXT NOT NULL,
         parent_id TEXT REFERENCES folders(id),
         created_at TEXT NOT NULL
       );

       CREATE TABLE IF NOT EXISTS connections (
         id TEXT PRIMARY KEY,
         name TEXT NOT NULL,
         host TEXT NOT NULL,
         port INTEGER NOT NULL,
         username TEXT NOT NULL,
         database_name TEXT NOT NULL DEFAULT '',
         folder_id TEXT REFERENCES folders(id),
         environment TEXT NOT NULL DEFAULT '',
         encrypt INTEGER NOT NULL DEFAULT 1,
         trust_server_certificate INTEGER NOT NULL DEFAULT 1,
         password_cipher TEXT,
         last_connected_at TEXT,
         created_at TEXT NOT NULL,
         updated_at TEXT NOT NULL
       );

       CREATE TABLE IF NOT EXISTS saved_queries (
         id TEXT PRIMARY KEY,
         connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
         database_name TEXT NOT NULL,
         name TEXT NOT NULL,
         sql TEXT NOT NULL,
         created_at TEXT NOT NULL,
         updated_at TEXT NOT NULL
       );"
    )?;
    Ok(conn)
  }

  pub fn list_connections(conn: &SqliteConnection) -> Result<Vec<DbConnectionItem>> {
    let mut stmt = conn.prepare(
      "SELECT id, name, host, port, username, database_name, folder_id, environment,
              encrypt, trust_server_certificate, last_connected_at, created_at, updated_at, password_cipher
       FROM connections ORDER BY name ASC",
    )?;
    let rows = stmt.query_map([], |row| {
      let encrypt_int: i32 = row.get(8)?;
      let trust_cert_int: i32 = row.get(9)?;
      let port_int: i32 = row.get(3)?;
      let cipher: Option<String> = row.get(13)?;
      Ok(DbConnectionItem {
        id: row.get(0)?,
        name: row.get(1)?,
        host: row.get(2)?,
        port: port_int as u16,
        username: row.get(4)?,
        password: cipher.clone(),
        database_name: row.get(5)?,
        folder_id: row.get(6)?,
        environment: row.get(7)?,
        encrypt: encrypt_int != 0,
        trust_server_certificate: trust_cert_int != 0,
        password_cipher: cipher,
        last_connected_at: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
      })
    })?;

    let mut result = Vec::new();
    for item in rows {
      result.push(item?);
    }
    Ok(result)
  }

  pub fn get_connection(conn: &SqliteConnection, id: &str) -> Result<Option<DbConnectionItem>> {
    let mut stmt = conn.prepare(
      "SELECT id, name, host, port, username, database_name, folder_id, environment,
              encrypt, trust_server_certificate, last_connected_at, created_at, updated_at, password_cipher
       FROM connections WHERE id = ?1 LIMIT 1",
    )?;
    let mut rows = stmt.query_map(params![id], |row| {
      let encrypt_int: i32 = row.get(8)?;
      let trust_cert_int: i32 = row.get(9)?;
      let port_int: i32 = row.get(3)?;
      let cipher: Option<String> = row.get(13)?;
      Ok(DbConnectionItem {
        id: row.get(0)?,
        name: row.get(1)?,
        host: row.get(2)?,
        port: port_int as u16,
        username: row.get(4)?,
        password: cipher.clone(),
        database_name: row.get(5)?,
        folder_id: row.get(6)?,
        environment: row.get(7)?,
        encrypt: encrypt_int != 0,
        trust_server_certificate: trust_cert_int != 0,
        password_cipher: cipher,
        last_connected_at: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
      })
    })?;

    if let Some(item) = rows.next() {
      Ok(Some(item?))
    } else {
      Ok(None)
    }
  }

  pub fn save_connection(conn: &SqliteConnection, item: &DbConnectionItem) -> Result<()> {
    let password = item.password.as_deref().or(item.password_cipher.as_deref());
    conn.execute(
      "INSERT INTO connections (id, name, host, port, username, database_name, folder_id, environment, encrypt, trust_server_certificate, password_cipher, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, datetime('now'), datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         host = excluded.host,
         port = excluded.port,
         username = excluded.username,
         database_name = excluded.database_name,
         folder_id = excluded.folder_id,
         environment = excluded.environment,
         encrypt = excluded.encrypt,
         trust_server_certificate = excluded.trust_server_certificate,
         password_cipher = COALESCE(excluded.password_cipher, connections.password_cipher),
         updated_at = datetime('now')",
      params![
        item.id,
        item.name,
        item.host,
        item.port as i32,
        item.username,
        item.database_name.as_deref().unwrap_or(""),
        item.folder_id,
        item.environment.as_deref().unwrap_or(""),
        if item.encrypt { 1 } else { 0 },
        if item.trust_server_certificate { 1 } else { 0 },
        password,
      ],
    )?;
    Ok(())
  }

  pub fn delete_connection(conn: &SqliteConnection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM connections WHERE id = ?1", params![id])?;
    Ok(())
  }

  pub fn list_folders(conn: &SqliteConnection) -> Result<Vec<FolderItem>> {
    let mut stmt = conn.prepare("SELECT id, name, parent_id, created_at FROM folders ORDER BY name ASC")?;
    let rows = stmt.query_map([], |row| {
      Ok(FolderItem {
        id: row.get(0)?,
        name: row.get(1)?,
        parent_id: row.get(2)?,
        created_at: row.get(3)?,
      })
    })?;

    let mut result = Vec::new();
    for item in rows {
      result.push(item?);
    }
    Ok(result)
  }

  pub fn save_folder(conn: &SqliteConnection, item: &FolderItem) -> Result<()> {
    conn.execute(
      "INSERT INTO folders (id, name, parent_id, created_at)
       VALUES (?1, ?2, ?3, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         parent_id = excluded.parent_id",
      params![item.id, item.name, item.parent_id],
    )?;
    Ok(())
  }

  pub fn delete_folder(conn: &SqliteConnection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM folders WHERE id = ?1", params![id])?;
    Ok(())
  }
}
