use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnInfo {
  pub name: String,
  #[serde(rename = "typeName")]
  pub type_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryResult {
  pub columns: Vec<ColumnInfo>,
  pub rows: Vec<serde_json::Value>,
  #[serde(rename = "rowsAffected")]
  pub rows_affected: u64,
  #[serde(rename = "executionTimeMs")]
  pub execution_time_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableSummary {
  pub schema: String,
  pub name: String,
  #[serde(rename = "rowCount")]
  pub row_count: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseSummary {
  pub name: String,
}
