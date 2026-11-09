use chrono::Utc;
use rusqlite::{params, Connection};
use serde_json::{json, Value};
use std::path::PathBuf;
use uuid::Uuid;

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
        "CREATE TABLE IF NOT EXISTS query_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uid TEXT NOT NULL UNIQUE,
            user_id INTEGER,
            connection_id TEXT,
            database_name TEXT NOT NULL DEFAULT '',
            sql TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'success',
            duration_ms INTEGER NOT NULL DEFAULT 0,
            row_count INTEGER NOT NULL DEFAULT 0,
            error_message TEXT,
            created_at TEXT NOT NULL,
            synced INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_qh_synced ON query_history(synced);
        CREATE INDEX IF NOT EXISTS idx_qh_connection ON query_history(connection_id, database_name, created_at);",
    )
    .map_err(|e| format!("Failed to initialize query_history table: {e}"))?;
    Ok(())
}

fn row_to_json(row: &rusqlite::Row) -> rusqlite::Result<Value> {
    let id: i64 = row.get(0)?;
    let uid: String = row.get(1)?;
    let user_id: Option<i64> = row.get(2)?;
    let connection_id: Option<String> = row.get(3)?;
    let database_name: String = row.get(4)?;
    let sql: String = row.get(5)?;
    let status: String = row.get(6)?;
    let duration_ms: i64 = row.get(7)?;
    let row_count: i64 = row.get(8)?;
    let error_message: Option<String> = row.get(9)?;
    let created_at: String = row.get(10)?;
    let synced: i64 = row.get(11)?;

    Ok(json!({
        "id": uid,
        "uid": uid,
        "localId": id,
        "user_id": user_id,
        "connectionId": connection_id,
        "connection_id": connection_id,
        "database": database_name,
        "databaseName": database_name,
        "database_name": database_name,
        "sql": sql,
        "status": status,
        "durationMs": duration_ms,
        "duration_ms": duration_ms,
        "rowCount": row_count,
        "row_count": row_count,
        "errorMessage": error_message,
        "error_message": error_message,
        "createdAt": created_at,
        "created_at": created_at,
        "synced": synced != 0,
    }))
}

pub fn insert(
    connection_id: Option<&str>,
    database: &str,
    sql: &str,
    status: &str,
    duration_ms: i64,
    row_count: i64,
    error_message: Option<&str>,
) -> Result<Value, String> {
    let conn = open()?;
    let uid = Uuid::new_v4().to_string();
    let created_at = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO query_history (uid, connection_id, database_name, sql, status, duration_ms, row_count, error_message, created_at, synced)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0)",
        params![uid, connection_id, database, sql, status, duration_ms, row_count, error_message, created_at],
    )
    .map_err(|e| format!("Failed to insert query history: {e}"))?;

    let id = conn.last_insert_rowid();
    Ok(json!({
        "id": uid,
        "uid": uid,
        "localId": id,
        "connectionId": connection_id,
        "connection_id": connection_id,
        "database": database,
        "databaseName": database,
        "database_name": database,
        "sql": sql,
        "status": status,
        "durationMs": duration_ms,
        "duration_ms": duration_ms,
        "rowCount": row_count,
        "row_count": row_count,
        "errorMessage": error_message,
        "error_message": error_message,
        "createdAt": created_at,
        "created_at": created_at,
        "synced": false,
    }))
}

