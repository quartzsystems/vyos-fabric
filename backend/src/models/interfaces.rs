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

/// A bonding (link-aggregation) interface (`bondN`).
#[derive(Debug, Serialize)]
pub struct BondingInterface {
    pub name: String,
    pub description: Option<String>,
    pub addresses: Vec<String>,
    pub mtu: Option<i32>,
    pub mode: Option<String>,
    pub members: Vec<String>,
    pub enabled: bool,
}

/// A bridge interface (`brN`).
#[derive(Debug, Serialize)]
pub struct BridgeInterface {
    pub name: String,
    pub description: Option<String>,
    pub addresses: Vec<String>,
    pub mtu: Option<i32>,
    pub members: Vec<String>,
    pub enabled: bool,
}

/// A dummy interface (`dumN`) — a simple always-up virtual interface.
#[derive(Debug, Serialize)]
pub struct DummyInterface {
    pub name: String,
    pub description: Option<String>,
    pub addresses: Vec<String>,
    pub mtu: Option<i32>,
    pub enabled: bool,
}

/// A GENEVE tunnel interface (`genN`).
#[derive(Debug, Serialize)]
pub struct GeneveInterface {
    pub name: String,
    pub description: Option<String>,
    pub addresses: Vec<String>,
    pub mtu: Option<i32>,
    pub vni: Option<String>,
    pub remote: Option<String>,
    pub enabled: bool,
}

/// An L2TPv3 tunnel interface (`l2tpethN`).
#[derive(Debug, Serialize)]
pub struct L2tpv3Interface {
    pub name: String,
    pub description: Option<String>,
    pub addresses: Vec<String>,
    pub mtu: Option<i32>,
    pub source_address: Option<String>,
    pub remote: Option<String>,
    pub tunnel_id: Option<String>,
    pub peer_tunnel_id: Option<String>,
    pub session_id: Option<String>,
    pub peer_session_id: Option<String>,
    pub encapsulation: Option<String>,
    pub enabled: bool,
}

/// A loopback interface (`lo`, `loN`).
#[derive(Debug, Serialize)]
pub struct LoopbackInterface {
    pub name: String,
    pub description: Option<String>,
    pub addresses: Vec<String>,
    pub mtu: Option<i32>,
    pub enabled: bool,
}

/// A MACsec interface (`macsecN`) — encrypted L2 over a parent interface.
#[derive(Debug, Serialize)]
pub struct MacsecInterface {
    pub name: String,
    pub description: Option<String>,
    pub addresses: Vec<String>,
    pub mtu: Option<i32>,
    pub source_interface: Option<String>,
    pub cipher: Option<String>,
    pub enabled: bool,
}

/// An OpenVPN tunnel interface (`vtunN`).
#[derive(Debug, Serialize)]
pub struct OpenvpnInterface {
    pub name: String,
    pub description: Option<String>,
    pub addresses: Vec<String>,
    pub mtu: Option<i32>,
    pub mode: Option<String>,
    pub protocol: Option<String>,
    pub local_host: Option<String>,
    pub remote_host: Option<String>,
    pub enabled: bool,
}

/// A WireGuard tunnel interface (`wgN`).
#[derive(Debug, Serialize)]
pub struct WireguardInterface {
    pub name: String,
    pub description: Option<String>,
    pub addresses: Vec<String>,
    pub mtu: Option<i32>,
    pub port: Option<String>,
    pub peer_count: i32,
    pub enabled: bool,
}

/// A PPPoE client interface (`pppoeN`).
#[derive(Debug, Serialize)]
pub struct PppoeInterface {
    pub name: String,
    pub description: Option<String>,
    pub addresses: Vec<String>,
    pub mtu: Option<i32>,
    pub source_interface: Option<String>,
    pub username: Option<String>,
    pub enabled: bool,
}

/// A MACvLAN / pseudo-ethernet interface (`pethN`).
#[derive(Debug, Serialize)]
pub struct MacvlanInterface {
    pub name: String,
    pub description: Option<String>,
    pub addresses: Vec<String>,
    pub mtu: Option<i32>,
    pub source_interface: Option<String>,
    pub mode: Option<String>,
    pub enabled: bool,
}

/// An SSTP client interface (`sstpcN`).
#[derive(Debug, Serialize)]
pub struct SstpcInterface {
    pub name: String,
    pub description: Option<String>,
    pub addresses: Vec<String>,
    pub mtu: Option<i32>,
    pub server: Option<String>,
    pub username: Option<String>,
    pub enabled: bool,
}

/// A generic tunnel interface (`tunN`) — GRE, IPIP, SIT, etc.
#[derive(Debug, Serialize)]
pub struct TunnelInterface {
    pub name: String,
    pub description: Option<String>,
    pub addresses: Vec<String>,
    pub mtu: Option<i32>,
    pub encapsulation: Option<String>,
    pub source_address: Option<String>,
    pub remote: Option<String>,
    pub enabled: bool,
}

/// A virtual-ethernet (veth) interface (`vethN`).
#[derive(Debug, Serialize)]
pub struct VethInterface {
    pub name: String,
    pub description: Option<String>,
    pub addresses: Vec<String>,
    pub mtu: Option<i32>,
    pub peer_name: Option<String>,
    pub enabled: bool,
}

/// A virtual tunnel interface (`vtiN`) — used with IPsec.
#[derive(Debug, Serialize)]
pub struct VtiInterface {
    pub name: String,
    pub description: Option<String>,
    pub addresses: Vec<String>,
    pub mtu: Option<i32>,
    pub enabled: bool,
}

/// A VXLAN tunnel interface (`vxlanN`).
#[derive(Debug, Serialize)]
pub struct VxlanInterface {
    pub name: String,
    pub description: Option<String>,
    pub addresses: Vec<String>,
    pub mtu: Option<i32>,
    pub vni: Option<String>,
    pub remote: Option<String>,
    pub source_address: Option<String>,
    pub port: Option<String>,
    pub enabled: bool,
}

/// A wireless (WLAN) interface (`wlanN`).
#[derive(Debug, Serialize)]
pub struct WlanInterface {
    pub name: String,
    pub description: Option<String>,
    pub addresses: Vec<String>,
    pub mtu: Option<i32>,
    pub interface_type: Option<String>,
    pub ssid: Option<String>,
    pub channel: Option<String>,
    pub enabled: bool,
}

/// A wireless WAN (cellular modem) interface (`wwanN`).
#[derive(Debug, Serialize)]
pub struct WwanInterface {
    pub name: String,
    pub description: Option<String>,
    pub addresses: Vec<String>,
    pub mtu: Option<i32>,
    pub apn: Option<String>,
    pub enabled: bool,
}
