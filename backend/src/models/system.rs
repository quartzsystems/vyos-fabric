use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct SystemConfig {
    pub id: Uuid,
    pub hostname: String,
    pub domain_name: String,
    pub timezone: String,
    pub ntp_enabled: bool,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct NtpServer {
    pub id: Uuid,
    pub server: String,
    pub ref_id: Option<String>,
    pub pull: Option<i32>,
}

/// API response that embeds ntp_servers inside system config.
#[derive(Debug, Serialize)]
pub struct SystemConfigFull {
    pub id: Uuid,
    pub hostname: String,
    pub domain_name: String,
    pub timezone: String,
    pub ntp_enabled: bool,
    pub ntp_servers: Vec<NtpServer>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSystemConfig {
    pub hostname: Option<String>,
    pub domain_name: Option<String>,
    pub timezone: Option<String>,
    pub ntp_enabled: Option<bool>,
    pub ntp_servers: Option<Vec<NtpServerInput>>,
}

#[derive(Debug, Deserialize)]
pub struct NtpServerInput {
    pub server: String,
    pub ref_id: Option<String>,
    pub pull: Option<i32>,
}
