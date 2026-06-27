use sqlx::PgPool;
use std::time::Duration;
use uuid::Uuid;

use crate::vyos::client::VyosClient;

#[derive(Debug, sqlx::FromRow)]
struct DevicePollRow {
    id:           Uuid,
    mgmt_ip:      String,
    api_port:     Option<i32>,
    api_protocol: String,
    api_key:      Option<String>,
    api_timeout:  i32,
    version:      String,
}

/// Starts the background polling loop. Runs forever; call via `tokio::spawn`.
pub async fn start(db: PgPool, interval_secs: u64) {
    let mut ticker = tokio::time::interval(Duration::from_secs(interval_secs));
    ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    loop {
        ticker.tick().await;
        poll_all(&db).await;
    }
}

async fn poll_all(db: &PgPool) {
    let devices = match sqlx::query_as::<_, DevicePollRow>(
        "SELECT id, mgmt_ip, api_port, api_protocol, api_key, api_timeout, version
         FROM routers
         WHERE api_key IS NOT NULL AND api_key <> ''",
    )
    .fetch_all(db)
    .await
    {
        Ok(d) => d,
        Err(e) => { tracing::error!("poller db fetch: {e}"); return; }
    };

    let mut handles = Vec::with_capacity(devices.len());
    for device in devices {
        let db = db.clone();
        handles.push(tokio::spawn(async move {
            let status = check_device(&device).await;
            if let Err(e) = sqlx::query(
                "UPDATE routers SET status = $1, updated_at = NOW() WHERE id = $2",
            )
            .bind(&status)
            .bind(device.id)
            .execute(&db)
            .await
            {
                tracing::warn!("poller status update {}: {e}", device.id);
            }
        }));
    }

    for h in handles {
        let _ = h.await;
    }
}

/// Returns "ok" / "warn" / "off" based on a lightweight API probe.
async fn check_device(device: &DevicePollRow) -> String {
    let key = match device.api_key.as_deref().filter(|k| !k.is_empty()) {
        Some(k) => k,
        None => return "off".to_string(),
    };

    let client = match VyosClient::new(
        &device.api_protocol,
        &device.mgmt_ip,
        device.api_port,
        key,
        device.api_timeout,
        &device.version,
    ) {
        Ok(c) => c,
        Err(e) => { tracing::warn!("poller build client {}: {e}", device.id); return "off".to_string(); }
    };

    // Minimal probe: retrieve hostname — works on all versions
    match client.show_config(&["system", "host-name"]).await {
        Ok(resp) => {
            if resp["success"].as_bool() == Some(true) {
                "ok".to_string()
            } else {
                // Reachable but API returned an error (bad key, etc.)
                tracing::debug!(
                    "poller warn {}: {:?}",
                    device.id,
                    resp["error"]
                );
                "warn".to_string()
            }
        }
        Err(e) => {
            tracing::debug!("poller off {}: {e}", device.id);
            "off".to_string()
        }
    }
}
