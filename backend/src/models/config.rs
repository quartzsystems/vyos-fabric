use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::Value;
use uuid::Uuid;

/// A single staged config change (one VyOS `set`/`delete` command), diffed against the
/// device's live config and held until reviewed and committed.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct ConfigChange {
    pub id: Uuid,
    pub router_id: Uuid,
    pub op: String,            // "set" | "delete"
    pub path: Vec<String>,     // ["system", "host-name", "vyos-core-01"]
    pub summary: String,
    pub section: String,
    pub created_by: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub status: String,        // "pending" | "committed" | "failed"
    pub commit_id: Option<Uuid>,
}

/// One change to stage (from a typed staging endpoint such as system/stage).
#[derive(Debug, Clone)]
pub struct NewConfigChange {
    pub op: String,
    pub path: Vec<String>,
    pub summary: String,
    pub section: String,
    pub created_by: Option<Uuid>,
}

/// Result of committing all pending changes for a device.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct ConfigCommit {
    pub id: Uuid,
    pub router_id: Uuid,
    pub committed_by: Option<Uuid>,
    pub committed_at: DateTime<Utc>,
    pub status: String,        // "success" | "failed"
    pub change_count: i32,
    pub saved: bool,
    pub error: Option<String>,
    pub vyos_response: Option<Value>,
}

/// A commit plus the changes it applied (for the history view).
#[derive(Debug, Serialize)]
pub struct CommitWithChanges {
    #[serde(flatten)]
    pub commit: ConfigCommit,
    pub changes: Vec<ConfigChange>,
}
