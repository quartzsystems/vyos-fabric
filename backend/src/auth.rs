//! Authentication: password hashing (argon2), JWT issue/verify, and the route guard.

use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use axum::{
    extract::{FromRequestParts, Request, State},
    http::{request::Parts, HeaderMap},
    middleware::Next,
    response::Response,
};
use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    error::{AppError, Result},
    state::AppState,
};

pub const COOKIE_NAME: &str = "vyos_token";

/// JWT payload. `sub` is the user id.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: Uuid,
    pub username: String,
    pub role: String,
    pub exp: usize,
    pub iat: usize,
}

impl Claims {
    /// Build claims for a freshly authenticated user (24 h lifetime).
    pub fn new(sub: Uuid, username: String, role: String) -> Self {
        let now = Utc::now();
        Self {
            sub,
            username,
            role,
            iat: now.timestamp() as usize,
            exp: (now + Duration::hours(24)).timestamp() as usize,
        }
    }

    pub fn is_admin(&self) -> bool {
        self.role == "admin"
    }
}

/// Extractor for the authenticated user. `Claims` are placed in request extensions by
/// [`require_auth`], so any handler behind that layer can take `AuthUser`.
pub struct AuthUser(pub Claims);

impl<S> FromRequestParts<S> for AuthUser
where
    S: Send + Sync,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self> {
        parts
            .extensions
            .get::<Claims>()
            .cloned()
            .map(AuthUser)
            .ok_or(AppError::Unauthorized)
    }
}

// ── Password hashing ──────────────────────────────────────────────────────────

pub fn hash_password(password: &str) -> anyhow::Result<String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| anyhow::anyhow!("password hash failed: {e}"))
}

pub enum Verify {
    /// Stored value is a valid argon2 hash and matches.
    Valid,
    /// Stored value is legacy plaintext and matches — caller should re-hash.
    LegacyPlaintext,
    Invalid,
}

pub fn verify_password(stored: &str, candidate: &str) -> Verify {
    match PasswordHash::new(stored) {
        Ok(parsed) => {
            if Argon2::default()
                .verify_password(candidate.as_bytes(), &parsed)
                .is_ok()
            {
                Verify::Valid
            } else {
                Verify::Invalid
            }
        }
        // Not a PHC string → treat as legacy plaintext.
        Err(_) if stored == candidate => Verify::LegacyPlaintext,
        Err(_) => Verify::Invalid,
    }
}

// ── JWT ───────────────────────────────────────────────────────────────────────

pub fn encode_token(claims: &Claims, secret: &str) -> anyhow::Result<String> {
    encode(
        &Header::default(),
        claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|e| anyhow::anyhow!("token encode failed: {e}"))
}

pub fn decode_token(token: &str, secret: &str) -> anyhow::Result<Claims> {
    decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )
    .map(|data| data.claims)
    .map_err(|e| anyhow::anyhow!("token decode failed: {e}"))
}

// ── Cookies ───────────────────────────────────────────────────────────────────

/// `Set-Cookie` value carrying the session JWT (httpOnly so JS can't read it).
pub fn session_cookie(token: &str) -> String {
    let secure = std::env::var("COOKIE_SECURE").map(|v| v == "true").unwrap_or(false);
    let mut c = format!("{COOKIE_NAME}={token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400");
    if secure {
        c.push_str("; Secure");
    }
    c
}

/// `Set-Cookie` value that expires the session cookie immediately.
pub fn clear_cookie() -> String {
    format!("{COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0")
}

/// Pull the JWT from the `vyos_token` cookie, falling back to `Authorization: Bearer`
/// (handy for curl/tests).
fn extract_token(headers: &HeaderMap) -> Option<String> {
    if let Some(cookie) = headers.get(axum::http::header::COOKIE).and_then(|v| v.to_str().ok()) {
        for part in cookie.split(';') {
            if let Some(val) = part.trim().strip_prefix(&format!("{COOKIE_NAME}=")) {
                if !val.is_empty() {
                    return Some(val.to_string());
                }
            }
        }
    }
    headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer "))
        .map(str::to_string)
}

// ── Authorization helpers ───────────────────────────────────────────────────────

/// Site ids the user has been granted access to.
pub async fn accessible_site_ids(db: &PgPool, user_id: Uuid) -> Result<Vec<Uuid>> {
    let rows: Vec<(Uuid,)> =
        sqlx::query_as("SELECT site_id FROM user_site_access WHERE user_id = $1")
            .bind(user_id)
            .fetch_all(db)
            .await?;
    Ok(rows.into_iter().map(|(s,)| s).collect())
}

/// Ok if the user may act on the given router. Admins bypass; otherwise the router's site
/// must be in the user's granted sites. Returns Forbidden for both "no access" and
/// "no such router" (to avoid leaking existence to non-admins).
pub async fn authorize_router(db: &PgPool, claims: &Claims, router_id: Uuid) -> Result<()> {
    if claims.is_admin() {
        return Ok(());
    }
    let row: Option<(Uuid,)> = sqlx::query_as(
        "SELECT r.id FROM routers r
         JOIN user_site_access usa ON usa.site_id = r.site_id
         WHERE r.id = $1 AND usa.user_id = $2",
    )
    .bind(router_id)
    .bind(claims.sub)
    .fetch_optional(db)
    .await?;
    row.map(|_| ()).ok_or(AppError::Forbidden)
}

// ── Middleware ────────────────────────────────────────────────────────────────

/// Requires a valid session (cookie or Bearer). Inserts `Claims` into the request
/// extensions so downstream handlers / the `AuthUser` extractor can read the user.
pub async fn require_auth(
    State(state): State<AppState>,
    mut req: Request,
    next: Next,
) -> Result<Response> {
    let token = extract_token(req.headers()).ok_or(AppError::Unauthorized)?;
    let claims = decode_token(&token, &state.jwt_secret).map_err(|_| AppError::Unauthorized)?;
    req.extensions_mut().insert(claims);
    Ok(next.run(req).await)
}

/// Requires the authenticated user to be an admin. Must run *after* [`require_auth`].
pub async fn require_admin(req: Request, next: Next) -> Result<Response> {
    let is_admin = req
        .extensions()
        .get::<Claims>()
        .map(Claims::is_admin)
        .unwrap_or(false);
    if !is_admin {
        return Err(AppError::Forbidden);
    }
    Ok(next.run(req).await)
}
