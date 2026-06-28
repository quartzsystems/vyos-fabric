pub mod auth;
pub mod config;
pub mod interfaces;
pub mod routers;
pub mod services;
pub mod sites;
pub mod users;

use axum::{middleware, routing::get, Router};
use crate::{auth::{require_admin, require_auth}, state::AppState};

pub fn router(state: AppState) -> Router<AppState> {
    // User management is admin-only (require_admin runs inside require_auth).
    let admin = Router::new()
        .nest("/users", users::router())
        .layer(middleware::from_fn(require_admin));

    // Everything here requires a valid session (cookie or Bearer).
    let protected = Router::new()
        .route("/auth/me", get(auth::me))
        .nest("/routers", routers::router().merge(config::router()).merge(interfaces::router()).merge(services::router()))
        .nest("/sites", sites::router())
        .merge(admin)
        .layer(middleware::from_fn_with_state(state, require_auth));

    Router::new()
        .nest("/auth", auth::router())
        .merge(protected)
}
