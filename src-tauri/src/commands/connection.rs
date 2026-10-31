use crate::database::local_store::{DbConnectionItem, FolderItem, LocalStore};
use crate::database::mssql;
use crate::database::mysql;
use crate::file_system::FileSystem;
use rusqlite::params;
use serde_json::{json, Value};
use std::collections::HashMap;

#[tauri::command]
pub fn list_connections() -> Result<Value, String> {
    let db_path = FileSystem::get_database_path()?;
    let conn = LocalStore::init(&db_path).map_err(|e| e.to_string())?;
    let connections = LocalStore::list_connections(&conn).map_err(|e| e.to_string())?;
    Ok(json!({
      "ok": true,
      "connections": connections
    }))
}

#[tauri::command]
pub fn save_connection(connection: DbConnectionItem) -> Result<Value, String> {
    let db_path = FileSystem::get_database_path()?;
    let conn = LocalStore::init(&db_path).map_err(|e| e.to_string())?;
    LocalStore::save_connection(&conn, &connection).map_err(|e| e.to_string())?;
    Ok(json!({
      "ok": true,
      "connection": connection
    }))
}

#[tauri::command]
pub fn delete_connection(id: String) -> Result<Value, String> {
    let db_path = FileSystem::get_database_path()?;
    let conn = LocalStore::init(&db_path).map_err(|e| e.to_string())?;
    LocalStore::delete_connection(&conn, &id).map_err(|e| e.to_string())?;
    Ok(json!({
      "ok": true
    }))
}

#[tauri::command]
pub fn update_last_database(connection_id: String, database: String) -> Result<Value, String> {
    let db_path = FileSystem::get_database_path()?;
    let conn = LocalStore::init(&db_path).map_err(|e| e.to_string())?;
    LocalStore::update_last_database_used(&conn, &connection_id, &database)
        .map_err(|e| e.to_string())?;
    Ok(json!({ "ok": true }))
}

#[tauri::command]
pub fn list_folders() -> Result<Value, String> {
    let db_path = FileSystem::get_database_path()?;
    let conn = LocalStore::init(&db_path).map_err(|e| e.to_string())?;
    let folders = LocalStore::list_folders(&conn).map_err(|e| e.to_string())?;
    Ok(json!({
      "ok": true,
      "folders": folders
    }))
}

#[tauri::command]
pub fn save_folder(folder: FolderItem) -> Result<Value, String> {
    let db_path = FileSystem::get_database_path()?;
    let conn = LocalStore::init(&db_path).map_err(|e| e.to_string())?;
    LocalStore::save_folder(&conn, &folder).map_err(|e| e.to_string())?;
    Ok(json!({
      "ok": true,
      "folder": folder
    }))
}

#[tauri::command]
pub fn delete_folder(id: String) -> Result<Value, String> {
    let db_path = FileSystem::get_database_path()?;
    let mut conn = LocalStore::init(&db_path).map_err(|e| e.to_string())?;
    let (deleted_folder_ids, deleted_connection_ids) =
        LocalStore::delete_folder(&mut conn, &id).map_err(|e| e.to_string())?;
    Ok(json!({
      "ok": true,
      "folderIds": deleted_folder_ids,
      "connectionIds": deleted_connection_ids
    }))
}

#[derive(Debug, serde::Deserialize)]
pub struct DeleteTreeInput {
    #[serde(rename = "folderIds", default)]
    pub folder_ids: Vec<String>,
    #[serde(rename = "connectionIds", default)]
    pub connection_ids: Vec<String>,
}

