mod error;
mod models;
mod routes;
mod state;
mod vyos;

use axum::Router;
use sqlx::postgres::PgPoolOptions;
use std::net::SocketAddr;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "vyos_fabric=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let pg_host     = std::env::var("POSTGRES_HOST").unwrap_or_else(|_| "localhost".into());
    let pg_port     = std::env::var("POSTGRES_PORT").unwrap_or_else(|_| "5432".into());
    let pg_db       = std::env::var("POSTGRES_DB").expect("POSTGRES_DB must be set");
    let pg_user     = std::env::var("POSTGRES_USER").expect("POSTGRES_USER must be set");
    let pg_password = std::env::var("POSTGRES_PASSWORD").expect("POSTGRES_PASSWORD must be set");

    let database_url = format!("postgres://{pg_user}:{pg_password}@{pg_host}:{pg_port}/{pg_db}");

    let pool = PgPoolOptions::new()
        .max_connections(20)
        .connect(&database_url)
        .await?;

    sqlx::migrate!("./migrations").run(&pool).await?;

    let state = state::AppState::new(pool.clone());

    // Background device polling every 30 seconds
    let poll_pool = pool;
    tokio::spawn(async move { vyos::poller::start(poll_pool, 30).await });

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .nest("/api", routes::router())
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let addr = SocketAddr::from(([127, 0, 0, 1], 3001));
    tracing::info!("listening on {addr}");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
