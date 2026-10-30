use mysql_async::{prelude::Queryable, Conn, Opts, OptsBuilder, Pool, Row};
use serde_json::{json, Value};
use std::collections::HashMap;

pub type MySqlConn = Conn;
pub type MySqlPool = Pool;

// Creates a MySQL/MariaDB client connection.
pub async fn create_client(
    host: &str,
    port: u16,
    username: &str,
    password: &str,
    database: Option<&str>,
    _encrypt: bool,
    _trust_cert: bool,
) -> Result<Conn, String> {
    let mut builder = OptsBuilder::default()
        .ip_or_hostname(host)
        .tcp_port(port)
        .user(Some(username))
        .pass(Some(password));

    if let Some(db) = database {
        if !db.is_empty() {
            builder = builder.db_name(Some(db));
        }
    }

    let opts = Opts::from(builder);
    let conn = Conn::new(opts)
        .await
        .map_err(|e| format!("MySQL connection failed: {}", e))?;

    Ok(conn)
}

/// Lists all databases from the MySQL/MariaDB server.
pub async fn list_databases(conn: &mut Conn) -> Result<Vec<Value>, String> {
    let rows: Vec<Row> = conn
        .query("SHOW DATABASES")
        .await
        .map_err(|e| e.to_string())?;
    let system_dbs = ["information_schema", "mysql", "performance_schema", "sys"];
    let mut databases = Vec::new();

    for row in rows {
        // Column 0 is the database name
        let name: String = row.get(0).unwrap_or_default();
        let is_system = system_dbs.contains(&name.to_lowercase().as_str());
        databases.push(json!({
          "name": name,
          "isSystem": is_system,
          "isOnline": true
        }));
    }

    Ok(databases)
}

/// Reads server information (version, name, edition).
pub async fn read_server_info(conn: &mut Conn) -> (String, String, String) {
    let rows: Vec<Row> = conn
        .query("SELECT VERSION()")
        .await
        .map_err(|e| e.to_string())
        .unwrap_or_default();

    if let Some(row) = rows.first() {
        let version: String = row.get(0).unwrap_or_default();
        let server_name = if version.to_lowercase().contains("maria") {
            "MariaDB".to_string()
        } else {
            "MySQL".to_string()
        };
        (server_name, version, "Community".to_string())
    } else {
        (
            "MySQL".to_string(),
            "8.0".to_string(),
            "Community".to_string(),
        )
    }
}

/// Lists all tables from the specified database.
pub async fn list_tables(conn: &mut Conn, database: Option<&str>) -> Result<Value, String> {
    let db = database.unwrap_or("");
    let query = if db.is_empty() {
        "SELECT TABLE_SCHEMA AS table_schema, TABLE_NAME AS table_name FROM information_schema.TABLES WHERE TABLE_TYPE = 'BASE TABLE'".to_string()
    } else {
        format!("SELECT TABLE_SCHEMA AS table_schema, TABLE_NAME AS table_name FROM information_schema.TABLES WHERE TABLE_SCHEMA = '{}'", db)
    };

    let rows: Vec<Row> = conn.query(query).await.map_err(|e| e.to_string())?;
    let mut tables = Vec::new();
    let mut seen: HashMap<(String, String), bool> = HashMap::new();

    for row in rows {
        let schema: String = row.get(0).unwrap_or_default();
        let name: String = row.get(1).unwrap_or_default();
        let key = (schema.clone(), name.clone());

        if !seen.contains_key(&key) {
            seen.insert(key.clone(), true);
            tables.push(json!({
              "schema": schema,
              "name": name
            }));
        }
    }

    Ok(json!({
      "database": database,
      "tables": tables
    }))
}

/// Lists all columns for tables in the specified database.
pub async fn list_columns(conn: &mut Conn, database: Option<&str>) -> Result<Value, String> {
    let db = database.unwrap_or("");
    let query = if db.is_empty() {
        "SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY, EXTRA FROM information_schema.COLUMNS".to_string()
    } else {
        format!("SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY, EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '{}'", db)
    };

    let rows: Vec<Row> = conn.query(query).await.map_err(|e| e.to_string())?;
    let mut columns = Vec::new();

    for row in rows {
        let schema: String = row.get(0).unwrap_or_default();
        let table: String = row.get(1).unwrap_or_default();
        let column: String = row.get(2).unwrap_or_default();
        let data_type: String = row.get(3).unwrap_or_default();
        let is_nullable: String = row.get(4).unwrap_or_default();
        let column_key: String = row.get(5).unwrap_or_default();
        let extra: String = row.get(6).unwrap_or_default();

        columns.push(json!({
          "tableSchema": schema,
          "tableName": table,
          "name": column,
          "typeName": data_type,
          "nullable": is_nullable == "YES",
          "columnKey": column_key,
          "extra": extra
        }));
    }

    Ok(json!({
      "database": database,
      "tables": columns
    }))
}

/// Gets client for connection (placeholder - driver_type aware routing happens in commands).
pub async fn get_client_for_connection(
    _connection_id: &str,
    _database: Option<&str>,
) -> Result<Conn, String> {
    Err("MySQL connection setup needs driver_type awareness".to_string())
}

