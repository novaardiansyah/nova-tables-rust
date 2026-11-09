use crate::database::connection_registry::{set_active_connection, remove_active_connection, ActiveConnectionInfo};
use crate::database::mssql;
use crate::database::mysql;
use serde_json::{json, Value};
use std::collections::HashMap;

#[tauri::command]
pub fn list_connections() -> Result<Value, String> {
  Ok(json!({
    "ok": true,
    "connections": []
  }))
}

#[tauri::command]
pub fn save_connection(connection: Value) -> Result<Value, String> {
  Ok(json!({
    "ok": true,
    "connection": connection
  }))
}

#[tauri::command]
pub fn duplicate_connection(_id: String, _name: Option<String>) -> Result<Value, String> {
  Ok(json!({
    "ok": true,
    "connection": null
  }))
}

#[tauri::command]
pub fn delete_connection(_id: String) -> Result<Value, String> {
  Ok(json!({ "ok": true }))
}

#[tauri::command]
pub fn update_last_database(connection_id: String, database: String) -> Result<Value, String> {
  crate::database::local_store::update_last_database(&connection_id, &database)?;
  Ok(json!({ "ok": true }))
}

#[tauri::command]
pub fn list_folders() -> Result<Value, String> {
  Ok(json!({
    "ok": true,
    "folders": []
  }))
}

#[tauri::command]
pub fn save_folder(folder: Value) -> Result<Value, String> {
  Ok(json!({
    "ok": true,
    "folder": folder
  }))
}

