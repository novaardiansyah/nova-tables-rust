use mysql_async::{prelude::Queryable, Conn, Opts, OptsBuilder, Pool, Row};
use serde_json::{json, Value};
use std::collections::HashMap;

pub type MySqlConn = Conn;
pub type MySqlPool = Pool;

// Reads a nullable text column without panicking on NULL values.
fn opt_string(row: &Row, index: usize) -> Option<String> {
    row.get::<Option<String>, _>(index).flatten()
}

// Reads a nullable integer column without panicking on NULL values.
fn opt_i64(row: &Row, index: usize) -> Option<i64> {
    row.get::<Option<i64>, _>(index).flatten()
}

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
    let schema_filter = if db.is_empty() {
        "".to_string()
    } else {
        format!(" AND t.TABLE_SCHEMA = '{db}'")
    };
    let query = format!(
        "SELECT t.TABLE_SCHEMA AS table_schema, t.TABLE_NAME AS table_name, k.COLUMN_NAME AS pk_column
         FROM information_schema.TABLES t
         LEFT JOIN information_schema.KEY_COLUMN_USAGE k
           ON k.TABLE_SCHEMA = t.TABLE_SCHEMA
            AND k.TABLE_NAME = t.TABLE_NAME
            AND k.CONSTRAINT_NAME = 'PRIMARY'
         WHERE t.TABLE_TYPE = 'BASE TABLE'{}
         ORDER BY t.TABLE_SCHEMA, t.TABLE_NAME, k.ORDINAL_POSITION",
        schema_filter
    );

    let rows: Vec<Row> = conn.query(query).await.map_err(|e| e.to_string())?;
    let mut map: HashMap<(String, String), Vec<String>> = HashMap::new();
    let mut order: Vec<(String, String)> = Vec::new();

    for row in rows {
        let schema = opt_string(&row, 0);
        let name = opt_string(&row, 1);
        let pk = opt_string(&row, 2);
        let (s, n) = (schema.unwrap_or_default(), name.unwrap_or_default());
        if s.is_empty() || n.is_empty() {
            continue;
        }
        let key = (s.clone(), n.clone());

        if !map.contains_key(&key) {
            order.push(key.clone());
            map.insert(key.clone(), Vec::new());
        }
        if let Some(pk_col) = pk {
            if !pk_col.is_empty() {
                if let Some(pks) = map.get_mut(&key) {
                    pks.push(pk_col);
                }
            }
        }
    }

    let tables: Vec<Value> = order
        .into_iter()
        .map(|(schema, name)| {
            let pk = map.remove(&(schema.clone(), name.clone())).unwrap_or_default();
            json!({
              "schema": schema,
              "name": name,
              "primaryKey": pk
            })
        })
        .collect();

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

/// Database-level privileges that can be managed from the permissions dialog.
const DATABASE_PRIVILEGES: [&str; 18] = [
    "SELECT",
    "INSERT",
    "UPDATE",
    "DELETE",
    "CREATE",
    "DROP",
    "REFERENCES",
    "INDEX",
    "ALTER",
    "CREATE VIEW",
    "SHOW VIEW",
    "CREATE ROUTINE",
    "ALTER ROUTINE",
    "EXECUTE",
    "CREATE TEMPORARY TABLES",
    "LOCK TABLES",
    "TRIGGER",
    "EVENT",
];

// MySQL accounts are stored as `'user'@'host'`.
fn parse_account(account: &str) -> Option<(String, String)> {
    let inner = account.trim().strip_prefix('\'')?.strip_suffix('\'')?;
    let separator = inner.find("'@'")?;
    let user = inner[..separator].replace("''", "'");
    let host = inner[separator + 3..].replace("''", "'");
    Some((user, host))
}

fn escape_literal(value: &str) -> String {
    value.replace('\\', "\\\\").replace('\'', "''")
}

