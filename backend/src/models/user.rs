use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct User {
    pub id: Uuid,
    pub first_name: String,
    pub last_name: String,
    pub email: Option<String>,
    pub username: String,
    #[allow(dead_code)]
    pub password_hash: String,
    pub role: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, sqlx::FromRow)]
pub struct SiteAccessRow {
    pub user_id: Uuid,
    pub site_id: Uuid,
    pub site_name: String,
    pub role: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SiteAccessEntry {
    pub site_id: Uuid,
    pub site_name: String,
    pub role: String,
}

#[derive(Debug, Serialize)]
pub struct UserWithAccess {
    pub id: Uuid,
    pub first_name: String,
    pub last_name: String,
    pub email: Option<String>,
    pub username: String,
    pub role: String,
    pub created_at: DateTime<Utc>,
    pub site_access: Vec<SiteAccessEntry>,
}

impl UserWithAccess {
    pub fn from_user(user: User, site_access: Vec<SiteAccessEntry>) -> Self {
        Self {
            id: user.id,
            first_name: user.first_name,
            last_name: user.last_name,
            email: user.email,
            username: user.username,
            role: user.role,
            created_at: user.created_at,
            site_access,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct CreateUser {
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub email: Option<String>,
    pub username: String,
    pub password: String,
    pub role: Option<String>,
}

/// All fields optional — omit to leave unchanged.
/// Send `email: ""` to clear it.
/// Send `password: ""` or omit to keep existing password.
#[derive(Debug, Deserialize)]
pub struct UpdateUser {
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub email: Option<String>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub role: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct GrantAccess {
    pub site_id: Uuid,
    pub role: String,
}
