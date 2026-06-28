use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

/// Live operational system info (version, hardware, uptime, load, memory, disk) read
/// from a device via `show` operational commands. All fields are best-effort: parsing
/// a command that failed or whose output didn't match leaves the field `None`/empty so
/// the UI degrades gracefully rather than erroring.
#[derive(Debug, Serialize)]
pub struct DeviceSystemInfo {
    /// e.g. "1.4.4" (the "VyOS " prefix is stripped).
    pub version: Option<String>,
    /// Release train / codename, e.g. "sagitta".
    pub release_train: Option<String>,
    /// Build timestamp as reported, e.g. "Thu 18 Dec 2025 12:01 UTC".
    pub built_on: Option<String>,
    pub hardware_vendor: Option<String>,
    pub hardware_model: Option<String>,
    /// Human uptime string, e.g. "1 day, 2 hours, 34 minutes, 5 seconds".
    pub uptime: Option<String>,
    pub load: LoadAverage,
    pub memory: MemoryInfo,
    pub storage: Vec<StorageMount>,
    /// Raw command outputs, populated only when the request asks for `?debug=1`. Used to
    /// verify the parsers against a live device's actual output.
    #[serde(skip_serializing_if = "BTreeMap::is_empty")]
    pub raw: BTreeMap<String, String>,
}

/// CPU load over 1/5/15 minutes, as percentages (matching `show system uptime`).
#[derive(Debug, Default, Serialize)]
pub struct LoadAverage {
    pub one: Option<f64>,
    pub five: Option<f64>,
    pub fifteen: Option<f64>,
}

/// Memory totals, normalized to bytes so the UI can format consistently.
#[derive(Debug, Default, Serialize)]
pub struct MemoryInfo {
    pub total_bytes: Option<u64>,
    pub used_bytes: Option<u64>,
    pub free_bytes: Option<u64>,
    pub used_pct: Option<f64>,
}

/// A mounted filesystem from `show system storage` (df-style), sizes in bytes.
#[derive(Debug, Serialize)]
pub struct StorageMount {
    pub filesystem: String,
    pub size_bytes: Option<u64>,
    pub used_bytes: Option<u64>,
    pub avail_bytes: Option<u64>,
    pub used_pct: Option<f64>,
    pub mount: Option<String>,
}

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