fn quote_account(user: &str, host: &str) -> String {
    format!("'{}'@'{}'", escape_literal(user), escape_literal(host))
}

fn is_system_user(user: &str) -> bool {
    let lower = user.to_lowercase();
    lower == "root" || lower.starts_with("mysql.") || lower == "mysql.sys" || lower == "mysql.session"
}

// Validates the requested privileges and returns them in canonical form.
fn normalize_privileges(roles: &[String]) -> Result<Vec<String>, String> {
    let mut result: Vec<String> = Vec::new();
    for role in roles {
        let upper = role.trim().to_uppercase();
        if upper.is_empty() {
            continue;
        }
        if !DATABASE_PRIVILEGES.contains(&upper.as_str()) {
            return Err(format!("Privilege \"{}\" cannot be managed here.", role));
        }
        if !result.contains(&upper) {
            result.push(upper);
        }
    }
    Ok(result)
}

// Returns the lowercased (user, host) of the current connection account.
async fn current_account(conn: &mut Conn) -> Result<(String, String), String> {
    let rows: Vec<Row> = conn
        .query("SELECT CURRENT_USER()")
        .await
        .map_err(|e| e.to_string())?;
    let current = rows
        .first()
        .and_then(|row| opt_string(row, 0))
        .unwrap_or_default();
    let (user, host) = parse_account(&current).unwrap_or_default();
    Ok((user.to_lowercase(), host.to_lowercase()))
}

// Ensures the account exists, is not a system account and is not the current connection account.
async fn assert_manageable(conn: &mut Conn, account: &str) -> Result<(String, String), String> {
    let (user, host) = parse_account(account)
        .ok_or_else(|| format!("Invalid MySQL account \"{}\".", account))?;
    if is_system_user(&user) {
        return Err("This system user cannot be changed.".to_string());
    }
    let (current_user, current_host) = current_account(conn).await?;
    if current_user == user.to_lowercase() && current_host == host.to_lowercase() {
        return Err("The current connection user cannot be changed.".to_string());
    }
    Ok((user, host))
}