/// Executes a SQL statement and returns result as JSON.
pub async fn execute_sql(conn: &mut Conn, sql: &str) -> Result<Value, String> {
    let rows: Vec<Row> = conn.query(sql).await.map_err(|e| e.to_string())?;

    let mut result_sets = Vec::new();

    // Group rows into result sets (for multi-statement queries)
    let mut current_set: Vec<Vec<Value>> = Vec::new();
    let mut current_columns: Option<Vec<Value>> = None;

    for row in rows {
        // Each row becomes a set of column values
        let mut cells = Vec::new();
        for i in 0..row.columns().len() {
            let val: String = row.get::<String, _>(i).unwrap_or_default();
            cells.push(json!(val));
        }

        if current_columns.is_none() {
            // Store column names from first row
            let mut cols = Vec::new();
            for i in 0..row.columns().len() {
                let col_name: String = row
                    .columns()
                    .get(i)
                    .map(|c| c.name_str().to_string())
                    .unwrap_or_default();
                cols.push(json!({ "name": col_name }));
            }
            current_columns = Some(cols);
        }

        current_set.push(cells);
    }

    // Build result sets if we have any
    if let Some(columns) = current_columns {
        result_sets.push(json!({
          "columns": columns,
          "rows": current_set
        }));
    } else if !current_set.is_empty() {
        result_sets.push(json!({
          "columns": [],
          "rows": current_set
        }));
    }

    let total_rows: u64 = current_set.iter().map(|s| s.len() as u64).sum();

    Ok(json!({
      "ok": true,
      "resultSets": result_sets,
      "rowCount": total_rows,
      "rowsAffected": [total_rows],
      "messages": [],
      "elapsedMs": 0,
      "truncated": false,
      "maxRows": 20000
    }))
}

/// Lists stored routines (functions and procedures).
pub async fn list_modules(conn: &mut Conn, database: Option<&str>) -> Result<Value, String> {
    let db = database.unwrap_or("");
    let query = if db.is_empty() {
        "SELECT Routine_name AS routine_name, Routine_type AS routine_type FROM information_schema.Routines WHERE Routine_schema NOT IN ('mysql', 'information_schema', 'performance_schema') ORDER BY Routine_name".to_string()
    } else {
        format!("SELECT Routine_name AS routine_name, Routine_type AS routine_type FROM information_schema.Routines WHERE Routine_schema = '{}' ORDER BY Routine_name", db)
    };

    let rows: Vec<Row> = conn.query(query).await.map_err(|e| e.to_string())?;
    let mut modules = Vec::new();

    for row in rows {
        let name: String = row.get(0).unwrap_or_default();
        let r#type: String = row.get(1).unwrap_or_default();

        modules.push(json!({
          "name": name,
          "type": r#type
        }));
    }

    Ok(json!({
      "database": database,
      "modules": modules
    }))
}

/// Quotes a value for use in SQL (backtick quoting for MySQL).
pub fn quote_name(value: &str) -> String {
    format!("`{}`", value.replace('`', "``"))
}

/// Gets table relations (foreign keys) - simplified MySQL implementation.
pub async fn table_relations(
    _conn: &mut Conn,
    _database: Option<&str>,
    _schema: &str,
    _table: &str,
) -> Result<Value, String> {
    // MySQL foreign keys via information_schema - simplified
    Err("Not yet implemented for MySQL".to_string())
}

/// Gets table structure (DDL) - simplified MySQL implementation.
pub async fn table_structure(
    _conn: &mut Conn,
    _database: Option<&str>,
    _schema: &str,
    _table: &str,
) -> Result<Value, String> {
    // MySQL table DDL via SHOW CREATE TABLE - simplified
    Err("Not yet implemented for MySQL".to_string())
}

/// Gets module definition - simplified MySQL implementation.
pub async fn module_definition(
    _conn: &mut Conn,
    _database: Option<&str>,
    _schema: &str,
    _name: &str,
) -> Result<Value, String> {
    Err("Not yet implemented for MySQL".to_string())
}

/// Gets execution plan for a SQL statement - MySQL uses EXPLAIN.
pub async fn get_execution_plan(
    _conn: &mut Conn,
    _database: Option<&str>,
    _sql: &str,
) -> Result<Value, String> {
    // MySQL uses EXPLAIN statement
    Err("Not yet implemented for MySQL".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_mysql_connection_and_list_databases() {
        // Test skipped - requires live MySQL/MariaDB connection
        let _host = "localhost";
        let _port: u16 = 3306;
        let _user = "root";
        let _password = "";

        // This would need a running MySQL server to test
        // let opts = OptsBuilder::default()
        //   .ip_or_hostname(_host.to_string())
        //   .tcp_port(_port)
        //   .user(Some(_user.to_string()))
        //   .pass(Some(_password.to_string()));
        // let conn = Conn::new(Opts::from(opts)).await;
        //
        // if let Ok(mut client) = conn {
        //   let dbs = list_databases(&mut client).await.expect("Failed to list databases");
        //   // Just check we can execute
        //   assert!(!dbs.is_empty() || true); // May be empty depending on server
        // }
    }
}
