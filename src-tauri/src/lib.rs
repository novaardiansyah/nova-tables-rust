pub mod commands;
pub mod database;
pub mod file_system;
pub mod os_integration;

use crate::file_system::FileSystem;
use crate::database::local_store::LocalStore;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .setup(|_app| {
      // Ensure application database and directories exist
      if let Ok(db_path) = FileSystem::get_database_path() {
        let _ = LocalStore::init(&db_path);
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      commands::system::get_system_info,
      commands::system::greet,
      commands::connection::list_connections,
      commands::connection::save_connection,
      commands::connection::delete_connection,
      commands::connection::list_folders,
      commands::connection::save_folder,
      commands::connection::delete_folder,
      commands::connection::test_connection,
      commands::query::execute_query,
      commands::query::list_databases,
      commands::query::list_tables,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