pub fn list(
    connection_id: Option<&str>,
    database: Option<&str>,
    limit: Option<usize>,
) -> Result<Vec<Value>, String> {
    let conn = open()?;
    let mut sql = String::from(
        "SELECT id, uid, user_id, connection_id, database_name, sql, status, duration_ms, row_count, error_message, created_at, synced FROM query_history WHERE 1=1",
    );
    let mut params_vec: Vec<String> = Vec::new();
    if let Some(cid) = connection_id {
        if !cid.is_empty() {
            sql.push_str(" AND connection_id = ?");
            params_vec.push(cid.to_string());
        }
    }
    if let Some(db) = database {
        if !db.is_empty() {
            sql.push_str(" AND database_name = ?");
            params_vec.push(db.to_string());
        }
    }
    sql.push_str(" ORDER BY created_at DESC");
    if let Some(l) = limit {
        sql.push_str(&format!(" LIMIT {}", l));
    }

    let mut stmt = conn.prepare(&sql).map_err(|e| format!("Failed to prepare query: {e}"))?;
    let params_refs: Vec<&dyn rusqlite::ToSql> =
        params_vec.iter().map(|s| s as &dyn rusqlite::ToSql).collect();
    let rows = stmt
        .query_map(params_refs.as_slice(), row_to_json)
        .map_err(|e| format!("Failed to query history: {e}"))?;
    let mut result = Vec::new();
    for r in rows {
        result.push(r.map_err(|e| format!("Failed to read row: {e}"))?);
    }
    Ok(result)
}

pub fn list_unsynced(limit: Option<usize>) -> Result<Vec<Value>, String> {
    let conn = open()?;
    let mut sql = String::from(
        "SELECT id, uid, user_id, connection_id, database_name, sql, status, duration_ms, row_count, error_message, created_at, synced FROM query_history WHERE synced = 0 ORDER BY created_at ASC",
    );
    if let Some(l) = limit {
        sql.push_str(&format!(" LIMIT {}", l));
    }
    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("Failed to prepare query: {e}"))?;
    let rows = stmt
        .query_map([], row_to_json)
        .map_err(|e| format!("Failed to query unsynced: {e}"))?;
    let mut result = Vec::new();
    for r in rows {
        result.push(r.map_err(|e| format!("Failed to read row: {e}"))?);
    }
    Ok(result)
}

pub fn mark_synced(uids: &[String]) -> Result<usize, String> {
    if uids.is_empty() {
        return Ok(0);
    }
    let conn = open()?;
    let mut total = 0;
    for chunk in uids.chunks(500) {
        let placeholders = chunk.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!("UPDATE query_history SET synced = 1 WHERE uid IN ({})", placeholders);
        let params: Vec<&dyn rusqlite::ToSql> = chunk.iter().map(|s| s as &dyn rusqlite::ToSql).collect();
        let affected = conn
            .execute(&sql, params.as_slice())
            .map_err(|e| format!("Failed to mark synced: {e}"))?;
        total += affected;
    }
    Ok(total)
}

pub fn delete(uid: &str) -> Result<bool, String> {
    let conn = open()?;
    let affected = conn
        .execute("DELETE FROM query_history WHERE uid = ?1", params![uid])
        .map_err(|e| format!("Failed to delete query history: {e}"))?;
    Ok(affected > 0)
}

pub fn delete_by_uids(uids: &[String]) -> Result<usize, String> {
    if uids.is_empty() {
        return Ok(0);
    }
    let conn = open()?;
    let mut total = 0;
    for chunk in uids.chunks(500) {
        let placeholders = chunk.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!("DELETE FROM query_history WHERE uid IN ({})", placeholders);
        let params: Vec<&dyn rusqlite::ToSql> = chunk.iter().map(|s| s as &dyn rusqlite::ToSql).collect();
        let affected = conn
            .execute(&sql, params.as_slice())
            .map_err(|e| format!("Failed to delete by uids: {e}"))?;
        total += affected;
    }
    Ok(total)
}

pub fn delete_by_id_or_uid(identifier: &str) -> Result<bool, String> {
    let conn = open()?;
    let affected = if let Ok(id) = identifier.parse::<i64>() {
        conn.execute("DELETE FROM query_history WHERE id = ?1 OR uid = ?2", params![id, identifier])
    } else {
        conn.execute("DELETE FROM query_history WHERE uid = ?1", params![identifier])
    }
    .map_err(|e| format!("Failed to delete query history: {e}"))?;
    Ok(affected > 0)
}