#[tauri::command]
pub fn delete_tree(input: DeleteTreeInput) -> Result<Value, String> {
    let db_path = FileSystem::get_database_path()?;
    let mut conn = LocalStore::init(&db_path).map_err(|e| e.to_string())?;
    let (deleted_folder_ids, deleted_connection_ids) =
        LocalStore::delete_tree(&mut conn, &input.folder_ids, &input.connection_ids)
            .map_err(|e| e.to_string())?;
    let connections = LocalStore::list_connections(&conn).map_err(|e| e.to_string())?;
    let folders = LocalStore::list_folders(&conn).map_err(|e| e.to_string())?;
    Ok(json!({
      "ok": true,
      "folderIds": deleted_folder_ids,
      "connectionIds": deleted_connection_ids,
      "connections": connections,
      "folders": folders
    }))
}

#[derive(Debug, serde::Deserialize)]
pub struct ReorderTreeInput {
    #[serde(default)]
    pub connections: Vec<String>,
    #[serde(default)]
    pub folders: Vec<String>,
    #[serde(rename = "connectionFolders", default)]
    pub connection_folders: HashMap<String, Option<String>>,
    #[serde(rename = "folderParents", default)]
    pub folder_parents: HashMap<String, Option<String>>,
}

#[tauri::command]
pub fn reorder_tree(input: ReorderTreeInput) -> Result<Value, String> {
    let db_path = FileSystem::get_database_path()?;
    let mut conn = LocalStore::init(&db_path).map_err(|e| e.to_string())?;
    LocalStore::update_tree_order(
        &mut conn,
        &input.connections,
        &input.folders,
        &input.connection_folders,
        &input.folder_parents,
    )
    .map_err(|e| e.to_string())?;
    let connections = LocalStore::list_connections(&conn).map_err(|e| e.to_string())?;
    let folders = LocalStore::list_folders(&conn).map_err(|e| e.to_string())?;
    Ok(json!({
      "ok": true,
      "connections": connections,
      "folders": folders
    }))
}

#[tauri::command]
pub async fn test_connection(connection: Value) -> Result<Value, String> {
    let db_path = FileSystem::get_database_path()?;
    let conn = LocalStore::init(&db_path).map_err(|e| e.to_string())?;

    let id_opt = connection.get("id").and_then(|v| v.as_str());
    let stored = if let Some(id) = id_opt {
        LocalStore::get_connection(&conn, id).ok().flatten()
    } else {
        None
    };

    let host = connection
        .get("host")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| stored.as_ref().map(|s| s.host.clone()))
        .unwrap_or_else(|| "127.0.0.1".to_string());

    let port = connection
        .get("port")
        .and_then(|v| v.as_u64())
        .map(|p| p as u16)
        .or_else(|| stored.as_ref().map(|s| s.port))
        .unwrap_or(1433);

    let username = connection
        .get("username")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| stored.as_ref().map(|s| s.username.clone()))
        .unwrap_or_default();

    let password = connection
        .get("password")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| stored.as_ref().and_then(|s| s.password.clone()))
        .or_else(|| stored.as_ref().and_then(|s| s.password_cipher.clone()))
        .unwrap_or_default();

    let database = connection
        .get("database")
        .or_else(|| connection.get("databaseName"))
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .or_else(|| stored.as_ref().and_then(|s| s.database_name.clone()));

    let encrypt = connection
        .get("encrypt")
        .and_then(|v| v.as_bool())
        .or_else(|| stored.as_ref().map(|s| s.encrypt))
        .unwrap_or(false);

    let trust_cert = connection
        .get("trustServerCertificate")
        .and_then(|v| v.as_bool())
        .or_else(|| stored.as_ref().map(|s| s.trust_server_certificate))
        .unwrap_or(true);

    let driver_type = connection
        .get("driverType")
        .and_then(|v| v.as_str())
        .or_else(|| {
            stored
                .as_ref()
                .map(|s| s.driver_type.as_deref().unwrap_or("sqlserver"))
        })
        .unwrap_or("sqlserver");

    let started = std::time::Instant::now();

    // If username is provided, attempt full TDS handshake with SQL Server
    if !username.is_empty() && driver_type == "sqlserver" {
        match mssql::create_client(
            &host,
            port,
            &username,
            &password,
            database.as_deref(),
            encrypt,
            trust_cert,
        )
        .await
        {
            Ok(mut client) => {
                let (server_name, version, edition) = mssql::read_server_info(&mut client).await;
                return Ok(json!({
                  "ok": true,
                  "serverName": server_name,
                  "productVersion": version,
                  "edition": edition,
                  "elapsedMs": started.elapsed().as_millis(),
                  "message": "Connection successful"
                }));
            }
            Err(err) => {
                return Ok(json!({
                  "ok": false,
                  "error": {
                    "message": err
                  }
                }));
            }
        }
    }

    // MySQL connection test
    if !username.is_empty() && driver_type == "mysql" {
        match mysql::create_client(
            &host,
            port,
            &username,
            &password,
            database.as_deref(),
            encrypt,
            trust_cert,
        )
        .await
        {
            Ok(mut client) => {
                let databases = mysql::list_databases(&mut client).await;
                return Ok(json!({
                  "ok": true,
                  "serverName": host,
                  "productVersion": "8.0", // simplified
                  "edition": "Community Edition",
                  "elapsedMs": started.elapsed().as_millis(),
                  "message": "MySQL connection successful",
                  "databases": databases.unwrap_or_default()
                }));
            }
            Err(err) => {
                return Ok(json!({
                  "ok": false,
                  "error": {
                    "message": err
                  }
                }));
            }
        }
    }

    // Socket connection test fallback
    use std::time::Duration;
    use tokio::net::TcpStream;
    use tokio::time::timeout;

    let addr = format!("{}:{}", host, port);
    match timeout(Duration::from_secs(4), TcpStream::connect(&addr)).await {
        Ok(Ok(_)) => Ok(json!({
          "ok": true,
          "serverName": host,
          "productVersion": "2022",
          "edition": "Developer Edition",
          "elapsedMs": started.elapsed().as_millis(),
          "message": "Connection successful"
        })),
        Ok(Err(e)) => Ok(json!({
          "ok": false,
          "error": {
            "message": format!("Could not connect to {}: {}", addr, e)
          }
        })),
        Err(_) => Ok(json!({
          "ok": false,
          "error": {
            "message": format!("Connection to {} timed out", addr)
          }
        })),
    }
}

