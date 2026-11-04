use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{OnceLock, RwLock};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ActiveConnectionInfo {
  pub id: String,
  pub name: String,
  pub host: String,
  pub port: u16,
  pub username: String,
  pub password: Option<String>,
  pub password_cipher: Option<String>,
  pub database_name: Option<String>,
  pub driver_type: Option<String>,
  pub encrypt: bool,
  pub trust_server_certificate: bool,
  pub timezone: Option<String>,
}

fn registry() -> &'static RwLock<HashMap<String, ActiveConnectionInfo>> {
  static REGISTRY: OnceLock<RwLock<HashMap<String, ActiveConnectionInfo>>> = OnceLock::new();
  REGISTRY.get_or_init(|| RwLock::new(HashMap::new()))
}

pub fn set_active_connection(conn: ActiveConnectionInfo) {
  if let Ok(mut map) = registry().write() {
    map.insert(conn.id.clone(), conn);
  }
}

pub fn get_active_connection(id: &str) -> Option<ActiveConnectionInfo> {
  if let Ok(map) = registry().read() {
    map.get(id).cloned()
  } else {
    None
  }
}

pub fn remove_active_connection(id: &str) {
  if let Ok(mut map) = registry().write() {
    map.remove(id);
  }
}

