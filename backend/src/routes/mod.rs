pub mod auth;
pub mod routers;
pub mod sites;
pub mod system;
pub mod users;

use axum::Router;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .nest("/auth",    auth::router())
        .nest("/routers", routers::router())
        .nest("/sites",   sites::router())
        .nest("/system",  system::router())
        .nest("/users",   users::router())
}
