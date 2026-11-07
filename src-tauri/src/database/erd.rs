use crate::database::mssql::MssqlClient;
use crate::database::mysql::MySqlConn;
use mysql_async::prelude::Queryable;
use mysql_async::Row;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ErdColumn {
  pub name: String,
  pub data_type: String,
  pub is_primary_key: bool,
  pub is_foreign_key: bool,
  pub is_unique: bool,
  pub is_nullable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ErdTable {
  pub schema: String,
  pub name: String,
  pub columns: Vec<ErdColumn>,
  pub is_junction: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ErdRelation {
  pub name: String,
  pub source_schema: String,
  pub source_table: String,
  pub source_column: String,
  pub target_schema: String,
  pub target_table: String,
  pub target_column: String,
  pub cardinality: String,
  pub is_nullable: bool,
}

fn table_key(schema: &str, name: &str) -> String {
  format!("{}.{}", schema.to_lowercase(), name.to_lowercase())
}

fn opt_string(row: &Row, index: usize) -> Option<String> {
  row.get::<Option<String>, _>(index).unwrap_or(None)
}

struct RawRelation {
  name: String,
  source_schema: String,
  source_table: String,
  source_column: String,
  target_schema: String,
  target_table: String,
  target_column: String,
  is_nullable: bool,
}

struct RawColumn {
  schema: String,
  table: String,
  name: String,
  data_type: String,
  is_primary_key: bool,
  is_unique: bool,
  is_nullable: bool,
}

fn build_erd_result(
  raw_columns: Vec<RawColumn>,
  raw_relations: Vec<RawRelation>,
  target_tables: Option<&[String]>,
  include_related: bool,
  depth: usize,
) -> Value {
  let mut table_order: Vec<(String, String)> = Vec::new();
  let mut table_columns: HashMap<String, Vec<ErdColumn>> = HashMap::new();
  let mut column_key_unique: HashMap<(String, String), bool> = HashMap::new();

  for col in raw_columns {
    let key = table_key(&col.schema, &col.table);
    if !table_columns.contains_key(&key) {
      table_order.push((col.schema.clone(), col.table.clone()));
      table_columns.insert(key.clone(), Vec::new());
    }
    column_key_unique.insert(
      (key.clone(), col.name.to_lowercase()),
      col.is_primary_key || col.is_unique,
    );
    if let Some(list) = table_columns.get_mut(&key) {
      list.push(ErdColumn {
        name: col.name,
        data_type: col.data_type,
        is_primary_key: col.is_primary_key,
        is_foreign_key: false,
        is_unique: col.is_unique,
        is_nullable: col.is_nullable,
      });
    }
  }

  let mut fk_sources: HashSet<(String, String)> = HashSet::new();
  let mut resolved_relations: Vec<ErdRelation> = Vec::new();

  for rel in &raw_relations {
    let s_key = table_key(&rel.source_schema, &rel.source_table);
    fk_sources.insert((s_key.clone(), rel.source_column.to_lowercase()));

    let is_unique_source = column_key_unique
      .get(&(s_key, rel.source_column.to_lowercase()))
      .copied()
      .unwrap_or(false);

    let cardinality = if is_unique_source {
      "one-to-one".to_string()
    } else {
      "one-to-many".to_string()
    };

    resolved_relations.push(ErdRelation {
      name: rel.name.clone(),
      source_schema: rel.source_schema.clone(),
      source_table: rel.source_table.clone(),
      source_column: rel.source_column.clone(),
      target_schema: rel.target_schema.clone(),
      target_table: rel.target_table.clone(),
      target_column: rel.target_column.clone(),
      cardinality,
      is_nullable: rel.is_nullable,
    });
  }

  for (key, cols) in table_columns.iter_mut() {
    for col in cols {
      if fk_sources.contains(&(key.clone(), col.name.to_lowercase())) {
        col.is_foreign_key = true;
      }
    }
  }

  let mut selected_keys: HashSet<String> = HashSet::new();
  if let Some(targets) = target_tables {
    if !targets.is_empty() {
      for t in targets {
        let t_lower = t.to_lowercase();
        let mut matched = false;
        for (schema, name) in &table_order {
          let full_key = table_key(schema, name);
          if full_key == t_lower || name.to_lowercase() == t_lower {
            selected_keys.insert(full_key);
            matched = true;
          }
        }
        if !matched && !t_lower.is_empty() {
          selected_keys.insert(t_lower);
        }
      }

      if include_related {
        let effective_depth = depth.clamp(1, 4);
        for _ in 0..effective_depth {
          let current_keys = selected_keys.clone();
          for rel in &raw_relations {
            let s_key = table_key(&rel.source_schema, &rel.source_table);
            let t_key = table_key(&rel.target_schema, &rel.target_table);
            if current_keys.contains(&s_key) {
              selected_keys.insert(t_key);
            } else if current_keys.contains(&t_key) {
              selected_keys.insert(s_key);
            }
          }
        }
      }
    }
  }

  let filter_tables = !selected_keys.is_empty();

  let mut outgoing_targets: HashMap<String, HashSet<String>> = HashMap::new();
  for rel in &raw_relations {
    let s_key = table_key(&rel.source_schema, &rel.source_table);
    let t_key = table_key(&rel.target_schema, &rel.target_table);
    outgoing_targets.entry(s_key).or_default().insert(t_key);
  }

  let mut final_tables: Vec<ErdTable> = Vec::new();
  for (schema, name) in table_order {
    let key = table_key(&schema, &name);
    if filter_tables && !selected_keys.contains(&key) {
      continue;
    }
    let cols = table_columns.remove(&key).unwrap_or_default();
    let distinct_targets = outgoing_targets.get(&key).map(|s| s.len()).unwrap_or(0);
    let is_junction = distinct_targets >= 2 && cols.len() <= distinct_targets + 3;

    final_tables.push(ErdTable {
      schema,
      name,
      columns: cols,
      is_junction,
    });
  }

  let final_table_keys: HashSet<String> = final_tables
    .iter()
    .map(|t| table_key(&t.schema, &t.name))
    .collect();

  let final_relations: Vec<ErdRelation> = resolved_relations
    .into_iter()
    .filter(|rel| {
      let s_key = table_key(&rel.source_schema, &rel.source_table);
      let t_key = table_key(&rel.target_schema, &rel.target_table);
      final_table_keys.contains(&s_key) && final_table_keys.contains(&t_key)
    })
    .collect();

  json!({
    "ok": true,
    "tables": final_tables,
    "relations": final_relations
  })
}

// Targeted for SQL Server: queries sys.foreign_keys, sys.tables, sys.columns, and sys.indexes.
pub async fn mssql_erd(
  client: &mut MssqlClient,
  database: Option<&str>,
  target_tables: Option<&[String]>,
  include_related: bool,
  depth: usize,
) -> Result<Value, String> {
  if let Some(db) = database {
    if !db.is_empty() {
      let switch_query = format!("USE [{}]", db.replace(']', "]]"));
      let _ = client.simple_query(switch_query).await;
    }
  }

  let fk_query = "SELECT
      fk.name AS constraintName,
      OBJECT_SCHEMA_NAME(fk.parent_object_id) AS sourceSchema,
      OBJECT_NAME(fk.parent_object_id) AS sourceTable,
      COL_NAME(fkc.parent_object_id, fkc.parent_column_id) AS sourceColumn,
      OBJECT_SCHEMA_NAME(fk.referenced_object_id) AS targetSchema,
      OBJECT_NAME(fk.referenced_object_id) AS targetTable,
      COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id) AS targetColumn,
      pc.is_nullable AS isNullable
  FROM sys.foreign_keys fk
  JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
  JOIN sys.columns pc ON pc.object_id = fkc.parent_object_id AND pc.column_id = fkc.parent_column_id
  JOIN sys.tables rt ON rt.object_id = fkc.referenced_object_id
  JOIN sys.tables st ON st.object_id = fkc.parent_object_id
  WHERE st.is_ms_shipped = 0 AND rt.is_ms_shipped = 0
  ORDER BY fk.name, fkc.constraint_column_id";

  let mut raw_relations = Vec::new();
  if let Ok(stream) = client.simple_query(fk_query).await {
    if let Ok(rows) = stream.into_first_result().await {
      for row in rows {
        let name: &str = row.get(0).unwrap_or("");
        let source_schema: &str = row.get(1).unwrap_or("");
        let source_table: &str = row.get(2).unwrap_or("");
        let source_column: &str = row.get(3).unwrap_or("");
        let target_schema: &str = row.get(4).unwrap_or("");
        let target_table: &str = row.get(5).unwrap_or("");
        let target_column: &str = row.get(6).unwrap_or("");
        let is_nullable: bool = row.get(7).unwrap_or(false);

        if !source_table.is_empty() && !target_table.is_empty() {
          raw_relations.push(RawRelation {
            name: name.to_string(),
            source_schema: source_schema.to_string(),
            source_table: source_table.to_string(),
            source_column: source_column.to_string(),
            target_schema: target_schema.to_string(),
            target_table: target_table.to_string(),
            target_column: target_column.to_string(),
            is_nullable,
          });
        }
      }
    }
  }

  let col_query = "SELECT
      s.name AS tableSchema,
      t.name AS tableName,
      c.name AS columnName,
      ty.name AS dataType,
      c.is_nullable AS isNullable,
      CASE WHEN pk.column_id IS NOT NULL THEN 1 ELSE 0 END AS isPrimaryKey,
      CASE WHEN uq.column_id IS NOT NULL THEN 1 ELSE 0 END AS isUnique
  FROM sys.tables t
  JOIN sys.schemas s ON s.schema_id = t.schema_id
  JOIN sys.columns c ON c.object_id = t.object_id
  JOIN sys.types ty ON ty.user_type_id = c.user_type_id
  LEFT JOIN (
      SELECT ic.object_id, ic.column_id
      FROM sys.indexes i
      JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
      WHERE i.is_primary_key = 1
  ) pk ON pk.object_id = c.object_id AND pk.column_id = c.column_id
  LEFT JOIN (
      SELECT ic.object_id, ic.column_id
      FROM sys.indexes i
      JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
      WHERE i.is_unique = 1 AND i.is_primary_key = 0
  ) uq ON uq.object_id = c.object_id AND uq.column_id = c.column_id
  WHERE t.is_ms_shipped = 0
  ORDER BY s.name, t.name, c.column_id";

  let mut raw_columns = Vec::new();
  if let Ok(stream) = client.simple_query(col_query).await {
    if let Ok(rows) = stream.into_first_result().await {
      for row in rows {
        let schema: &str = row.get(0).unwrap_or("");
        let table: &str = row.get(1).unwrap_or("");
        let name: &str = row.get(2).unwrap_or("");
        let data_type: &str = row.get(3).unwrap_or("");
        let is_nullable: bool = row.get(4).unwrap_or(false);
        let is_pk: i32 = row.get(5).unwrap_or(0);
        let is_uq: i32 = row.get(6).unwrap_or(0);

        if !table.is_empty() && !name.is_empty() {
          raw_columns.push(RawColumn {
            schema: schema.to_string(),
            table: table.to_string(),
            name: name.to_string(),
            data_type: data_type.to_string(),
            is_primary_key: is_pk == 1,
            is_unique: is_uq == 1,
            is_nullable,
          });
        }
      }
    }
  }

  Ok(build_erd_result(
    raw_columns,
    raw_relations,
    target_tables,
    include_related,
    depth,
  ))
}

// Targeted for MySQL: queries information_schema.KEY_COLUMN_USAGE and information_schema.COLUMNS.
pub async fn mysql_erd(
  conn: &mut MySqlConn,
  database: Option<&str>,
  target_tables: Option<&[String]>,
  include_related: bool,
  depth: usize,
) -> Result<Value, String> {
  let db = database.unwrap_or("");
  if db.is_empty() {
    return Ok(json!({ "ok": true, "tables": [], "relations": [] }));
  }

  let fk_query = format!(
    "SELECT
        k.CONSTRAINT_NAME,
        k.TABLE_SCHEMA,
        k.TABLE_NAME,
        k.COLUMN_NAME,
        k.REFERENCED_TABLE_SCHEMA,
        k.REFERENCED_TABLE_NAME,
        k.REFERENCED_COLUMN_NAME,
        CASE WHEN c.IS_NULLABLE = 'YES' THEN 1 ELSE 0 END AS is_nullable
    FROM information_schema.KEY_COLUMN_USAGE k
    LEFT JOIN information_schema.COLUMNS c
      ON c.TABLE_SCHEMA = k.TABLE_SCHEMA
     AND c.TABLE_NAME = k.TABLE_NAME
     AND c.COLUMN_NAME = k.COLUMN_NAME
    WHERE k.TABLE_SCHEMA = '{db}'
      AND k.REFERENCED_TABLE_NAME IS NOT NULL
    ORDER BY k.CONSTRAINT_NAME, k.ORDINAL_POSITION"
  );

  let fk_rows: Vec<Row> = conn.query(fk_query).await.map_err(|e| e.to_string())?;
  let mut raw_relations = Vec::new();
  for row in fk_rows {
    let name = opt_string(&row, 0).unwrap_or_default();
    let source_schema = opt_string(&row, 1).unwrap_or_default();
    let source_table = opt_string(&row, 2).unwrap_or_default();
    let source_column = opt_string(&row, 3).unwrap_or_default();
    let target_schema = opt_string(&row, 4).unwrap_or_default();
    let target_table = opt_string(&row, 5).unwrap_or_default();
    let target_column = opt_string(&row, 6).unwrap_or_default();
    let is_nullable: i32 = row.get(7).unwrap_or(0);

    if !source_table.is_empty() && !target_table.is_empty() {
      raw_relations.push(RawRelation {
        name,
        source_schema,
        source_table,
        source_column,
        target_schema,
        target_table,
        target_column,
        is_nullable: is_nullable == 1,
      });
    }
  }

  let col_query = format!(
    "SELECT
        c.TABLE_SCHEMA,
        c.TABLE_NAME,
        c.COLUMN_NAME,
        c.DATA_TYPE,
        CASE WHEN c.IS_NULLABLE = 'YES' THEN 1 ELSE 0 END AS is_nullable,
        CASE WHEN c.COLUMN_KEY = 'PRI' THEN 1 ELSE 0 END AS is_primary_key,
        CASE WHEN c.COLUMN_KEY = 'UNI' THEN 1 ELSE 0 END AS is_unique
    FROM information_schema.COLUMNS c
    WHERE c.TABLE_SCHEMA = '{db}'
    ORDER BY c.TABLE_SCHEMA, c.TABLE_NAME, c.ORDINAL_POSITION"
  );

  let col_rows: Vec<Row> = conn.query(col_query).await.map_err(|e| e.to_string())?;
  let mut raw_columns = Vec::new();
  for row in col_rows {
    let schema = opt_string(&row, 0).unwrap_or_default();
    let table = opt_string(&row, 1).unwrap_or_default();
    let name = opt_string(&row, 2).unwrap_or_default();
    let data_type = opt_string(&row, 3).unwrap_or_default();
    let is_nullable: i32 = row.get(4).unwrap_or(0);
    let is_pk: i32 = row.get(5).unwrap_or(0);
    let is_uq: i32 = row.get(6).unwrap_or(0);

    if !table.is_empty() && !name.is_empty() {
      raw_columns.push(RawColumn {
        schema,
        table,
        name,
        data_type,
        is_primary_key: is_pk == 1,
        is_unique: is_uq == 1,
        is_nullable: is_nullable == 1,
      });
    }
  }

  Ok(build_erd_result(
    raw_columns,
    raw_relations,
    target_tables,
    include_related,
    depth,
  ))
}
