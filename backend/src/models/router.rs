use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, sqlx::Type)]
#[sqlx(type_name = "text", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum RouterStatus {
    Ok,
    Warn,
    Crit,
    Off,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Router {
    pub id: Uuid,
    pub site_id: Uuid,
    pub hostname: String,
    pub description: Option<String>,
    pub role: String,
    pub mgmt_ip: String,
    pub status: RouterStatus,
    pub version: String,
    pub uptime_secs: i64,
    pub api_port: Option<i32>,
    pub api_protocol: String,
    // Secrets are never serialized to clients (write-only via update_router).
    #[serde(skip_serializing)]
    pub api_key: Option<String>,
    pub api_timeout: i32,
    pub ssh_username: Option<String>,
    #[serde(skip_serializing)]
    pub ssh_password: Option<String>,
    pub ssh_port: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateRouter {
    pub site_id: Uuid,
    pub hostname: String,
    pub role: String,
    pub description: Option<String>,
    pub mgmt_ip: String,
    pub version: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateRouter {
    pub hostname: Option<String>,
    pub description: Option<String>,
    pub mgmt_ip: Option<String>,
    pub version: Option<String>,
    pub api_port: Option<i32>,
    pub api_protocol: Option<String>,
    pub api_key: Option<String>,
    pub api_timeout: Option<i32>,
    pub ssh_username: Option<String>,
    pub ssh_password: Option<String>,
    pub ssh_port: Option<i32>,
}
