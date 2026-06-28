use serde::{Deserialize, Serialize};

/// Live `firewall global-options` config read directly from a device.
///
/// Each toggle/select holds the raw VyOS value (e.g. `"enable"`, `"disable"`,
/// `"strict"`) or `None` when the option is absent from config (device default).
#[derive(Debug, Serialize)]
pub struct GlobalOptionsConfig {
    pub all_ping: Option<String>,
    pub broadcast_ping: Option<String>,
    pub directed_broadcast: Option<String>,
    pub ip_src_route: Option<String>,
    pub ipv6_src_route: Option<String>,
    pub ipv6_receive_redirects: Option<String>,
    pub receive_redirects: Option<String>,
    pub send_redirects: Option<String>,
    pub log_martians: Option<String>,
    pub syn_cookies: Option<String>,
    pub twa_hazards_protection: Option<String>,
    pub apply_to_bridge: Option<String>,
    /// `strict | loose | disable`.
    pub source_validation: Option<String>,
    /// `strict | loose | disable`.
    pub ipv6_source_validation: Option<String>,
    /// Valueless flag — `true` when `resolver-cache` is present.
    pub resolver_cache: bool,
    pub resolver_interval: Option<String>,
    pub state_policy: StatePolicy,
}

/// Connection-tracking state policy (`firewall global-options state-policy`).
#[derive(Debug, Default, Serialize)]
pub struct StatePolicy {
    pub established: StatePolicyEntry,
    pub related: StatePolicyEntry,
    pub invalid: StatePolicyEntry,
}

/// A single state-policy entry: an action plus optional logging.
#[derive(Debug, Default, Serialize)]
pub struct StatePolicyEntry {
    /// `accept | reject | drop`, or `None` when the state has no policy.
    pub action: Option<String>,
    pub log: bool,
    /// Syslog level for matched packets (`log-options level`), if set.
    pub log_level: Option<String>,
}

/// Desired `firewall global-options` config from the UI.
///
/// The UI always submits the full desired picture, so an absent/`null` value
/// means "this option should not be set" — the diff emits a `delete` when the
/// device currently has it.
#[derive(Debug, Deserialize)]
pub struct GlobalOptionsUpdate {
    pub all_ping: Option<String>,
    pub broadcast_ping: Option<String>,
    pub directed_broadcast: Option<String>,
    pub ip_src_route: Option<String>,
    pub ipv6_src_route: Option<String>,
    pub ipv6_receive_redirects: Option<String>,
    pub receive_redirects: Option<String>,
    pub send_redirects: Option<String>,
    pub log_martians: Option<String>,
    pub syn_cookies: Option<String>,
    pub twa_hazards_protection: Option<String>,
    pub apply_to_bridge: Option<String>,
    pub source_validation: Option<String>,
    pub ipv6_source_validation: Option<String>,
    #[serde(default)]
    pub resolver_cache: bool,
    pub resolver_interval: Option<String>,
    #[serde(default)]
    pub state_policy: StatePolicyUpdate,
}

#[derive(Debug, Default, Deserialize)]
pub struct StatePolicyUpdate {
    #[serde(default)]
    pub established: StatePolicyEntryUpdate,
    #[serde(default)]
    pub related: StatePolicyEntryUpdate,
    #[serde(default)]
    pub invalid: StatePolicyEntryUpdate,
}

#[derive(Debug, Default, Deserialize)]
pub struct StatePolicyEntryUpdate {
    pub action: Option<String>,
    #[serde(default)]
    pub log: bool,
    pub log_level: Option<String>,
}