#[tauri::command]
pub async fn test_mysql_connection(connection: Value) -> Result<Value, String> {
    let db_path = FileSystem::get_database_path()?;
    let conn = LocalStore::init(&db_path).map_err(|e| e.to_string())?;

    let id_opt = connection.get("id").and_then(|v| v.as_str());
    let stored = if let Some(id) = id_opt {
        LocalStore::get_connection(&conn, id).ok().flatten()
    } else {
        None
    };

    let host = connection
        .get("host")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| stored.as_ref().map(|s| s.host.clone()))
        .unwrap_or_else(|| "127.0.0.1".to_string());

    let port = connection
        .get("port")
        .and_then(|v| v.as_u64())
        .map(|p| p as u16)
        .or_else(|| stored.as_ref().map(|s| s.port))
        .unwrap_or(3306);

    let username = connection
        .get("username")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| stored.as_ref().map(|s| s.username.clone()))
        .unwrap_or_default();

    let password = connection
        .get("password")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| stored.as_ref().and_then(|s| s.password.clone()))
        .or_else(|| stored.as_ref().and_then(|s| s.password_cipher.clone()))
        .unwrap_or_default();

    let database = connection
        .get("database")
        .or_else(|| connection.get("databaseName"))
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .or_else(|| stored.as_ref().and_then(|s| s.database_name.clone()));

    let encrypt = connection
        .get("encrypt")
        .and_then(|v| v.as_bool())
        .or_else(|| stored.as_ref().map(|s| s.encrypt))
        .unwrap_or(false);

    let trust_cert = connection
        .get("trustServerCertificate")
        .and_then(|v| v.as_bool())
        .or_else(|| stored.as_ref().map(|s| s.trust_server_certificate))
        .unwrap_or(true);

    let driver_type = connection
        .get("driverType")
        .and_then(|v| v.as_str())
        .or_else(|| {
            stored
                .as_ref()
                .map(|s| s.driver_type.as_deref().unwrap_or("sqlserver"))
        })
        .unwrap_or("sqlserver");

    // Only proceed if driver_type is mysql
    if driver_type != "mysql" {
        return Ok(json!({
          "ok": false,
          "error": {
            "message": "Connection test requires driver_type=mysql"
          }
        }));
    }

    let started = std::time::Instant::now();

    match mysql::create_client(
        &host,
        port,
        &username,
        &password,
        database.as_deref(),
        encrypt,
        trust_cert,
    )
    .await
    {
        Ok(mut client) => {
            let databases = mysql::list_databases(&mut client).await;
            Ok(json!({
              "ok": true,
              "serverName": host,
              "productVersion": "8.0",
              "edition": "Community Edition",
              "elapsedMs": started.elapsed().as_millis(),
              "message": "MySQL connection successful",
              "databases": databases.unwrap_or_default()
            }))
        }
        Err(err) => Ok(json!({
          "ok": false,
          "error": {
            "message": err
          }
        })),
    }
}

