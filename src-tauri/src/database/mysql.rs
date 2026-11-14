use mysql_async::{prelude::Queryable, Conn, Opts, OptsBuilder, Pool, Row};
use serde_json::{json, Value};
use std::collections::HashMap;

pub type MySqlConn = Conn;
pub type MySqlPool = Pool;

fn offset_minutes_to_iana(minutes: i32) -> &'static str {
    match minutes {
        -720 => "Etc/GMT+12",
        -660 => "Pacific/Pago_Pago",
        -600 => "Pacific/Honolulu",
        -570 => "Pacific/Marquesas",
        -540 => "Pacific/Gambier",
        -480 => "America/Los_Angeles",
        -420 => "America/Phoenix",
        -360 => "America/Guatemala",
        -300 => "America/Lima",
        -240 => "America/Santo_Domingo",
        -180 => "America/Argentina/Buenos_Aires",
        -150 => "America/St_Johns",
        -120 => "Atlantic/South_Georgia",
        -60 => "Atlantic/Azores",
        0 => "Etc/UTC",
        60 => "Africa/Lagos",
        120 => "Africa/Johannesburg",
        180 => "Asia/Riyadh",
        210 => "Asia/Tehran",
        240 => "Asia/Dubai",
        270 => "Asia/Kabul",
        300 => "Asia/Karachi",
        330 => "Asia/Kolkata",
        345 => "Asia/Kathmandu",
        360 => "Asia/Dhaka",
        390 => "Asia/Yangon",
        420 => "Asia/Jakarta",
        480 => "Asia/Makassar",
        525 => "Australia/Eucla",
        540 => "Asia/Tokyo",
        570 => "Australia/Darwin",
        600 => "Australia/Brisbane",
        630 => "Australia/Lord_Howe",
        660 => "Pacific/Noumea",
        720 => "Pacific/Fiji",
        765 => "Pacific/Chatham",
        780 => "Pacific/Apia",
        840 => "Pacific/Kiritimati",
        _ => "UTC",
    }
}

pub async fn detect_server_timezone(conn: &mut Conn) -> Option<(i32, String)> {
    if let Ok(rows) = conn
        .query::<Row, _>("SELECT TIMESTAMPDIFF(MINUTE, UTC_TIMESTAMP(), NOW())")
        .await
    {
        if let Some(row) = rows.first() {
            if let Some(offset) = row.get::<Option<i64>, _>(0).flatten() {
                let offset_i32 = offset as i32;
                let iana = offset_minutes_to_iana(offset_i32).to_string();
                return Some((offset_i32, iana));
            }
        }
    }
    None
}

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

/// Creates an empty database on the server.
pub async fn create_database(conn: &mut Conn, database: &str) -> Result<Value, String> {
    let name = database.trim();
    if name.is_empty() {
        return Err("Enter a database name.".to_string());
    }

    let sql = format!("CREATE DATABASE {}", quote_name(name));
    conn.query_drop(sql).await.map_err(|e| e.to_string())?;

    Ok(json!({
      "ok": true,
      "database": name
    }))
}