/// Lists MySQL accounts that have privileges on the specified database.
pub async fn list_database_users(
    conn: &mut Conn,
    database: Option<&str>,
) -> Result<Value, String> {
    let db = database.unwrap_or("").trim();
    if db.is_empty() {
        return Err("Choose a database first.".to_string());
    }

    let (current_user, current_host) = current_account(conn).await?;

    let rows: Vec<Row> = conn
        .exec(
            "SELECT GRANTEE, PRIVILEGE_TYPE FROM information_schema.SCHEMA_PRIVILEGES \
             WHERE TABLE_SCHEMA = ? ORDER BY GRANTEE, PRIVILEGE_TYPE",
            (db,),
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut order: Vec<String> = Vec::new();
    let mut privileges: HashMap<String, Vec<String>> = HashMap::new();

    for row in rows {
        let grantee = opt_string(&row, 0).unwrap_or_default();
        let privilege = opt_string(&row, 1).unwrap_or_default();
        if grantee.is_empty() || privilege.is_empty() {
            continue;
        }
        if !privileges.contains_key(&grantee) {
            order.push(grantee.clone());
            privileges.insert(grantee.clone(), Vec::new());
        }
        if let Some(list) = privileges.get_mut(&grantee) {
            list.push(privilege);
        }
    }

    let mut users = Vec::new();
    for grantee in &order {
        let Some((user, host)) = parse_account(grantee) else {
            continue;
        };
        let is_current =
            user.to_lowercase() == current_user && host.to_lowercase() == current_host;
        let is_system = is_system_user(&user);
        let roles = privileges.remove(grantee).unwrap_or_default();
        users.push(json!({
          "name": grantee,
          "type": "MYSQL_USER",
          "defaultSchema": db,
          "loginName": null,
          "roles": roles,
          "canManage": !is_current && !is_system,
          "reason": if is_system { Some("system") } else if is_current { Some("current") } else { None }
        }));
    }

    // Existing accounts that can still be granted access to this database.
    let mut logins = Vec::new();
    if let Ok(login_rows) = conn
        .query::<Row, _>("SELECT User, Host FROM mysql.user ORDER BY User, Host")
        .await
    {
        for row in login_rows {
            let user = opt_string(&row, 0).unwrap_or_default();
            let host = opt_string(&row, 1).unwrap_or_default();
            if user.is_empty() || is_system_user(&user) {
                continue;
            }
            if user.to_lowercase() == current_user && host.to_lowercase() == current_host {
                continue;
            }
            let grantee = quote_account(&user, &host);
            if order
                .iter()
                .any(|existing| existing.eq_ignore_ascii_case(&grantee))
            {
                continue;
            }
            logins.push(json!({
              "name": grantee,
              "type": "MYSQL_USER"
            }));
        }
    }

    Ok(json!({
      "ok": true,
      "users": users,
      "roles": DATABASE_PRIVILEGES,
      "logins": logins
    }))
}

/// Grants database-level privileges to an existing MySQL account.
pub async fn create_database_user(
    conn: &mut Conn,
    database: Option<&str>,
    name: &str,
    roles: &[String],
) -> Result<Value, String> {
    let db = database.unwrap_or("").trim();
    if db.is_empty() {
        return Err("Choose a database first.".to_string());
    }
    let (user, host) = parse_account(name)
        .ok_or_else(|| format!("Invalid MySQL account \"{}\".", name))?;
    let account = quote_account(&user, &host);
    let privileges = normalize_privileges(roles)?;

    if !privileges.is_empty() {
        let sql = format!(
            "GRANT {} ON {}.* TO {}",
            privileges.join(", "),
            quote_name(db),
            account
        );
        conn.query_drop(sql).await.map_err(|e| e.to_string())?;
    }

    Ok(json!({
      "ok": true,
      "user": account,
      "roles": privileges
    }))
}

/// Replaces the database-level privileges of a MySQL account.
pub async fn update_database_user_roles(
    conn: &mut Conn,
    database: Option<&str>,
    name: &str,
    roles: &[String],
) -> Result<Value, String> {
    let db = database.unwrap_or("").trim();
    if db.is_empty() {
        return Err("Choose a database first.".to_string());
    }
    let (user, host) = assert_manageable(conn, name).await?;
    let account = quote_account(&user, &host);
    let desired = normalize_privileges(roles)?;

    let rows: Vec<Row> = conn
        .exec(
            "SELECT PRIVILEGE_TYPE FROM information_schema.SCHEMA_PRIVILEGES \
             WHERE TABLE_SCHEMA = ? AND GRANTEE = ?",
            (db, account.as_str()),
        )
        .await
        .map_err(|e| e.to_string())?;
    let current: Vec<String> = rows.iter().filter_map(|row| opt_string(row, 0)).collect();

    let to_revoke: Vec<String> = current
        .iter()
        .filter(|privilege| !desired.contains(privilege))
        .cloned()
        .collect();
    let to_grant: Vec<String> = desired
        .iter()
        .filter(|privilege| !current.contains(privilege))
        .cloned()
        .collect();

    if !to_revoke.is_empty() {
        let sql = format!(
            "REVOKE {} ON {}.* FROM {}",
            to_revoke.join(", "),
            quote_name(db),
            account
        );
        conn.query_drop(sql).await.map_err(|e| e.to_string())?;
    }
    if !to_grant.is_empty() {
        let sql = format!(
            "GRANT {} ON {}.* TO {}",
            to_grant.join(", "),
            quote_name(db),
            account
        );
        conn.query_drop(sql).await.map_err(|e| e.to_string())?;
    }

    Ok(json!({
      "ok": true,
      "user": account,
      "roles": desired
    }))
}

/// Revokes every database-level privilege from a MySQL account (the account itself stays).
pub async fn drop_database_user(
    conn: &mut Conn,
    database: Option<&str>,
    name: &str,
) -> Result<Value, String> {
    let db = database.unwrap_or("").trim();
    if db.is_empty() {
        return Err("Choose a database first.".to_string());
    }
    let (user, host) = assert_manageable(conn, name).await?;
    let account = quote_account(&user, &host);

    let rows: Vec<Row> = conn
        .exec(
            "SELECT PRIVILEGE_TYPE FROM information_schema.SCHEMA_PRIVILEGES \
             WHERE TABLE_SCHEMA = ? AND GRANTEE = ? LIMIT 1",
            (db, account.as_str()),
        )
        .await
        .map_err(|e| e.to_string())?;
    if !rows.is_empty() {
        let sql = format!(
            "REVOKE ALL PRIVILEGES ON {}.* FROM {}",
            quote_name(db),
            account
        );
        conn.query_drop(sql).await.map_err(|e| e.to_string())?;
    }

    Ok(json!({
      "ok": true,
      "user": account
    }))
}

/// Gets table relations (foreign keys) via information_schema.
pub async fn table_relations(
    conn: &mut Conn,
    database: Option<&str>,
    schema: &str,
    table: &str,
) -> Result<Value, String> {
    let db = database.as_deref().filter(|value| !value.is_empty()).unwrap_or(schema);
    let query = format!(
        "SELECT k.COLUMN_NAME AS column_name,
                k.REFERENCED_TABLE_SCHEMA AS referenced_schema,
                k.REFERENCED_TABLE_NAME AS referenced_table,
                k.REFERENCED_COLUMN_NAME AS referenced_column
         FROM information_schema.KEY_COLUMN_USAGE k
         WHERE k.TABLE_SCHEMA = '{db}' AND k.TABLE_NAME = '{table}'
           AND k.REFERENCED_TABLE_NAME IS NOT NULL
         ORDER BY k.CONSTRAINT_NAME, k.ORDINAL_POSITION"
    );

    let rows: Vec<Row> = conn.query(query).await.map_err(|e| e.to_string())?;
    let mut relations = Vec::new();

    for row in rows {
        let column = opt_string(&row, 0).unwrap_or_default();
        let referenced_schema = opt_string(&row, 1).unwrap_or_default();
        let referenced_table = opt_string(&row, 2).unwrap_or_default();
        let referenced_column = opt_string(&row, 3).unwrap_or_default();
        if column.is_empty() || referenced_table.is_empty() || referenced_column.is_empty() {
            continue;
        }
        relations.push(json!({
          "column": column,
          "referencedSchema": referenced_schema,
          "referencedTable": referenced_table,
          "referencedColumn": referenced_column,
        }));
    }

    Ok(json!({
      "ok": true,
      "relations": relations
    }))
}

/// Gets table structure via information_schema + SHOW CREATE TABLE.
pub async fn table_structure(
    conn: &mut Conn,
    database: Option<&str>,
    schema: &str,
    table: &str,
) -> Result<Value, String> {
    let db = database.as_deref().unwrap_or(schema);

    // 1. Columns
    let col_query = format!(
        "SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE,
                 IS_NULLABLE, COLUMN_DEFAULT, COLUMN_KEY, EXTRA, COLLATION_NAME, GENERATION_EXPRESSION
          FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = '{db}' AND TABLE_NAME = '{table}'
          ORDER BY ORDINAL_POSITION"
    );

    let columns_rows: Vec<Row> = conn.query(&col_query).await.map_err(|e| e.to_string())?;
    let mut columns: Vec<Value> = Vec::new();

    for row in columns_rows {
        let name = opt_string(&row, 0).unwrap_or_default();
        let type_name = opt_string(&row, 1).unwrap_or_default();
        let char_max_len = opt_i64(&row, 2);
        let num_prec = opt_i64(&row, 3);
        let num_scale = opt_i64(&row, 4);
        let is_nullable = opt_string(&row, 5);
        let column_default = opt_string(&row, 6);
        let extra = opt_string(&row, 8);
        let collation_name = opt_string(&row, 9);
        let generation_expr = opt_string(&row, 10);

        let is_identity = extra.as_ref().map(|e| e.contains("auto_increment")).unwrap_or(false);
        let is_computed = generation_expr.as_ref().map(|e| !e.is_empty()).unwrap_or(false);

        let max_length = char_max_len.map(|v| if v == -1 { 0 } else { v }).unwrap_or(0) as u32;

        columns.push(json!({
          "name": name,
          "typeName": type_name,
          "maxLength": max_length,
          "precision": num_prec.map(|v| v as u32).unwrap_or(0),
          "scale": num_scale.map(|v| v as u8).unwrap_or(0),
          "isNullable": is_nullable.as_deref() == Some("YES"),
          "isIdentity": is_identity,
          "isComputed": is_computed,
          "computedDefinition": generation_expr.filter(|_| is_computed),
          "seedValue": if is_identity { Some(1) } else { None },
          "incrementValue": if is_identity { Some(1) } else { None },
          "collation": collation_name,
          "databaseCollation": None::<String>,
          "defaultDefinition": column_default,
          "defaultName": None::<String>
        }));
    }

    // 2. Primary key via KEY_COLUMN_USAGE
    let pk_query = format!(
        "SELECT COLUMN_NAME
         FROM information_schema.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = '{db}' AND TABLE_NAME = '{table}'
           AND CONSTRAINT_NAME = 'PRIMARY'
         ORDER BY ORDINAL_POSITION"
    );
    let pk_rows: Vec<Row> = conn.query(&pk_query).await.map_err(|e| e.to_string())?;
    let pk_columns: Vec<String> = pk_rows
        .iter()
        .filter_map(|row| opt_string(row, 0))
        .filter(|s| !s.is_empty())
        .collect();

    let primary_key = if !pk_columns.is_empty() {
        vec![json!({
          "name": "PRIMARY",
          "columns": pk_columns,
          "descending": pk_columns.iter().map(|_| false).collect::<Vec<bool>>(),
          "clustered": false
        })]
    } else {
        vec![]
    };

    // 3. Indexes and unique keys via STATISTICS
    let idx_query = format!(
        "SELECT INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME, COLLATION
         FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = '{db}' AND TABLE_NAME = '{table}'
         ORDER BY INDEX_NAME, SEQ_IN_INDEX"
    );
    let idx_rows: Vec<Row> = conn.query(&idx_query).await.map_err(|e| e.to_string())?;

    let mut idx_map: HashMap<String, (bool, Vec<String>, Vec<bool>)> = HashMap::new();
    let mut idx_order: Vec<String> = Vec::new();

    for row in idx_rows {
        let index_name = opt_string(&row, 0);
        let non_unique = opt_i64(&row, 1);
        let column_name = opt_string(&row, 3);
        let collation = opt_string(&row, 4);

        let name = index_name.unwrap_or_default();
        if name.is_empty() {
            continue;
        }
        if !idx_map.contains_key(&name) {
            idx_order.push(name.clone());
            idx_map.insert(name.clone(), (false, Vec::new(), Vec::new()));
        }
        if let Some(col) = column_name {
            if let Some((_, cols, desc)) = idx_map.get_mut(&name) {
                cols.push(col);
                desc.push(collation.as_deref() == Some("D"));
            }
        }
        if let Some(unique_flag) = non_unique {
            if let Some((u, _, _)) = idx_map.get_mut(&name) {
                *u = unique_flag == 0;
            }
        }
    }

    let mut unique_keys: Vec<Value> = Vec::new();
    let mut indexes: Vec<Value> = Vec::new();

    for name in idx_order {
        if name == "PRIMARY" {
            continue;
        }
        if let Some((is_unique, cols, desc)) = idx_map.remove(&name) {
            if is_unique {
                unique_keys.push(json!({
                  "name": name,
                  "columns": cols,
                  "descending": desc,
                  "clustered": false,
                  "unique": true
                }));
            } else {
                indexes.push(json!({
                  "name": name,
                  "columns": cols,
                  "descending": desc,
                  "clustered": false,
                  "unique": false
                }));
            }
        }
    }

    // 4. Foreign keys via KEY_COLUMN_USAGE
    let fk_query = format!(
        "SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_SCHEMA, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
         FROM information_schema.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = '{db}' AND TABLE_NAME = '{table}'
           AND REFERENCED_TABLE_NAME IS NOT NULL
         ORDER BY CONSTRAINT_NAME, ORDINAL_POSITION"
    );
    let fk_rows: Vec<Row> = conn.query(&fk_query).await.map_err(|e| e.to_string())?;

    let mut fk_map: HashMap<String, (String, String, Vec<(String, String)>)> = HashMap::new();
    let mut fk_order: Vec<String> = Vec::new();

    for row in fk_rows {
        let constraint_name = opt_string(&row, 0);
        let column_name = opt_string(&row, 1);
        let ref_schema = opt_string(&row, 2);
        let ref_table = opt_string(&row, 3);
        let ref_column = opt_string(&row, 4);

        let name = constraint_name.unwrap_or_default();
        if name.is_empty() {
            continue;
        }
        if !fk_map.contains_key(&name) {
            fk_order.push(name.clone());
            fk_map.insert(name.clone(), (
                ref_schema.unwrap_or_default(),
                ref_table.unwrap_or_default(),
                Vec::new()
            ));
        }
        if let (Some(col), Some(ref_col)) = (column_name, ref_column) {
            if let Some((_, _, cols)) = fk_map.get_mut(&name) {
                cols.push((col, ref_col));
            }
        }
    }

    let foreign_keys: Vec<Value> = fk_order
        .into_iter()
        .map(|name| {
            let (ref_schema, ref_table, cols) = fk_map.remove(&name).unwrap_or_default();
            json!({
              "name": name,
              "referencedSchema": ref_schema,
              "referencedTable": ref_table,
              "columns": cols
                .iter()
                .map(|(c, rc)| json!({
                  "column": c,
                  "referencedColumn": rc
                }))
                .collect::<Vec<Value>>()
            })
        })
        .collect();

    // 5. DDL statement via SHOW CREATE TABLE
    let create_query = format!("SHOW CREATE TABLE `{schema}`.`{table}`");
    let stmt_rows: Vec<Row> = conn.query(&create_query).await.map_err(|e| e.to_string())?;
    let statement: String = stmt_rows
        .first()
        .and_then(|row| opt_string(row, 1))
        .unwrap_or_default();

    Ok(json!({
      "database": database,
      "schema": schema,
      "table": table,
      "objectName": format!("`{schema}`.`{table}`"),
      "statement": statement,
      "columns": columns,
      "foreignKeys": foreign_keys,
      "primaryKey": primary_key,
      "uniqueKeys": unique_keys,
      "indexes": indexes,
    }))
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

/// Gets the estimated execution plan via EXPLAIN FORMAT=JSON.
pub async fn get_execution_plan(
    conn: &mut Conn,
    _database: Option<&str>,
    sql: &str,
) -> Result<Value, String> {
    let statement = sql.trim().trim_end_matches(';').trim();
    if statement.is_empty() {
        return Err("Nothing to analyze".to_string());
    }

    let query = format!("EXPLAIN FORMAT=JSON {statement}");
    let rows: Vec<Row> = conn.query(query).await.map_err(|e| e.to_string())?;
    let plan = rows
        .first()
        .and_then(|row| opt_string(row, 0))
        .unwrap_or_default();
    if plan.is_empty() {
        return Err("MySQL returned an empty execution plan".to_string());
    }

    Ok(json!({
      "plan": plan
    }))
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
