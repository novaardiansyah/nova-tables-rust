use std::fs;
use std::path::PathBuf;

pub struct FileSystem;

impl FileSystem {
  pub fn get_app_dir() -> Result<PathBuf, String> {
    let base_dir = dirs::data_dir()
      .or_else(dirs::config_dir)
      .ok_or_else(|| "Could not determine system application directory".to_string())?;
    let app_dir = base_dir.join("nova-tables");
    if !app_dir.exists() {
      fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    }
    Ok(app_dir)
  }

  pub fn get_database_path() -> Result<PathBuf, String> {
    let app_dir = Self::get_app_dir()?;
    Ok(app_dir.join("connections.sqlite"))
  }

  pub fn read_file_string(path: &str) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| e.to_string())
  }

  pub fn write_file_string(path: &str, content: &str) -> Result<(), String> {
    fs::write(path, content).map_err(|e| e.to_string())
  }
}
