use serde::{Deserialize, Serialize};

/// Live system config read directly from a device.
#[derive(Debug, Serialize)]
pub struct DeviceSystemConfig {
    pub hostname: Option<String>,
    pub domain_name: Option<String>,
    pub time_zone: Option<String>,
    pub ntp_enabled: bool,
    pub ntp_servers: Vec<NtpServerLive>,
    /// Device clock as reported by `show date` (operational, best-effort).
    pub current_time: Option<String>,
}

/// A configured NTP server, optionally annotated with operational state from `show ntp`.
#[derive(Debug, Serialize)]
pub struct NtpServerLive {
    pub server: String,
    pub ref_id: Option<String>,
    pub pull: Option<i32>,
}

/// Desired system config from the UI. All fields optional so callers can stage a subset.
#[derive(Debug, Deserialize)]
pub struct SystemConfigUpdate {
    pub hostname: Option<String>,
    pub domain_name: Option<String>,
    pub time_zone: Option<String>,
    pub ntp_enabled: Option<bool>,
    pub ntp_servers: Option<Vec<String>>,
}
