use crate::database::auth::{AuthSessionData, AuthStore, AuthUser, AuthUserWithCredentials};
use crate::file_system::FileSystem;
use rusqlite::Connection as SqliteConnection;
use serde_json::Value;

fn get_db_conn() -> Result<SqliteConnection, String> {
    let db_path = FileSystem::get_database_path()?;
    let conn = SqliteConnection::open(&db_path).map_err(|e| e.to_string())?;
    AuthStore::setup_schema(&conn).map_err(|e| e.to_string())?;
    Ok(conn)
}

#[tauri::command]
pub fn auth_register(
    username: String,
    password_hash: String,
    salt: String,
) -> Result<AuthUser, String> {
    let conn = get_db_conn()?;
    AuthStore::create_user(&conn, &username, &password_hash, &salt)
}

#[tauri::command]
pub fn auth_get_user_credentials(
    username: String,
) -> Result<Option<AuthUserWithCredentials>, String> {
    let conn = get_db_conn()?;
    AuthStore::get_user_credentials(&conn, &username)
}

#[tauri::command]
pub fn auth_create_session(user_id: String) -> Result<AuthSessionData, String> {
    let conn = get_db_conn()?;
    AuthStore::save_session(&conn, &user_id)
}

#[tauri::command]
pub fn auth_get_current_session() -> Result<Option<AuthSessionData>, String> {
    let conn = get_db_conn()?;
    AuthStore::get_current_session(&conn)
}

#[tauri::command]
pub fn auth_logout() -> Result<Value, String> {
    let conn = get_db_conn()?;
    AuthStore::clear_session(&conn)?;
    Ok(serde_json::json!({ "ok": true }))
}