#[tauri::command]
pub async fn connect(input: Value) -> Result<Value, String> {
    let db_path = FileSystem::get_database_path()?;
    let conn = LocalStore::init(&db_path).map_err(|e| e.to_string())?;

    let id_opt = input.get("id").and_then(|v| v.as_str());
    let stored = if let Some(id) = id_opt {
        LocalStore::get_connection(&conn, id).ok().flatten()
    } else {
        None
    };

    let id = id_opt
        .map(|s| s.to_string())
        .or_else(|| stored.as_ref().map(|s| s.id.clone()))
        .unwrap_or_else(|| "session-1".to_string());

    let name = input
        .get("name")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| stored.as_ref().map(|s| s.name.clone()))
        .unwrap_or_else(|| "SQL Server".to_string());

    let host = input
        .get("host")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| stored.as_ref().map(|s| s.host.clone()))
        .unwrap_or_else(|| "127.0.0.1".to_string());

    let port = input
        .get("port")
        .and_then(|v| v.as_u64())
        .map(|p| p as u16)
        .or_else(|| stored.as_ref().map(|s| s.port))
        .unwrap_or(1433);

    let username = input
        .get("username")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| stored.as_ref().map(|s| s.username.clone()))
        .unwrap_or_else(|| "sa".to_string());

    let password = input
        .get("password")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| stored.as_ref().and_then(|s| s.password.clone()))
        .or_else(|| stored.as_ref().and_then(|s| s.password_cipher.clone()))
        .unwrap_or_default();

    // Determine driver type - check stored connection first, then input
    let driver_type = input
        .get("driverType")
        .and_then(|v| v.as_str())
        .or_else(|| {
            stored
                .as_ref()
                .map(|s| s.driver_type.as_deref().unwrap_or("sqlserver"))
        })
        .unwrap_or("sqlserver");

    // Prefer explicitly requested database; if not specified, use last_database_used, then default database_name
    let database = input
        .get("database")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .or_else(|| {
            stored.as_ref().and_then(|s| {
                s.last_database_used
                    .as_ref()
                    .filter(|db| !db.is_empty())
                    .cloned()
                    .or_else(|| {
                        s.database_name
                            .as_ref()
                            .filter(|db| !db.is_empty())
                            .cloned()
                    })
            })
        })
        .or_else(|| {
            input
                .get("databaseName")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string())
        })
        .unwrap_or_else(|| "master".to_string());

    let encrypt = input
        .get("encrypt")
        .and_then(|v| v.as_bool())
        .or_else(|| stored.as_ref().map(|s| s.encrypt))
        .unwrap_or(false);

    let trust_cert = input
        .get("trustServerCertificate")
        .and_then(|v| v.as_bool())
        .or_else(|| stored.as_ref().map(|s| s.trust_server_certificate))
        .unwrap_or(true);

    // Prefer explicitly provided password
    if let Some(pwd) = input.get("password").and_then(|v| v.as_str()) {
        if !pwd.is_empty() {
            let _ = conn.execute(
                "UPDATE connections SET password_cipher = ?1 WHERE id = ?2",
                params![pwd, id],
            );
        }
    }

    // Try connection based on driver type
    if driver_type == "mysql" {
        // MySQL connection
        match mysql::create_client(
            &host,
            port,
            &username,
            &password,
            Some(&database),
            encrypt,
            trust_cert,
        )
        .await
        {
            Ok(mut client) => {
                let databases = mysql::list_databases(&mut client).await.unwrap_or_else(|_| {
          vec![
            json!({ "name": "mysql", "isSystem": true, "isOnline": true }),
            json!({ "name": "information_schema", "isSystem": true, "isOnline": true }),
            json!({ "name": "performance_schema", "isSystem": true, "isOnline": true }),
            json!({ "name": "sys", "isSystem": true, "isOnline": true }),
          ]
        });

                Ok(json!({
                  "ok": true,
                  "connectionId": id,
                  "name": name,
                  "host": host,
                  "port": port,
                  "database": database,
                  "databases": databases,
                  "serverVersion": "MySQL 8.0",
                  "serverName": host,
                  "edition": "Community Edition"
                }))
            }
            Err(e) => {
                if password.is_empty() {
                    Ok(json!({
                      "ok": false,
                      "error": {
                        "code": "PASSWORD_MISSING",
                        "message": "No saved password for this connection. Edit it and enter the password to continue."
                      }
                    }))
                } else {
                    Ok(json!({
                      "ok": false,
                      "error": {
                        "code": "CONNECTION_FAILED",
                        "message": e
                      }
                    }))
                }
            }
        }
    } else {
        // SQL Server connection (existing logic)
        match mssql::create_client(
            &host,
            port,
            &username,
            &password,
            Some(&database),
            encrypt,
            trust_cert,
        )
        .await
        {
            Ok(mut client) => {
                let databases = mssql::list_databases(&mut client)
                    .await
                    .unwrap_or_else(|_| {
                        vec![
                            json!({ "name": "master", "isSystem": true, "isOnline": true }),
                            json!({ "name": "model", "isSystem": true, "isOnline": true }),
                            json!({ "name": "msdb", "isSystem": true, "isOnline": true }),
                            json!({ "name": "tempdb", "isSystem": true, "isOnline": true }),
                        ]
                    });

                let (server_name, version, edition) = mssql::read_server_info(&mut client).await;

                // Update last_connected_at and last_database_used
                let _ = conn.execute(
          "UPDATE connections SET last_connected_at = datetime('now'), last_database_used = ?1 WHERE id = ?2",
          params![database, id],
        );

                Ok(json!({
                  "ok": true,
                  "connectionId": id,
                  "name": name,
                  "host": host,
                  "port": port,
                  "database": database,
                  "databases": databases,
                  "serverVersion": version,
                  "serverName": server_name,
                  "edition": edition
                }))
            }
            Err(e) => {
                if password.is_empty() {
                    Ok(json!({
                      "ok": false,
                      "error": {
                        "code": "PASSWORD_MISSING",
                        "message": "No saved password for this connection. Edit it and enter the password to continue."
                      }
                    }))
                } else {
                    Ok(json!({
                      "ok": false,
                      "error": {
                        "code": "CONNECTION_FAILED",
                        "message": e
                      }
                    }))
                }
            }
        }
    }
}

#[tauri::command]
pub fn disconnect_database(connection_id: Option<String>) -> Result<Value, String> {
    let _ = connection_id;
    Ok(json!({ "ok": true }))
}
