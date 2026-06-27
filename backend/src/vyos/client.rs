use anyhow::Result;
use reqwest::Client;
use serde_json::{json, Value};
use std::time::Duration;

/// Which version of VyOS the device is running, used to gate version-specific features.
#[derive(Clone, Debug, PartialEq)]
pub enum VyosVersion {
    V1_3,
    V1_4,
    V1_5,
    Unknown,
}

impl VyosVersion {
    pub fn parse(s: &str) -> Self {
        if s.starts_with("1.3") { Self::V1_3 }
        else if s.starts_with("1.4") { Self::V1_4 }
        else if s.starts_with("1.5") { Self::V1_5 }
        else { Self::Unknown }
    }

    /// /reboot and /poweroff added in 1.4
    pub fn has_reboot(&self) -> bool {
        !matches!(self, Self::V1_3)
    }

    /// `exists` op on /retrieve added in 1.4
    pub fn has_exists(&self) -> bool {
        !matches!(self, Self::V1_3)
    }

    /// /info GET endpoint (no auth) added in 1.5
    pub fn has_info(&self) -> bool {
        matches!(self, Self::V1_5)
    }

    /// `merge` op on /config-file added in 1.5
    pub fn has_merge(&self) -> bool {
        matches!(self, Self::V1_5)
    }

    /// `confirm_time` param on /configure for auto-rollback added in 1.5
    pub fn has_commit_confirm(&self) -> bool {
        matches!(self, Self::V1_5)
    }
}

/// HTTP client for the VyOS REST API.
///
/// All versions use multipart form-data: `key=<api_key>` + `data=<json_string>`.
/// Self-signed certificates are accepted (VyOS default).
pub struct VyosClient {
    base_url: String,
    api_key: String,
    client: Client,
    pub version: VyosVersion,
}

impl VyosClient {
    pub fn new(
        protocol: &str,
        host: &str,
        port: Option<i32>,
        api_key: &str,
        timeout_secs: i32,
        version: &str,
    ) -> Result<Self> {
        let base_url = match port {
            Some(p) => format!("{}://{}:{}", protocol, host, p),
            None    => format!("{}://{}", protocol, host),
        };

        let client = Client::builder()
            .timeout(Duration::from_secs(timeout_secs.max(1) as u64))
            .danger_accept_invalid_certs(true)
            .build()?;

        Ok(Self {
            base_url,
            api_key: api_key.to_string(),
            client,
            version: VyosVersion::parse(version),
        })
    }

    /// Core POST helper — wraps payload as multipart form data.
    pub async fn post(&self, endpoint: &str, payload: Value) -> Result<Value> {
        let form = reqwest::multipart::Form::new()
            .text("key",  self.api_key.clone())
            .text("data", payload.to_string());

        let resp = self.client
            .post(format!("{}{}", self.base_url, endpoint))
            .multipart(form)
            .send()
            .await?;

        Ok(resp.json::<Value>().await?)
    }

    // ── /retrieve ─────────────────────────────────────────────────────────────

    /// Returns config at `path` (empty = full config).
    pub async fn show_config(&self, path: &[&str]) -> Result<Value> {
        self.post("/retrieve", json!({ "op": "showConfig", "path": path })).await
    }

    /// Returns values of a multi-valued node.
    pub async fn return_values(&self, path: &[&str]) -> Result<Value> {
        self.post("/retrieve", json!({ "op": "returnValues", "path": path })).await
    }

    /// Check if a config path exists. 1.4+ only.
    pub async fn exists(&self, path: &[&str]) -> Result<Value> {
        self.post("/retrieve", json!({ "op": "exists", "path": path })).await
    }

    // ── /configure ────────────────────────────────────────────────────────────

    /// Apply one or more commands. `commands` is either a single object
    /// `{"op":"set","path":[...]}` or an array of them.
    pub async fn configure(&self, commands: Value) -> Result<Value> {
        self.post("/configure", commands).await
    }

    /// Convenience: single set.
    pub async fn set(&self, path: &[&str]) -> Result<Value> {
        self.configure(json!([{"op": "set", "path": path}])).await
    }

    /// Convenience: single delete.
    pub async fn delete(&self, path: &[&str]) -> Result<Value> {
        self.configure(json!([{"op": "delete", "path": path}])).await
    }

    // ── /config-file ──────────────────────────────────────────────────────────

    /// Save running config to `/config/config.boot` or an optional file path.
    pub async fn save(&self, file: Option<&str>) -> Result<Value> {
        let mut payload = json!({ "op": "save" });
        if let Some(f) = file { payload["file"] = json!(f); }
        self.post("/config-file", payload).await
    }

    /// Load config from file (replaces running config).
    pub async fn load(&self, file: &str) -> Result<Value> {
        self.post("/config-file", json!({ "op": "load", "file": file })).await
    }

    /// Merge config from file or inline string. 1.5+ only.
    pub async fn merge(&self, source: Value) -> Result<Value> {
        let mut payload = json!({ "op": "merge" });
        // source can be { "file": "..." } or { "string": "..." }
        if let Some(obj) = source.as_object() {
            for (k, v) in obj { payload[k] = v.clone(); }
        }
        self.post("/config-file", payload).await
    }

    // ── /show ─────────────────────────────────────────────────────────────────

    pub async fn show(&self, path: &[&str]) -> Result<Value> {
        self.post("/show", json!({ "op": "show", "path": path })).await
    }

    // ── /generate ─────────────────────────────────────────────────────────────

    pub async fn generate(&self, path: &[&str]) -> Result<Value> {
        self.post("/generate", json!({ "op": "generate", "path": path })).await
    }

    // ── /reset ────────────────────────────────────────────────────────────────

    pub async fn reset(&self, path: &[&str]) -> Result<Value> {
        self.post("/reset", json!({ "op": "reset", "path": path })).await
    }

    // ── /image ────────────────────────────────────────────────────────────────

    pub async fn image_add(&self, url: &str) -> Result<Value> {
        self.post("/image", json!({ "op": "add", "url": url })).await
    }

    pub async fn image_delete(&self, name: &str) -> Result<Value> {
        self.post("/image", json!({ "op": "delete", "name": name })).await
    }

    // ── /reboot (1.4+) ────────────────────────────────────────────────────────

    pub async fn reboot(&self) -> Result<Value> {
        self.post("/reboot", json!({ "op": "reboot", "path": ["now"] })).await
    }

    // ── /poweroff (1.4+) ──────────────────────────────────────────────────────

    pub async fn poweroff(&self) -> Result<Value> {
        self.post("/poweroff", json!({ "op": "poweroff", "path": ["now"] })).await
    }

    // ── /info (1.5+, GET, unauthenticated) ────────────────────────────────────

    pub async fn info(&self) -> Result<Value> {
        let resp = self.client
            .get(format!("{}/info", self.base_url))
            .send()
            .await?;
        Ok(resp.json::<Value>().await?)
    }
}
