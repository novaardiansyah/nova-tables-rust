pub mod commands;
pub mod database;
pub mod file_system;
pub mod os_integration;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_dialog::init())
    .setup(|_app| {
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      commands::system::get_system_info,
      commands::auth::start_oauth_listener,
      commands::auth::check_oauth_result,
      commands::auth::auth_register,
      commands::auth::auth_get_user_credentials,
      commands::auth::auth_create_session,
      commands::auth::auth_get_current_session,
      commands::auth::auth_logout,
      commands::system::get_app_info,
      commands::system::greet,
      commands::system::get_settings,
      commands::system::save_settings,
      commands::system::get_workspace_state,
      commands::system::save_workspace_state,
      commands::system::save_file,
      commands::system::select_import_file,
      commands::connection::list_connections,
      commands::connection::save_connection,
      commands::connection::duplicate_connection,
      commands::connection::delete_connection,
      commands::connection::update_last_database,
      commands::connection::list_folders,
      commands::connection::save_folder,
      commands::connection::delete_folder,
      commands::connection::delete_tree,
      commands::connection::test_connection,
      commands::connection::test_mysql_connection,
      commands::connection::connect,
      commands::connection::disconnect_database,
      commands::connection::reorder_tree,
      commands::query::execute_query,
      commands::query::list_databases,
      commands::query::list_tables,
      commands::query::list_columns,
      commands::query::table_structure,
      commands::query::count_table_rows,
      commands::query::table_relations,
      commands::erd::get_erd_data,
      commands::query::list_modules,
      commands::query::module_definition,
      commands::query::describe_result,
      commands::query::get_execution_plan,
      commands::query::create_database,
      commands::query::drop_database,
      commands::query::list_database_users,
      commands::query::create_database_user,
      commands::query::update_database_user_roles,
      commands::query::drop_database_user
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
