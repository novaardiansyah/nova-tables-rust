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
    .plugin(tauri_plugin_dialog::init())
    .setup(|_app| {
      // Ensure application database and directories exist
      if let Ok(db_path) = FileSystem::get_database_path() {
        let _ = LocalStore::init(&db_path);
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      commands::system::get_system_info,
      commands::system::get_app_info,
      commands::system::greet,
      commands::system::get_settings,
      commands::system::save_settings,
      commands::system::get_workspace_state,
      commands::system::save_workspace_state,
      commands::system::save_file,
      commands::connection::list_connections,
      commands::connection::save_connection,
      commands::connection::delete_connection,
      commands::connection::update_last_database,
      commands::connection::list_folders,
      commands::connection::save_folder,
      commands::connection::delete_folder,
      commands::connection::delete_tree,
      commands::connection::test_connection,
      commands::connection::connect,
      commands::connection::disconnect_database,
      commands::query::execute_query,
      commands::query::list_databases,
      commands::query::list_tables,
      commands::query::list_columns,
      commands::query::table_structure,
      commands::query::table_relations,
      commands::query::list_modules,
      commands::query::module_definition,
      commands::query::describe_result,
      commands::query::get_execution_plan,
      commands::query::list_query_history,
      commands::query::clear_query_history,
      commands::query::delete_query_history,
      commands::query::list_saved_queries,
      commands::query::save_saved_query,
      commands::query::rename_saved_query,
      commands::query::delete_saved_query,
      commands::query::drop_database,
      commands::query::list_database_users,
      commands::query::create_database_user,
      commands::query::update_database_user_roles,
      commands::query::drop_database_user,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
