use serde::Serialize;

/// A physical/ethernet interface read live from the device config.
#[derive(Debug, Serialize)]
pub struct EthernetInterface {
    pub name: String,
    pub description: Option<String>,
    pub addresses: Vec<String>,
    pub mtu: Option<i32>,
    pub hw_id: Option<String>,
    pub speed: Option<String>,
    pub duplex: Option<String>,
    pub enabled: bool,
    pub vlan_count: i32,
}

/// A VLAN sub-interface (`ethN vif <id>`), rendered as `ethN.<id>`.
#[derive(Debug, Serialize)]
pub struct VlanInterface {
    pub name: String,
    pub parent: String,
    pub vlan_id: i32,
    pub description: Option<String>,
    pub addresses: Vec<String>,
    pub mtu: Option<i32>,
    pub enabled: bool,
}
