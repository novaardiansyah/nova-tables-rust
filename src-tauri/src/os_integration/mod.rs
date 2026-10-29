use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct SystemInfo {
  pub os: String,
  pub arch: String,
  pub platform: String,
  pub version: String,
}

pub struct OsIntegration;

impl OsIntegration {
  pub fn get_system_info() -> SystemInfo {
    SystemInfo {
      os: std::env::consts::OS.to_string(),
      arch: std::env::consts::ARCH.to_string(),
      platform: if cfg!(target_os = "windows") {
        "windows".to_string()
      } else if cfg!(target_os = "linux") {
        "linux".to_string()
      } else if cfg!(target_os = "macos") {
        "macos".to_string()
      } else {
        "unknown".to_string()
      },
      version: env!("CARGO_PKG_VERSION").to_string(),
    }
  }

  pub fn is_windows() -> bool {
    cfg!(target_os = "windows")
  }

  pub fn is_linux() -> bool {
    cfg!(target_os = "linux")
  }
}
