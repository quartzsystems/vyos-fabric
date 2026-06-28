use serde::{Deserialize, Serialize};

/// A single NAT rule. Reused across NAT44 (source/destination), NAT64, and NAT66 —
/// fields not relevant to a given family are simply `None`.
#[derive(Debug, Serialize)]
pub struct NatRule {
    pub rule: String,
    pub description: Option<String>,
    /// Outbound (source) or inbound (destination) interface, if matched.
    pub interface: Option<String>,
    /// Match source address/prefix.
    pub source: Option<String>,
    /// Match source port.
    pub source_port: Option<String>,
    /// Match destination address/prefix.
    pub destination: Option<String>,
    /// Match destination port.
    pub destination_port: Option<String>,
    /// Translation target — an address, `masquerade`, or a pool reference.
    pub translation: Option<String>,
    pub translation_port: Option<String>,
    pub protocol: Option<String>,
    /// Exclude rule (`exclude` flag) — matched traffic skips NAT.
    pub exclude: bool,
    pub log: bool,
    pub enabled: bool,
}

/// Desired state for a single NAT44 rule from the UI. The section (`source`/
/// `destination`) selects which subtree the rule lives under and which interface
/// key (`outbound-interface`/`inbound-interface`) applies. Absent/empty values mean
/// "unset" — the diff stages a delete when the device currently has them.
#[derive(Debug, Deserialize)]
pub struct Nat44RuleUpdate {
    /// `source` or `destination`.
    pub section: String,
    pub rule: u32,
    pub description: Option<String>,
    pub interface: Option<String>,
    pub source_address: Option<String>,
    pub source_port: Option<String>,
    pub destination_address: Option<String>,
    pub destination_port: Option<String>,
    /// Translation address — an IP/range, or the literal `masquerade` (source only).
    pub translation_address: Option<String>,
    pub translation_port: Option<String>,
    pub protocol: Option<String>,
    #[serde(default)]
    pub exclude: bool,
    #[serde(default)]
    pub log: bool,
    #[serde(default)]
    pub enabled: bool,
    /// The rule's original number when editing — set when renumbering so the old
    /// rule is deleted and the new one rebuilt fresh.
    pub original_rule: Option<u32>,
}

/// Identifies a single NAT44 rule to delete.
#[derive(Debug, Deserialize)]
pub struct Nat44RuleDelete {
    /// `source` or `destination`.
    pub section: String,
    pub rule: u32,
}

/// IPv4 NAT (`nat`): source (SNAT/masquerade) + destination (DNAT/port-forward) rules.
#[derive(Debug, Serialize)]
pub struct Nat44Config {
    pub source: Vec<NatRule>,
    pub destination: Vec<NatRule>,
}

/// Stateful NAT64 (`nat64`): source rules translating IPv6 → IPv4.
#[derive(Debug, Serialize)]
pub struct Nat64Config {
    pub source: Vec<NatRule>,
}

/// IPv6-to-IPv6 NAT / NPTv6 (`nat66`): source + destination rules.
#[derive(Debug, Serialize)]
pub struct Nat66Config {
    pub source: Vec<NatRule>,
    pub destination: Vec<NatRule>,
}

/// A CGNAT address pool (`nat cgnat pool external|internal <name>`).
#[derive(Debug, Serialize)]
pub struct CgnatPool {
    /// `external` or `internal`.
    pub kind: String,
    pub name: String,
    pub ranges: Vec<String>,
    pub external_port_range: Option<String>,
}

/// A CGNAT rule mapping an internal pool to an external pool.
#[derive(Debug, Serialize)]
pub struct CgnatRule {
    pub rule: String,
    pub description: Option<String>,
    pub source_pool: Option<String>,
    pub translation_pool: Option<String>,
    pub enabled: bool,
}

/// Carrier-grade NAT (`nat cgnat`): pools + rules.
#[derive(Debug, Serialize)]
pub struct CgnatConfig {
    pub pools: Vec<CgnatPool>,
    pub rules: Vec<CgnatRule>,
}
