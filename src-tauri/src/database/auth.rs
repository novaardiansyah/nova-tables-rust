use chrono::Utc;
use rusqlite::{params, Connection as SqliteConnection, Result};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthUser {
    pub id: String,
    pub username: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthUserWithCredentials {
    pub id: String,
    pub username: String,
    #[serde(rename = "passwordHash")]
    pub password_hash: String,
    pub salt: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthSessionData {
    pub user: AuthUser,
    pub token: String,
}

pub struct AuthStore;

impl AuthStore {
    pub fn setup_schema(conn: &SqliteConnection) -> Result<()> {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS users (
               id TEXT PRIMARY KEY,
               username TEXT NOT NULL UNIQUE COLLATE NOCASE,
               password_hash TEXT NOT NULL,
               salt TEXT NOT NULL,
               created_at TEXT NOT NULL,
               updated_at TEXT NOT NULL
             );

             CREATE TABLE IF NOT EXISTS app_session (
               id INTEGER PRIMARY KEY CHECK (id = 1),
               user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
               token TEXT NOT NULL,
               created_at TEXT NOT NULL
             );",
        )?;
        Ok(())
    }

    pub fn create_user(
        conn: &SqliteConnection,
        username: &str,
        password_hash: &str,
        salt: &str,
    ) -> Result<AuthUser, String> {
        let trimmed_user = username.trim();
        if trimmed_user.len() < 3 {
            return Err("Username must be at least 3 characters long.".to_string());
        }

        let existing: rusqlite::Result<i64> = conn.query_row(
            "SELECT COUNT(*) FROM users WHERE username = ?1 COLLATE NOCASE",
            params![trimmed_user],
            |row| row.get(0),
        );
        if let Ok(count) = existing {
            if count > 0 {
                return Err("Username already exists.".to_string());
            }
        }

        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();

        conn.execute(
            "INSERT INTO users (id, username, password_hash, salt, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, trimmed_user, password_hash, salt, now, now],
        )
        .map_err(|e| e.to_string())?;

        Ok(AuthUser {
            id,
            username: trimmed_user.to_string(),
            created_at: now,
        })
    }

    pub fn get_user_credentials(
        conn: &SqliteConnection,
        username: &str,
    ) -> Result<Option<AuthUserWithCredentials>, String> {
        let trimmed_user = username.trim();
        let mut stmt = conn
            .prepare(
                "SELECT id, username, password_hash, salt, created_at FROM users WHERE username = ?1 COLLATE NOCASE",
            )
            .map_err(|e| e.to_string())?;

        let mut rows = stmt
            .query(params![trimmed_user])
            .map_err(|e| e.to_string())?;

        if let Some(row) = rows.next().map_err(|e| e.to_string())? {
            Ok(Some(AuthUserWithCredentials {
                id: row.get(0).map_err(|e| e.to_string())?,
                username: row.get(1).map_err(|e| e.to_string())?,
                password_hash: row.get(2).map_err(|e| e.to_string())?,
                salt: row.get(3).map_err(|e| e.to_string())?,
                created_at: row.get(4).map_err(|e| e.to_string())?,
            }))
        } else {
            Ok(None)
        }
    }

    pub fn get_user_by_id(
        conn: &SqliteConnection,
        id: &str,
    ) -> Result<Option<AuthUser>, String> {
        let mut stmt = conn
            .prepare("SELECT id, username, created_at FROM users WHERE id = ?1")
            .map_err(|e| e.to_string())?;

        let mut rows = stmt.query(params![id]).map_err(|e| e.to_string())?;

        if let Some(row) = rows.next().map_err(|e| e.to_string())? {
            Ok(Some(AuthUser {
                id: row.get(0).map_err(|e| e.to_string())?,
                username: row.get(1).map_err(|e| e.to_string())?,
                created_at: row.get(2).map_err(|e| e.to_string())?,
            }))
        } else {
            Ok(None)
        }
    }

    pub fn save_session(
        conn: &SqliteConnection,
        user_id: &str,
    ) -> Result<AuthSessionData, String> {
        let user = Self::get_user_by_id(conn, user_id)?
            .ok_or_else(|| "User not found".to_string())?;

        let token = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();

        conn.execute(
            "INSERT OR REPLACE INTO app_session (id, user_id, token, created_at) VALUES (1, ?1, ?2, ?3)",
            params![user.id, token, now],
        )
        .map_err(|e| e.to_string())?;

        Ok(AuthSessionData { user, token })
    }

    pub fn get_current_session(
        conn: &SqliteConnection,
    ) -> Result<Option<AuthSessionData>, String> {
        let mut stmt = conn
            .prepare(
                "SELECT s.token, u.id, u.username, u.created_at
                 FROM app_session s
                 JOIN users u ON s.user_id = u.id
                 WHERE s.id = 1",
            )
            .map_err(|e| e.to_string())?;

        let mut rows = stmt.query([]).map_err(|e| e.to_string())?;

        if let Some(row) = rows.next().map_err(|e| e.to_string())? {
            let token: String = row.get(0).map_err(|e| e.to_string())?;
            let user = AuthUser {
                id: row.get(1).map_err(|e| e.to_string())?,
                username: row.get(2).map_err(|e| e.to_string())?,
                created_at: row.get(3).map_err(|e| e.to_string())?,
            };
            Ok(Some(AuthSessionData { user, token }))
        } else {
            Ok(None)
        }
    }

    pub fn clear_session(conn: &SqliteConnection) -> Result<(), String> {
        conn.execute("DELETE FROM app_session WHERE id = 1", [])
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}