pub fn clear(connection_id: Option<&str>, database: Option<&str>) -> Result<usize, String> {
    let conn = open()?;
    let mut sql = String::from("DELETE FROM query_history WHERE 1=1");
    let mut params_vec: Vec<String> = Vec::new();
    if let Some(cid) = connection_id {
        if !cid.is_empty() {
            sql.push_str(" AND connection_id = ?");
            params_vec.push(cid.to_string());
        }
    }
    if let Some(db) = database {
        if !db.is_empty() {
            sql.push_str(" AND database_name = ?");
            params_vec.push(db.to_string());
        }
    }
    let params_refs: Vec<&dyn rusqlite::ToSql> =
        params_vec.iter().map(|s| s as &dyn rusqlite::ToSql).collect();
    let affected = conn
        .execute(&sql, params_refs.as_slice())
        .map_err(|e| format!("Failed to clear query history: {e}"))?;
    Ok(affected)
}

pub fn clear_synced() -> Result<usize, String> {
    let conn = open()?;
    let affected = conn
        .execute("DELETE FROM query_history WHERE synced = 1", [])
        .map_err(|e| format!("Failed to clear synced history: {e}"))?;
    Ok(affected)
}

pub fn upsert_from_server(
    uid: &str,
    user_id: Option<i64>,
    connection_id: Option<&str>,
    database_name: &str,
    sql: &str,
    status: &str,
    duration_ms: i64,
    row_count: i64,
    error_message: Option<&str>,
    created_at: &str,
) -> Result<Value, String> {
    let conn = open()?;
    conn.execute(
        "INSERT INTO query_history (uid, user_id, connection_id, database_name, sql, status, duration_ms, row_count, error_message, created_at, synced)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 1)
         ON CONFLICT(uid) DO UPDATE SET
           user_id = COALESCE(excluded.user_id, query_history.user_id),
           connection_id = COALESCE(excluded.connection_id, query_history.connection_id),
           database_name = excluded.database_name,
           sql = excluded.sql,
           status = excluded.status,
           duration_ms = excluded.duration_ms,
           row_count = excluded.row_count,
           error_message = excluded.error_message,
           created_at = excluded.created_at,
           synced = 1
         WHERE query_history.synced = 1",
        params![
            uid,
            user_id,
            connection_id,
            database_name,
            sql,
            status,
            duration_ms,
            row_count,
            error_message,
            created_at,
        ],
    )
    .map_err(|e| format!("Failed to upsert query history from server: {e}"))?;

    Ok(json!({
        "id": uid,
        "uid": uid,
        "connectionId": connection_id,
        "connection_id": connection_id,
        "database": database_name,
        "databaseName": database_name,
        "database_name": database_name,
        "sql": sql,
        "status": status,
        "durationMs": duration_ms,
        "duration_ms": duration_ms,
        "rowCount": row_count,
        "row_count": row_count,
        "errorMessage": error_message,
        "error_message": error_message,
        "createdAt": created_at,
        "created_at": created_at,
        "synced": true,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sqlite_query_history_lifecycle() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS query_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uid TEXT NOT NULL UNIQUE,
                user_id INTEGER,
                connection_id TEXT,
                database_name TEXT NOT NULL DEFAULT '',
                sql TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'success',
                duration_ms INTEGER NOT NULL DEFAULT 0,
                row_count INTEGER NOT NULL DEFAULT 0,
                error_message TEXT,
                created_at TEXT NOT NULL,
                synced INTEGER NOT NULL DEFAULT 0
            );",
        ).unwrap();

        let uid = "test-uid-123";
        conn.execute(
            "INSERT INTO query_history (uid, connection_id, database_name, sql, status, duration_ms, row_count, created_at, synced)
             VALUES (?1, 'conn-1', 'master', 'SELECT 1', 'success', 10, 1, '2026-11-05T00:00:00Z', 0)",
            params![uid],
        ).unwrap();

        let count: i64 = conn.query_row("SELECT COUNT(*) FROM query_history WHERE synced = 0", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 1);

        conn.execute("DELETE FROM query_history WHERE uid = ?1", params![uid]).unwrap();
        let count_after: i64 = conn.query_row("SELECT COUNT(*) FROM query_history", [], |r| r.get(0)).unwrap();
        assert_eq!(count_after, 0);
    }
}