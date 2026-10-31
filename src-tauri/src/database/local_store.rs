use rusqlite::{params, Connection as SqliteConnection, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet, VecDeque};
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
    #[serde(rename = "driverType")]
    pub driver_type: Option<String>,
    #[serde(rename = "lastConnectedAt")]
    pub last_connected_at: Option<String>,
    #[serde(rename = "lastDatabaseUsed", alias = "last_database_used")]
    pub last_database_used: Option<String>,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryHistoryItem {
    pub id: String,
    #[serde(rename = "connectionId")]
    pub connection_id: String,
    #[serde(rename = "databaseName")]
    pub database: String,
    pub sql: String,
    pub status: String,
    #[serde(rename = "durationMs")]
    pub duration_ms: i64,
    #[serde(rename = "rowCount")]
    pub row_count: i64,
    #[serde(rename = "errorMessage")]
    pub error_message: Option<String>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

fn map_query_history_row(row: &rusqlite::Row<'_>) -> Result<QueryHistoryItem> {
    Ok(QueryHistoryItem {
        id: row.get(0)?,
        connection_id: row.get(1)?,
        database: row.get(2)?,
        sql: row.get(3)?,
        status: row.get(4)?,
        duration_ms: row.get(5)?,
        row_count: row.get(6)?,
        error_message: row.get(7)?,
        created_at: row.get(8)?,
    })
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
         parent_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
         created_at TEXT NOT NULL
       );

       CREATE TABLE IF NOT EXISTS connections (
         id TEXT PRIMARY KEY,
         name TEXT NOT NULL,
         host TEXT NOT NULL,
         port INTEGER NOT NULL,
         username TEXT NOT NULL,
         database_name TEXT NOT NULL DEFAULT '',
         folder_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
         environment TEXT NOT NULL DEFAULT '',
         encrypt INTEGER NOT NULL DEFAULT 1,
         trust_server_certificate INTEGER NOT NULL DEFAULT 1,
         driver_type TEXT NOT NULL DEFAULT 'sqlserver',
         password_cipher TEXT,
         last_connected_at TEXT,
         last_database_used TEXT,
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
       );

       CREATE TABLE IF NOT EXISTS query_history (
         id TEXT PRIMARY KEY,
         connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
         database_name TEXT NOT NULL COLLATE NOCASE,
         sql TEXT NOT NULL,
         status TEXT NOT NULL DEFAULT 'success',
         duration_ms INTEGER NOT NULL DEFAULT 0,
         row_count INTEGER NOT NULL DEFAULT 0,
         error_message TEXT,
         created_at TEXT NOT NULL
       );

       CREATE INDEX IF NOT EXISTS query_history_scope
         ON query_history (connection_id, database_name, created_at DESC);",
        )?;
        let _ = conn.execute(
            "ALTER TABLE connections ADD COLUMN last_database_used TEXT",
            [],
        );
        let _ = conn.execute(
            "ALTER TABLE connections ADD COLUMN driver_type TEXT DEFAULT 'sqlserver'",
            [],
        );
        Ok(conn)
    }

    pub fn list_connections(conn: &SqliteConnection) -> Result<Vec<DbConnectionItem>> {
        let mut stmt = conn.prepare(
      "SELECT id, name, host, port, username, database_name, folder_id, environment,
              encrypt, trust_server_certificate, driver_type, last_connected_at, last_database_used, created_at, updated_at, password_cipher
       FROM connections ORDER BY name ASC",
    )?;
        let rows = stmt.query_map([], |row| {
            let encrypt_int: i32 = row.get(8)?;
            let trust_cert_int: i32 = row.get(9)?;
            let driver_type: Option<String> = row.get(10)?;
            let port_int: i32 = row.get(3)?;
            let cipher: Option<String> = row.get(15)?;
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
                driver_type,
                password_cipher: cipher,
                last_connected_at: row.get(11)?,
                last_database_used: row.get(12)?,
                created_at: row.get(13)?,
                updated_at: row.get(14)?,
            })
        })?;

        let mut result = Vec::new();
        for item in rows {
            result.push(item?);
        }

        let (connection_order, _) = Self::read_tree_order(conn)?;
        let rank = Self::order_rank(&connection_order);
        result.sort_by(|left, right| {
            let left_rank = rank.get(&left.id).copied().unwrap_or(usize::MAX);
            let right_rank = rank.get(&right.id).copied().unwrap_or(usize::MAX);
            left_rank
                .cmp(&right_rank)
                .then_with(|| left.name.cmp(&right.name))
        });
        Ok(result)
    }

    pub fn get_connection(conn: &SqliteConnection, id: &str) -> Result<Option<DbConnectionItem>> {
        let mut stmt = conn.prepare(
      "SELECT id, name, host, port, username, database_name, folder_id, environment,
              encrypt, trust_server_certificate, driver_type, last_connected_at, last_database_used, created_at, updated_at, password_cipher
       FROM connections WHERE id = ?1 LIMIT 1",
    )?;
        let mut rows = stmt.query_map(params![id], |row| {
            let encrypt_int: i32 = row.get(8)?;
            let trust_cert_int: i32 = row.get(9)?;
            let driver_type: Option<String> = row.get(10)?;
            let port_int: i32 = row.get(3)?;
            let cipher: Option<String> = row.get(15)?;
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
                driver_type,
                password_cipher: cipher,
                last_connected_at: row.get(11)?,
                last_database_used: row.get(12)?,
                created_at: row.get(13)?,
                updated_at: row.get(14)?,
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
        let driver_type = item.driver_type.as_deref().unwrap_or("sqlserver");
        conn.execute(
      "INSERT INTO connections (id, name, host, port, username, database_name, folder_id, environment, encrypt, trust_server_certificate, driver_type, password_cipher, last_database_used, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, datetime('now'), datetime('now'))
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
         driver_type = excluded.driver_type,
         password_cipher = COALESCE(excluded.password_cipher, connections.password_cipher),
         last_database_used = COALESCE(excluded.last_database_used, connections.last_database_used),
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
        driver_type,
        password,
        item.last_database_used.as_deref(),
      ],
    )?;
        Ok(())
    }

    pub fn update_last_database_used(
        conn: &SqliteConnection,
        id: &str,
        database: &str,
    ) -> Result<()> {
        conn.execute(
            "UPDATE connections SET last_database_used = ?1 WHERE id = ?2",
            params![database, id],
        )?;
        Ok(())
    }

    pub fn delete_connection(conn: &SqliteConnection, id: &str) -> Result<()> {
        conn.execute("DELETE FROM connections WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn list_folders(conn: &SqliteConnection) -> Result<Vec<FolderItem>> {
        let mut stmt =
            conn.prepare("SELECT id, name, parent_id, created_at FROM folders ORDER BY name ASC")?;
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

        let (_, folder_order) = Self::read_tree_order(conn)?;
        let rank = Self::order_rank(&folder_order);
        result.sort_by(|left, right| {
            let left_rank = rank.get(&left.id).copied().unwrap_or(usize::MAX);
            let right_rank = rank.get(&right.id).copied().unwrap_or(usize::MAX);
            left_rank
                .cmp(&right_rank)
                .then_with(|| left.name.cmp(&right.name))
        });
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

    pub fn collect_subtree_folder_ids(
        conn: &SqliteConnection,
        root_ids: &[String],
    ) -> Result<Vec<String>> {
        let mut all_folder_ids: Vec<String> = Vec::new();
        let mut queue: VecDeque<String> = VecDeque::new();
        let mut visited: HashSet<String> = HashSet::new();

        for id in root_ids {
            if !id.is_empty() && visited.insert(id.clone()) {
                queue.push_back(id.clone());
                all_folder_ids.push(id.clone());
            }
        }

        let mut stmt = conn.prepare("SELECT id FROM folders WHERE parent_id = ?1")?;

        while let Some(current_id) = queue.pop_front() {
            let child_rows = stmt.query_map(params![current_id], |row| row.get::<_, String>(0))?;
            for child_id in child_rows {
                let cid = child_id?;
                if visited.insert(cid.clone()) {
                    queue.push_back(cid.clone());
                    all_folder_ids.push(cid);
                }
            }
        }

        Ok(all_folder_ids)
    }

    pub fn delete_tree(
        conn: &mut SqliteConnection,
        folder_ids: &[String],
        connection_ids: &[String],
    ) -> Result<(Vec<String>, Vec<String>)> {
        let all_folder_ids = Self::collect_subtree_folder_ids(conn, folder_ids)?;

        let mut all_connection_ids: Vec<String> = Vec::new();
        let mut conn_visited: HashSet<String> = HashSet::new();

        for cid in connection_ids {
            if !cid.is_empty() && conn_visited.insert(cid.clone()) {
                all_connection_ids.push(cid.clone());
            }
        }

        let mut conn_stmt = conn.prepare("SELECT id FROM connections WHERE folder_id = ?1")?;
        for fid in &all_folder_ids {
            let rows = conn_stmt.query_map(params![fid], |row| row.get::<_, String>(0))?;
            for row in rows {
                let cid = row?;
                if conn_visited.insert(cid.clone()) {
                    all_connection_ids.push(cid);
                }
            }
        }
        drop(conn_stmt);

        let tx = conn.transaction()?;

        // 1. Delete all gathered connections (cascades to saved_queries)
        {
            let mut del_conn_stmt = tx.prepare("DELETE FROM connections WHERE id = ?1")?;
            for cid in &all_connection_ids {
                del_conn_stmt.execute(params![cid])?;
            }
        }

        // 2. Clear parent_id on folders to be deleted to avoid self-referential FK constraints
        {
            let mut clear_parent_stmt =
                tx.prepare("UPDATE folders SET parent_id = NULL WHERE id = ?1")?;
            for fid in &all_folder_ids {
                clear_parent_stmt.execute(params![fid])?;
            }
        }

        // 3. Delete folders in reverse order (deepest subfolders first)
        {
            let mut del_folder_stmt = tx.prepare("DELETE FROM folders WHERE id = ?1")?;
            for fid in all_folder_ids.iter().rev() {
                del_folder_stmt.execute(params![fid])?;
            }
        }

        tx.commit()?;

        Ok((all_folder_ids, all_connection_ids))
    }

    pub fn delete_folder(
        conn: &mut SqliteConnection,
        id: &str,
    ) -> Result<(Vec<String>, Vec<String>)> {
        Self::delete_tree(conn, &[id.to_string()], &[])
    }

    pub fn read_tree_order(conn: &SqliteConnection) -> Result<(Vec<String>, Vec<String>)> {
        let raw = Self::get_meta(conn, "tree_order")?;
        let Some(raw) = raw else {
            return Ok((Vec::new(), Vec::new()));
        };
        let parsed: Value = match serde_json::from_str(&raw) {
            Ok(value) => value,
            Err(_) => return Ok((Vec::new(), Vec::new())),
        };
        let read_ids = |key: &str| -> Vec<String> {
            parsed
                .get(key)
                .and_then(|value| value.as_array())
                .map(|items| {
                    items
                        .iter()
                        .filter_map(|item| item.as_str().map(|value| value.to_string()))
                        .collect()
                })
                .unwrap_or_default()
        };
        Ok((read_ids("connections"), read_ids("folders")))
    }

    pub fn order_rank(ids: &[String]) -> HashMap<String, usize> {
        ids.iter()
            .enumerate()
            .map(|(index, id)| (id.clone(), index))
            .collect()
    }

    pub fn normalize_order(
        conn: &SqliteConnection,
        table: &str,
        ids: &[String],
    ) -> Result<Vec<String>> {
        let sql = match table {
            "connections" => "SELECT id, name FROM connections",
            "folders" => "SELECT id, name FROM folders",
            _ => return Ok(Vec::new()),
        };

        let mut rows: Vec<(String, String)> = Vec::new();
        {
            let mut stmt = conn.prepare(sql)?;
            let mapped = stmt
                .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?;
            for row in mapped {
                rows.push(row?);
            }
        }

        let known: HashSet<String> = rows.iter().map(|(id, _)| id.clone()).collect();
        let mut ordered: Vec<String> = Vec::new();
        for id in ids {
            if known.contains(id) && !ordered.contains(id) {
                ordered.push(id.clone());
            }
        }

        let mut rest: Vec<(String, String)> = rows
            .into_iter()
            .filter(|(id, _)| !ordered.contains(id))
            .collect();
        rest.sort_by(|left, right| left.1.cmp(&right.1));
        ordered.extend(rest.into_iter().map(|(id, _)| id));

        Ok(ordered)
    }

    pub fn update_tree_order(
        conn: &mut SqliteConnection,
        connections: &[String],
        folders: &[String],
        connection_folders: &HashMap<String, Option<String>>,
        folder_parents: &HashMap<String, Option<String>>,
    ) -> Result<()> {
        let connection_order = Self::normalize_order(conn, "connections", connections)?;
        let folder_order = Self::normalize_order(conn, "folders", folders)?;

        let tx = conn.transaction()?;

        for (connection_id, folder_id) in connection_folders {
            tx.execute(
                "UPDATE connections SET folder_id = ?1, updated_at = datetime('now') WHERE id = ?2",
                params![folder_id.as_deref(), connection_id],
            )?;
        }

        for (folder_id, parent_id) in folder_parents {
            if parent_id.as_deref() == Some(folder_id.as_str()) {
                return Err(rusqlite::Error::InvalidParameterName(
                    "Folder cannot be moved into itself".to_string(),
                ));
            }
            tx.execute(
                "UPDATE folders SET parent_id = ?1 WHERE id = ?2",
                params![parent_id.as_deref(), folder_id],
            )?;
        }

        Self::set_meta(
            &tx,
            "tree_order",
            &serde_json::to_string(&json!({
              "connections": connection_order,
              "folders": folder_order
            }))
            .unwrap_or_default(),
        )?;

        tx.commit()?;
        Ok(())
    }

    pub fn add_query_history(conn: &SqliteConnection, item: &QueryHistoryItem) -> Result<()> {
        conn.execute(
      "INSERT INTO query_history (id, connection_id, database_name, sql, status, duration_ms, row_count, error_message, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
      params![
        item.id,
        item.connection_id,
        item.database,
        item.sql,
        item.status,
        item.duration_ms,
        item.row_count,
        item.error_message,
        item.created_at,
      ],
    )?;

        conn.execute(
            "DELETE FROM query_history
       WHERE connection_id = ?1
         AND id NOT IN (
           SELECT id FROM query_history
           WHERE connection_id = ?1
           ORDER BY created_at DESC
           LIMIT 500
         )",
            params![item.connection_id],
        )?;
        Ok(())
    }

    pub fn list_query_history(
        conn: &SqliteConnection,
        connection_id: &str,
        database: Option<&str>,
        limit: usize,
    ) -> Result<Vec<QueryHistoryItem>> {
        let max_rows = limit.clamp(1, 500) as i64;
        let scope = database.map(|value| value.trim()).unwrap_or("");

        let mut result = Vec::new();

        if scope.is_empty() {
            let mut stmt = conn.prepare(
        "SELECT id, connection_id, database_name, sql, status, duration_ms, row_count, error_message, created_at
         FROM query_history WHERE connection_id = ?1 ORDER BY created_at DESC LIMIT ?2",
      )?;
            let rows = stmt.query_map(params![connection_id, max_rows], map_query_history_row)?;
            for row in rows {
                result.push(row?);
            }
        } else {
            let mut stmt = conn.prepare(
        "SELECT id, connection_id, database_name, sql, status, duration_ms, row_count, error_message, created_at
         FROM query_history WHERE connection_id = ?1 AND database_name = ?2 ORDER BY created_at DESC LIMIT ?3",
      )?;
            let rows = stmt.query_map(
                params![connection_id, scope, max_rows],
                map_query_history_row,
            )?;
            for row in rows {
                result.push(row?);
            }
        }

        Ok(result)
    }

    pub fn clear_query_history(
        conn: &SqliteConnection,
        connection_id: &str,
        database: Option<&str>,
    ) -> Result<usize> {
        let scope = database.map(|value| value.trim()).unwrap_or("");

        if scope.is_empty() {
            conn.execute(
                "DELETE FROM query_history WHERE connection_id = ?1",
                params![connection_id],
            )
        } else {
            conn.execute(
                "DELETE FROM query_history WHERE connection_id = ?1 AND database_name = ?2",
                params![connection_id, scope],
            )
        }
    }

    pub fn delete_query_history(conn: &SqliteConnection, id: &str) -> Result<usize> {
        conn.execute("DELETE FROM query_history WHERE id = ?1", params![id])
    }

    pub fn get_meta(conn: &SqliteConnection, key: &str) -> Result<Option<String>> {
        let mut stmt = conn.prepare("SELECT value FROM meta WHERE key = ?1")?;
        let mut rows = stmt.query_map(params![key], |row| row.get(0))?;
        if let Some(val) = rows.next() {
            Ok(Some(val?))
        } else {
            Ok(None)
        }
    }

    pub fn set_meta(conn: &SqliteConnection, key: &str, value: &str) -> Result<()> {
        conn.execute(
            "INSERT INTO meta (key, value) VALUES (?1, ?2)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    }
}
