use serde::Serialize;

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
    /// Match destination address/prefix.
    pub destination: Option<String>,
    /// Translation target — an address, `masquerade`, or a pool reference.
    pub translation: Option<String>,
    pub translation_port: Option<String>,
    pub protocol: Option<String>,
    pub log: bool,
    pub enabled: bool,
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
