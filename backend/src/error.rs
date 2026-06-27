use axum::{http::StatusCode, response::{IntoResponse, Response}, Json};
use serde_json::json;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("not found")]
    NotFound,
    #[error("invalid credentials")]
    Unauthorized,
    #[error("gateway error: {0}")]
    Gateway(String),
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("internal error: {0}")]
    Internal(#[from] anyhow::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match &self {
            AppError::NotFound     => (StatusCode::NOT_FOUND,            self.to_string()),
            AppError::Unauthorized => (StatusCode::UNAUTHORIZED,          self.to_string()),
            AppError::Gateway(_)   => (StatusCode::BAD_GATEWAY,           self.to_string()),
            AppError::Database(_)  => (StatusCode::INTERNAL_SERVER_ERROR, self.to_string()),
            AppError::Internal(_)  => (StatusCode::INTERNAL_SERVER_ERROR, self.to_string()),
        };
        (status, Json(json!({ "error": message }))).into_response()
    }
}

pub type Result<T> = std::result::Result<T, AppError>;