#[tauri::command]
pub fn delete_folder(id: String) -> Result<Value, String> {
  Ok(json!({
    "ok": true,
    "folderIds": [id],
    "connectionIds": []
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
  Ok(json!({
    "ok": true,
    "folderIds": input.folder_ids,
    "connectionIds": input.connection_ids,
    "connections": [],
    "folders": []
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
pub fn reorder_tree(_input: ReorderTreeInput) -> Result<Value, String> {
  Ok(json!({
    "ok": true,
    "connections": [],
    "folders": []
  }))
}

#[tauri::command]
pub async fn test_connection(connection: Value) -> Result<Value, String> {
  let host = connection
    .get("host")
    .and_then(|v| v.as_str())
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty())
    .unwrap_or_else(|| "127.0.0.1".to_string());

  let driver_type = connection
    .get("driverType")
    .and_then(|v| v.as_str())
    .unwrap_or("sqlserver");

  let default_port = if driver_type == "mysql" { 3306 } else { 1433 };
  let port = connection
    .get("port")
    .and_then(|v| {
      v.as_u64()
        .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
    })
    .map(|p| p as u16)
    .unwrap_or(default_port);

  let username = connection
    .get("username")
    .and_then(|v| v.as_str())
    .map(|s| s.trim().to_string())
    .unwrap_or_default();

  let password = connection
    .get("password")
    .and_then(|v| v.as_str())
    .or_else(|| connection.get("passwordCipher").and_then(|v| v.as_str()))
    .unwrap_or_default()
    .to_string();

  let database = connection
    .get("database")
    .or_else(|| connection.get("databaseName"))
    .and_then(|v| v.as_str())
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty());

  let encrypt = connection
    .get("encrypt")
    .and_then(|v| v.as_bool())
    .unwrap_or(false);

  let trust_cert = connection
    .get("trustServerCertificate")
    .and_then(|v| v.as_bool())
    .unwrap_or(true);

  let started = std::time::Instant::now();

  // Targeted for SQL Server: tests connectivity using Tiberius TDS protocol and reads server edition info.
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
        let databases = mssql::list_databases(&mut client).await;
        let tz_info = mssql::detect_server_timezone(&mut client).await;
        let detected_timezone = tz_info.as_ref().map(|(_, iana)| iana.clone());
        let detected_offset_minutes = tz_info.as_ref().map(|(min, _)| *min);
        return Ok(json!({
          "ok": true,
          "serverName": server_name,
          "productVersion": version,
          "edition": edition,
          "elapsedMs": started.elapsed().as_millis(),
          "message": "Connection successful",
          "databases": databases.unwrap_or_default(),
          "timezone": detected_timezone,
          "timezoneOffsetMinutes": detected_offset_minutes
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

  // Targeted for MySQL: tests connectivity using mysql_async client and retrieves database list.
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
        let tz_info = mysql::detect_server_timezone(&mut client).await;
        let detected_timezone = tz_info.as_ref().map(|(_, iana)| iana.clone());
        let detected_offset_minutes = tz_info.as_ref().map(|(min, _)| *min);
        return Ok(json!({
          "ok": true,
          "serverName": host,
          "productVersion": "8.0",
          "edition": "Community Edition",
          "elapsedMs": started.elapsed().as_millis(),
          "message": "MySQL connection successful",
          "databases": databases.unwrap_or_default(),
          "timezone": detected_timezone,
          "timezoneOffsetMinutes": detected_offset_minutes
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
  let host = connection
    .get("host")
    .and_then(|v| v.as_str())
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty())
    .unwrap_or_else(|| "127.0.0.1".to_string());

  let port = connection
    .get("port")
    .and_then(|v| {
      v.as_u64()
        .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
    })
    .map(|p| p as u16)
    .unwrap_or(3306);

  let username = connection
    .get("username")
    .and_then(|v| v.as_str())
    .map(|s| s.trim().to_string())
    .unwrap_or_default();

  let password = connection
    .get("password")
    .and_then(|v| v.as_str())
    .or_else(|| connection.get("passwordCipher").and_then(|v| v.as_str()))
    .unwrap_or_default()
    .to_string();

  let database = connection
    .get("database")
    .or_else(|| connection.get("databaseName"))
    .and_then(|v| v.as_str())
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty());

  let encrypt = connection
    .get("encrypt")
    .and_then(|v| v.as_bool())
    .unwrap_or(false);

  let trust_cert = connection
    .get("trustServerCertificate")
    .and_then(|v| v.as_bool())
    .unwrap_or(true);

  let started = std::time::Instant::now();

  // Targeted for MySQL: tests connection directly using MySQL protocol.
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
      let tz_info = mysql::detect_server_timezone(&mut client).await;
      let detected_timezone = tz_info.as_ref().map(|(_, iana)| iana.clone());
      let detected_offset_minutes = tz_info.as_ref().map(|(min, _)| *min);
      Ok(json!({
        "ok": true,
        "serverName": host,
        "productVersion": "8.0",
        "edition": "Community Edition",
        "elapsedMs": started.elapsed().as_millis(),
        "message": "MySQL connection successful",
        "databases": databases.unwrap_or_default(),
        "timezone": detected_timezone,
        "timezoneOffsetMinutes": detected_offset_minutes
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
  let id = input
    .get("id")
    .and_then(|v| v.as_str())
    .unwrap_or("session-1")
    .to_string();

  let name = input
    .get("name")
    .and_then(|v| v.as_str())
    .unwrap_or("Connection")
    .to_string();

  let host = input
    .get("host")
    .and_then(|v| v.as_str())
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty())
    .unwrap_or_else(|| "127.0.0.1".to_string());

  let driver_type = input
    .get("driverType")
    .and_then(|v| v.as_str())
    .unwrap_or("sqlserver");

  let default_port = if driver_type == "mysql" { 3306 } else { 1433 };
  let port = input
    .get("port")
    .and_then(|v| {
      v.as_u64()
        .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
    })
    .map(|p| p as u16)
    .unwrap_or(default_port);

  let username = input
    .get("username")
    .and_then(|v| v.as_str())
    .map(|s| s.trim().to_string())
    .unwrap_or_else(|| {
      if driver_type == "mysql" {
        "root".to_string()
      } else {
        "sa".to_string()
      }
    });

  let password = input
    .get("password")
    .and_then(|v| v.as_str())
    .or_else(|| input.get("passwordCipher").and_then(|v| v.as_str()))
    .unwrap_or_default()
    .to_string();

  let database = input
    .get("database")
    .or_else(|| input.get("databaseName"))
    .and_then(|v| v.as_str())
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty() && !(driver_type == "mysql" && s == "master"))
    .unwrap_or_else(|| {
      if driver_type == "mysql" {
        String::new()
      } else {
        "master".to_string()
      }
    });

  let encrypt = input
    .get("encrypt")
    .and_then(|v| v.as_bool())
    .unwrap_or(false);

  let trust_cert = input
    .get("trustServerCertificate")
    .and_then(|v| v.as_bool())
    .unwrap_or(true);

  // Targeted for MySQL: creates MySQL connection and discovers database schema metadata.
  if driver_type == "mysql" {
    let mut client_res = mysql::create_client(
      &host,
      port,
      &username,
      &password,
      Some(&database),
      encrypt,
      trust_cert,
    )
    .await;

    let mut connected_database = database.clone();

    if client_res.is_err() && !database.is_empty() {
      let fallback_res = mysql::create_client(
        &host,
        port,
        &username,
        &password,
        Some(""),
        encrypt,
        trust_cert,
      )
      .await;

      if fallback_res.is_ok() {
        client_res = fallback_res;
        connected_database = String::new();
      }
    }

    match client_res {
      Ok(mut client) => {
        let databases = mysql::list_databases(&mut client).await.unwrap_or_else(|_| {
          vec![
            json!({ "name": "mysql", "isSystem": true, "isOnline": true }),
            json!({ "name": "information_schema", "isSystem": true, "isOnline": true }),
            json!({ "name": "performance_schema", "isSystem": true, "isOnline": true }),
            json!({ "name": "sys", "isSystem": true, "isOnline": true }),
          ]
        });
        let tz_info = mysql::detect_server_timezone(&mut client).await;
        let detected_timezone = tz_info.as_ref().map(|(_, iana)| iana.clone());
        let detected_offset_minutes = tz_info.as_ref().map(|(min, _)| *min);

        set_active_connection(ActiveConnectionInfo {
          id: id.clone(),
          name: name.clone(),
          host: host.clone(),
          port,
          username: username.clone(),
          password: if !password.is_empty() { Some(password.clone()) } else { None },
          password_cipher: None,
          database_name: Some(connected_database.clone()),
          driver_type: Some("mysql".to_string()),
          encrypt,
          trust_server_certificate: trust_cert,
          timezone: detected_timezone.clone(),
        });

        Ok(json!({
          "ok": true,
          "connectionId": id,
          "name": name,
          "host": host,
          "port": port,
          "database": connected_database,
          "databases": databases,
          "serverVersion": "MySQL 8.0",
          "serverName": host,
          "edition": "Community Edition",
          "timezone": detected_timezone,
          "timezoneOffsetMinutes": detected_offset_minutes
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
    // Targeted for SQL Server: creates TDS connection and initializes server session metadata.
    let mut client_res = mssql::create_client(
      &host,
      port,
      &username,
      &password,
      Some(&database),
      encrypt,
      trust_cert,
    )
    .await;

    let mut connected_database = database.clone();

    if client_res.is_err() && database != "master" {
      let fallback_res = mssql::create_client(
        &host,
        port,
        &username,
        &password,
        Some("master"),
        encrypt,
        trust_cert,
      )
      .await;

      if fallback_res.is_ok() {
        client_res = fallback_res;
        connected_database = "master".to_string();
      }
    }

    match client_res {
      Ok(mut client) => {
        let databases = mssql::list_databases(&mut client).await.unwrap_or_else(|_| {
          vec![
            json!({ "name": "master", "isSystem": true, "isOnline": true }),
            json!({ "name": "model", "isSystem": true, "isOnline": true }),
            json!({ "name": "msdb", "isSystem": true, "isOnline": true }),
            json!({ "name": "tempdb", "isSystem": true, "isOnline": true }),
          ]
        });

        let (_server_name, _version, _edition) = mssql::read_server_info(&mut client).await;
        let tz_info = mssql::detect_server_timezone(&mut client).await;
        let detected_timezone = tz_info.as_ref().map(|(_, iana)| iana.clone());
        let detected_offset_minutes = tz_info.as_ref().map(|(min, _)| *min);

        set_active_connection(ActiveConnectionInfo {
          id: id.clone(),
          name: name.clone(),
          host: host.clone(),
          port,
          username: username.clone(),
          password: if !password.is_empty() { Some(password.clone()) } else { None },
          password_cipher: None,
          database_name: Some(connected_database.clone()),
          driver_type: Some("sqlserver".to_string()),
          encrypt,
          trust_server_certificate: trust_cert,
          timezone: detected_timezone.clone(),
        });

        Ok(json!({
          "ok": true,
          "connectionId": id,
          "name": name,
          "host": host,
          "port": port,
          "database": connected_database,
          "databases": databases,
          "serverVersion": "Microsoft SQL Server",
          "serverName": host,
          "edition": "Developer Edition",
          "timezone": detected_timezone,
          "timezoneOffsetMinutes": detected_offset_minutes
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
pub fn disconnect_database(connection_id: String) -> Result<Value, String> {
  remove_active_connection(&connection_id);
  Ok(json!({ "ok": true }))
}