/// Drops a database on the MySQL/MariaDB server.
pub async fn drop_database(conn: &mut Conn, database: &str) -> Result<Value, String> {
    let name = database.trim();
    if name.is_empty() {
        return Err("Enter a database name.".to_string());
    }

    let sql = format!("DROP DATABASE {}", quote_name(name));
    conn.query_drop(sql).await.map_err(|e| e.to_string())?;

    Ok(json!({
      "ok": true,
      "database": name
    }))
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
    // Targeted for MySQL: retrieves primary key columns and auto_increment attribute from information_schema.TABLES, KEY_COLUMN_USAGE, and COLUMNS.
    let query = format!(
        "SELECT t.TABLE_SCHEMA AS table_schema,
                t.TABLE_NAME AS table_name,
                k.COLUMN_NAME AS pk_column,
                CASE WHEN c.EXTRA LIKE '%auto_increment%' THEN 1 ELSE 0 END AS is_auto_inc
         FROM information_schema.TABLES t
         LEFT JOIN information_schema.KEY_COLUMN_USAGE k
           ON k.TABLE_SCHEMA = t.TABLE_SCHEMA
            AND k.TABLE_NAME = t.TABLE_NAME
            AND k.CONSTRAINT_NAME = 'PRIMARY'
         LEFT JOIN information_schema.COLUMNS c
           ON c.TABLE_SCHEMA = k.TABLE_SCHEMA
            AND c.TABLE_NAME = k.TABLE_NAME
            AND c.COLUMN_NAME = k.COLUMN_NAME
         WHERE t.TABLE_TYPE = 'BASE TABLE'{}
         ORDER BY t.TABLE_SCHEMA, t.TABLE_NAME, k.ORDINAL_POSITION",
        schema_filter
    );

    let rows: Vec<Row> = conn.query(query).await.map_err(|e| e.to_string())?;
    let mut map: HashMap<(String, String), (Vec<String>, Vec<String>)> = HashMap::new();
    let mut order: Vec<(String, String)> = Vec::new();

    for row in rows {
        let schema = opt_string(&row, 0);
        let name = opt_string(&row, 1);
        let pk = opt_string(&row, 2);
        let is_auto_inc: Option<i64> = row.get(3);
        let is_identity = is_auto_inc.unwrap_or(0) == 1;
        let (s, n) = (schema.unwrap_or_default(), name.unwrap_or_default());
        if s.is_empty() || n.is_empty() {
            continue;
        }
        let key = (s.clone(), n.clone());

        if !map.contains_key(&key) {
            order.push(key.clone());
            map.insert(key.clone(), (Vec::new(), Vec::new()));
        }
        if let Some(pk_col) = pk {
            if !pk_col.is_empty() {
                if let Some((pks, id_cols)) = map.get_mut(&key) {
                    pks.push(pk_col.clone());
                    if is_identity {
                        id_cols.push(pk_col);
                    }
                }
            }
        }
    }

    let tables: Vec<Value> = order
        .into_iter()
        .map(|(schema, name)| {
            let (pk, id_cols) = map
                .remove(&(schema.clone(), name.clone()))
                .unwrap_or_default();
            json!({
              "schema": schema,
              "name": name,
              "primaryKey": pk,
              "identityColumns": id_cols
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
        "SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION".to_string()
    } else {
        format!("SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '{}' ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION", db)
    };

    let rows: Vec<Row> = conn.query(query).await.map_err(|e| e.to_string())?;
    let mut map: HashMap<(String, String), Vec<String>> = HashMap::new();
    let mut order: Vec<(String, String)> = Vec::new();

    for row in rows {
        let schema: String = row.get(0).unwrap_or_default();
        let table: String = row.get(1).unwrap_or_default();
        let column: String = row.get(2).unwrap_or_default();
        if schema.is_empty() || table.is_empty() || column.is_empty() {
            continue;
        }
        let key = (schema.clone(), table.clone());
        if !map.contains_key(&key) {
            order.push(key.clone());
            map.insert(key.clone(), Vec::new());
        }
        if let Some(cols) = map.get_mut(&key) {
            cols.push(column);
        }
    }

    let mut tables = Vec::new();
    for (schema, name) in order {
        let cols = map
            .remove(&(schema.clone(), name.clone()))
            .unwrap_or_default();
        tables.push(json!({
          "schema": schema,
          "name": name,
          "columns": cols
        }));
    }

    Ok(json!({
      "database": database,
      "tables": tables
    }))
}

// Targeted for MySQL: connects using mysql_async client configuration retrieved from in-memory connection registry.
pub async fn get_client_for_connection(
    connection_id: &str,
    database: Option<&str>,
) -> Result<Conn, String> {
    let item = crate::database::connection_registry::get_active_connection(connection_id)
        .ok_or_else(|| format!("Active connection {} not found. Please connect first.", connection_id))?;

    let password = item.password.or(item.password_cipher).unwrap_or_default();
    let db_to_use = database
        .filter(|s| !s.is_empty())
        .or(item.database_name.as_deref().filter(|s| !s.is_empty()));

    create_client(
        &item.host,
        item.port,
        &item.username,
        &password,
        db_to_use,
        item.encrypt,
        item.trust_server_certificate,
    )
    .await
}

pub fn mysql_column_type_to_string(col_type: mysql_async::consts::ColumnType) -> &'static str {
    use mysql_async::consts::ColumnType::*;
    match col_type {
        MYSQL_TYPE_DECIMAL | MYSQL_TYPE_NEWDECIMAL => "decimal",
        MYSQL_TYPE_TINY => "tinyint",
        MYSQL_TYPE_SHORT => "smallint",
        MYSQL_TYPE_LONG => "int",
        MYSQL_TYPE_FLOAT => "float",
        MYSQL_TYPE_DOUBLE => "double",
        MYSQL_TYPE_NULL => "null",
        MYSQL_TYPE_TIMESTAMP | MYSQL_TYPE_TIMESTAMP2 => "timestamp",
        MYSQL_TYPE_LONGLONG => "bigint",
        MYSQL_TYPE_INT24 => "mediumint",
        MYSQL_TYPE_DATE | MYSQL_TYPE_NEWDATE => "date",
        MYSQL_TYPE_TIME | MYSQL_TYPE_TIME2 => "time",
        MYSQL_TYPE_DATETIME | MYSQL_TYPE_DATETIME2 => "datetime",
        MYSQL_TYPE_YEAR => "year",
        MYSQL_TYPE_VARCHAR | MYSQL_TYPE_VAR_STRING => "varchar",
        MYSQL_TYPE_BIT => "bit",
        MYSQL_TYPE_JSON => "json",
        MYSQL_TYPE_ENUM => "enum",
        MYSQL_TYPE_SET => "set",
        MYSQL_TYPE_TINY_BLOB => "tinyblob",
        MYSQL_TYPE_MEDIUM_BLOB => "mediumblob",
        MYSQL_TYPE_LONG_BLOB => "longblob",
        MYSQL_TYPE_BLOB => "blob",
        MYSQL_TYPE_STRING => "char",
        MYSQL_TYPE_GEOMETRY => "geometry",
        _ => "varchar",
    }
}

/// Executes a SQL statement and returns result as JSON.
pub async fn execute_sql(conn: &mut Conn, sql: &str) -> Result<Value, String> {
    let started = std::time::Instant::now();
    let rows: Vec<Row> = conn.query(sql).await.map_err(|e| e.to_string())?;

    let mut result_sets = Vec::new();

    // Group rows into result sets (for multi-statement queries)
    let mut current_set: Vec<Vec<Value>> = Vec::new();
    let mut current_columns: Option<Vec<Value>> = None;

    for row in rows {
        // Each row becomes a set of column values
        let mut cells = Vec::new();
        for i in 0..row.columns().len() {
            let val = row
                .as_ref(i)
                .map(|v| match v {
                    mysql_async::Value::NULL => Value::Null,
                    mysql_async::Value::Bytes(b) => {
                        if let Ok(s) = std::str::from_utf8(b) {
                            Value::String(s.to_string())
                        } else {
                            Value::Array(b.iter().map(|&byte| Value::Number(byte.into())).collect())
                        }
                    }
                    mysql_async::Value::Int(i) => Value::from(*i),
                    mysql_async::Value::UInt(u) => Value::from(*u),
                    mysql_async::Value::Float(f) => Value::from(*f),
                    mysql_async::Value::Double(d) => Value::from(*d),
                    mysql_async::Value::Date(year, month, day, hour, min, sec, micro) => {
                        if *hour == 0 && *min == 0 && *sec == 0 && *micro == 0 {
                            Value::String(format!("{:04}-{:02}-{:02}", year, month, day))
                        } else if *micro == 0 {
                            Value::String(format!(
                                "{:04}-{:02}-{:02} {:02}:{:02}:{:02}",
                                year, month, day, hour, min, sec
                            ))
                        } else {
                            Value::String(format!(
                                "{:04}-{:02}-{:02} {:02}:{:02}:{:02}.{:06}",
                                year, month, day, hour, min, sec, micro
                            ))
                        }
                    }
                    mysql_async::Value::Time(is_neg, days, hours, mins, secs, micro) => {
                        let sign = if *is_neg { "-" } else { "" };
                        if *days == 0 {
                            if *micro == 0 {
                                Value::String(format!("{}{:02}:{:02}:{:02}", sign, hours, mins, secs))
                            } else {
                                Value::String(format!(
                                    "{}{:02}:{:02}:{:02}.{:06}",
                                    sign, hours, mins, secs, micro
                                ))
                            }
                        } else {
                            if *micro == 0 {
                                Value::String(format!(
                                    "{}{}d {:02}:{:02}:{:02}",
                                    sign, days, hours, mins, secs
                                ))
                            } else {
                                Value::String(format!(
                                    "{}{}d {:02}:{:02}:{:02}.{:06}",
                                    sign, days, hours, mins, secs, micro
                                ))
                            }
                        }
                    }
                })
                .unwrap_or(Value::Null);
            cells.push(json!(val));
        }

        if current_columns.is_none() {
            let row_cols = row.columns();
            let mut cols = Vec::new();
            for c in row_cols.iter() {
                cols.push(json!({
                    "name": c.name_str(),
                    "type": mysql_column_type_to_string(c.column_type()),
                }));
            }
            current_columns = Some(cols);
        }

        current_set.push(cells);
    }

    // Build result sets per batch while preserving MySQL NULL and type safety.
    // Targeted for MySQL: MySQL rows are serialized from mysql_async Value variants without
    // panicking on NULL; `rowCount` and `elapsedMs` are tracked per result set and in the root.
    if let Some(columns) = current_columns {
        let row_count = current_set.len();
        result_sets.push(json!({
          "columns": columns,
          "rows": current_set,
          "rowCount": row_count,
        }));
    } else if !current_set.is_empty() {
        let row_count = current_set.len();
        result_sets.push(json!({
          "columns": [],
          "rows": current_set,
          "rowCount": row_count,
        }));
    }

    let total_rows: u64 = current_set.len() as u64;
    let elapsed_ms = started.elapsed().as_millis() as u64;

    Ok(json!({
      "ok": true,
      "resultSets": result_sets,
      "rowCount": total_rows,
      "rowsAffected": [total_rows],
      "messages": [],
      "elapsedMs": elapsed_ms,
      "truncated": false,
      "maxRows": 20000
    }))
}

/// Lists stored routines (functions and procedures).
pub async fn list_modules(conn: &mut Conn, database: Option<&str>) -> Result<Value, String> {
    let db = database.unwrap_or("");
    let query = if db.is_empty() {
        "SELECT Routine_name AS routine_name, Routine_type AS routine_type, Routine_schema AS routine_schema FROM information_schema.Routines WHERE Routine_schema NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys') ORDER BY Routine_name".to_string()
    } else {
        format!("SELECT Routine_name AS routine_name, Routine_type AS routine_type, Routine_schema AS routine_schema FROM information_schema.Routines WHERE Routine_schema = '{}' ORDER BY Routine_name", db)
    };

    let rows: Vec<Row> = conn.query(query).await.map_err(|e| e.to_string())?;
    let mut modules = Vec::new();

    for row in rows {
        let name: String = row.get(0).unwrap_or_default();
        let r#type: String = row.get(1).unwrap_or_default();
        let schema: String = row.get(2).unwrap_or_else(|| db.to_string());

        modules.push(json!({
          "schema": schema,
          "name": name,
          "type": r#type.to_lowercase()
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
    lower == "root"
        || lower.starts_with("mysql.")
        || lower == "mysql.sys"
        || lower == "mysql.session"
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
    let (user, host) =
        parse_account(account).ok_or_else(|| format!("Invalid MySQL account \"{}\".", account))?;
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
pub async fn list_database_users(conn: &mut Conn, database: Option<&str>) -> Result<Value, String> {
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
        let is_current = user.to_lowercase() == current_user && host.to_lowercase() == current_host;
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
    let (user, host) =
        parse_account(name).ok_or_else(|| format!("Invalid MySQL account \"{}\".", name))?;
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
    let db = database
        .as_deref()
        .filter(|value| !value.is_empty())
        .unwrap_or(schema);
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
// Targeted for MySQL: uses information_schema.TABLES.TABLE_ROWS as an estimate and COUNT(*) for small tables.
pub async fn count_table_rows(
    conn: &mut Conn,
    database: Option<&str>,
    schema: &str,
    table: &str,
    estimate_threshold: u64,
) -> Result<Value, String> {
    let db = database.filter(|value| !value.is_empty()).unwrap_or(schema);
    let estimate_query = format!(
        "SELECT TABLE_ROWS FROM information_schema.TABLES WHERE TABLE_SCHEMA = '{}' AND TABLE_NAME = '{}'",
        db.replace('\\', "\\\\").replace('\'', "''"),
        table.replace('\\', "\\\\").replace('\'', "''")
    );

    let estimate_row: Option<Row> = conn
        .query_first(estimate_query)
        .await
        .map_err(|e| e.to_string())?;
    let estimated = estimate_row
        .and_then(|row| row.get::<Option<u64>, usize>(0))
        .flatten();
    let should_count_exactly = match estimated {
        Some(value) => value <= estimate_threshold,
        None => true,
    };

    if should_count_exactly {
        // Targeted for MySQL: COUNT(*) returns the exact row count for small tables and views.
        let count_query = format!(
            "SELECT COUNT(*) FROM `{}`.`{}`",
            db.replace('`', "``"),
            table.replace('`', "``")
        );
        let count_row: Option<Row> = conn
            .query_first(count_query)
            .await
            .map_err(|e| e.to_string())?;
        let count = count_row
            .and_then(|row| row.get::<Option<u64>, usize>(0))
            .flatten()
            .unwrap_or(0);
        return Ok(json!({ "count": count, "estimated": false }));
    }

    Ok(json!({ "count": estimated.unwrap_or(0), "estimated": true }))
}

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

        let is_identity = extra
            .as_ref()
            .map(|e| e.contains("auto_increment"))
            .unwrap_or(false);
        let is_computed = generation_expr
            .as_ref()
            .map(|e| !e.is_empty())
            .unwrap_or(false);

        let max_length = char_max_len
            .map(|v| if v == -1 { 0 } else { v })
            .unwrap_or(0) as u32;

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

    // 4. Foreign keys via KEY_COLUMN_USAGE + REFERENTIAL_CONSTRAINTS
    let fk_query = format!(
        "SELECT k.CONSTRAINT_NAME, k.COLUMN_NAME, k.REFERENCED_TABLE_SCHEMA, k.REFERENCED_TABLE_NAME, k.REFERENCED_COLUMN_NAME,
                rc.DELETE_RULE, rc.UPDATE_RULE
         FROM information_schema.KEY_COLUMN_USAGE k
         JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
           ON rc.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA
          AND rc.CONSTRAINT_NAME = k.CONSTRAINT_NAME
          AND rc.TABLE_NAME = k.TABLE_NAME
         WHERE k.TABLE_SCHEMA = '{db}' AND k.TABLE_NAME = '{table}'
           AND k.REFERENCED_TABLE_NAME IS NOT NULL
         ORDER BY k.CONSTRAINT_NAME, k.ORDINAL_POSITION"
    );
    let fk_rows: Vec<Row> = conn.query(&fk_query).await.map_err(|e| e.to_string())?;

    let mut fk_map: HashMap<String, (String, String, Vec<(String, String)>, String, String)> = HashMap::new();
    let mut fk_order: Vec<String> = Vec::new();

    for row in fk_rows {
        let constraint_name = opt_string(&row, 0);
        let column_name = opt_string(&row, 1);
        let ref_schema = opt_string(&row, 2);
        let ref_table = opt_string(&row, 3);
        let ref_column = opt_string(&row, 4);
        let delete_rule = opt_string(&row, 5).unwrap_or_default();
        let update_rule = opt_string(&row, 6).unwrap_or_default();

        let name = constraint_name.unwrap_or_default();
        if name.is_empty() {
            continue;
        }
        if !fk_map.contains_key(&name) {
            fk_order.push(name.clone());
            fk_map.insert(
                name.clone(),
                (
                    ref_schema.unwrap_or_default(),
                    ref_table.unwrap_or_default(),
                    Vec::new(),
                    delete_rule,
                    update_rule,
                ),
            );
        }
        if let (Some(col), Some(ref_col)) = (column_name, ref_column) {
            if let Some((_, _, cols, _, _)) = fk_map.get_mut(&name) {
                cols.push((col, ref_col));
            }
        }
    }

    let foreign_keys: Vec<Value> = fk_order
        .into_iter()
        .map(|name| {
            let (ref_schema, ref_table, cols, delete_rule, update_rule) =
                fk_map.remove(&name).unwrap_or_default();
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
                .collect::<Vec<Value>>(),
              "onDelete": delete_rule,
              "onUpdate": update_rule
            })
        })
        .collect();

    // 5. Referencing foreign keys from other tables
    let ref_fk_query = format!(
        "SELECT k.CONSTRAINT_NAME, k.TABLE_SCHEMA, k.TABLE_NAME, k.COLUMN_NAME, k.REFERENCED_COLUMN_NAME,
                rc.DELETE_RULE, rc.UPDATE_RULE
         FROM information_schema.KEY_COLUMN_USAGE k
         JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
           ON rc.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA
          AND rc.CONSTRAINT_NAME = k.CONSTRAINT_NAME
          AND rc.TABLE_NAME = k.TABLE_NAME
         WHERE k.REFERENCED_TABLE_SCHEMA = '{db}' AND k.REFERENCED_TABLE_NAME = '{table}'
           AND NOT (k.TABLE_SCHEMA = '{db}' AND k.TABLE_NAME = '{table}')
         ORDER BY k.CONSTRAINT_NAME, k.ORDINAL_POSITION"
    );
    let ref_fk_rows: Vec<Row> = conn.query(&ref_fk_query).await.map_err(|e| e.to_string())?;

    let mut ref_fk_map: HashMap<String, (String, String, Vec<(String, String)>, String, String)> = HashMap::new();
    let mut ref_fk_order: Vec<String> = Vec::new();

    for row in ref_fk_rows {
        let constraint_name = opt_string(&row, 0);
        let parent_schema = opt_string(&row, 1);
        let parent_table = opt_string(&row, 2);
        let parent_column = opt_string(&row, 3);
        let ref_column = opt_string(&row, 4);
        let delete_rule = opt_string(&row, 5).unwrap_or_default();
        let update_rule = opt_string(&row, 6).unwrap_or_default();

        let name = constraint_name.unwrap_or_default();
        if name.is_empty() {
            continue;
        }
        if !ref_fk_map.contains_key(&name) {
            ref_fk_order.push(name.clone());
            ref_fk_map.insert(
                name.clone(),
                (
                    parent_schema.unwrap_or_default(),
                    parent_table.unwrap_or_default(),
                    Vec::new(),
                    delete_rule,
                    update_rule,
                ),
            );
        }
        if let (Some(col), Some(ref_col)) = (parent_column, ref_column) {
            if let Some((_, _, cols, _, _)) = ref_fk_map.get_mut(&name) {
                cols.push((col, ref_col));
            }
        }
    }

    let referencing_foreign_keys: Vec<Value> = ref_fk_order
        .into_iter()
        .map(|name| {
            let (parent_schema, parent_table, cols, delete_rule, update_rule) =
                ref_fk_map.remove(&name).unwrap_or_default();
            json!({
              "name": name,
              "schema": parent_schema,
              "table": parent_table,
              "columns": cols
                .iter()
                .map(|(c, rc)| json!({
                  "column": c,
                  "referencedColumn": rc
                }))
                .collect::<Vec<Value>>(),
              "onDelete": delete_rule,
              "onUpdate": update_rule
            })
        })
        .collect();

    // 6. DDL statement via SHOW CREATE TABLE
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
      "referencingForeignKeys": referencing_foreign_keys,
      "primaryKey": primary_key,
      "uniqueKeys": unique_keys,
      "indexes": indexes,
    }))
}

/// Gets module definition - MySQL implementation.
pub async fn module_definition(
    conn: &mut Conn,
    database: Option<&str>,
    schema: &str,
    name: &str,
) -> Result<Value, String> {
    let fn_query = format!("SHOW CREATE FUNCTION `{schema}`.`{name}`");
    if let Ok(stmt_rows) = conn.query::<Row, _>(&fn_query).await {
        if let Some(row) = stmt_rows.first() {
            let stmt: String = row.get(2).unwrap_or_default();
            return Ok(json!({
              "database": database,
              "schema": schema,
              "name": name,
              "objectName": format!("`{schema}`.`{name}`"),
              "type": "function",
              "definition": stmt,
              "statement": stmt,
            }));
        }
    }

    let sp_query = format!("SHOW CREATE PROCEDURE `{schema}`.`{name}`");
    let stmt_rows: Vec<Row> = conn.query(&sp_query).await.map_err(|e| e.to_string())?;
    let stmt: String = stmt_rows
        .first()
        .and_then(|row| row.get(2))
        .unwrap_or_default();

    Ok(json!({
      "database": database,
      "schema": schema,
      "name": name,
      "objectName": format!("`{schema}`.`{name}`"),
      "type": "procedure",
      "definition": stmt,
      "statement": stmt,
    }))
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
