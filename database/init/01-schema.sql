CREATE TABLE IF NOT EXISTS app_users (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    email VARCHAR(254) NOT NULL,
    username VARCHAR(50) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    failed_login_attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    locked_until DATETIME NULL,
    token_version INT UNSIGNED NOT NULL DEFAULT 0,
    last_login_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_app_users_email (email),
    UNIQUE KEY uq_app_users_username (username),
    KEY idx_app_users_active (is_active)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS login_audit (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NULL,
    attempted_email VARCHAR(254) NOT NULL,
    success BOOLEAN NOT NULL,
    reason VARCHAR(64) NOT NULL,
    ip_address VARCHAR(45) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    KEY idx_login_audit_user_time (user_id, created_at),
    KEY idx_login_audit_email_time (attempted_email, created_at),

    CONSTRAINT fk_login_audit_user
      FOREIGN KEY (user_id)
      REFERENCES app_users(id)
      ON DELETE SET NULL
      ON UPDATE RESTRICT
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- A definer view exposes only public columns; consumers cannot access hashes.
-- Created by the bootstrap administrator, with no caller-controlled predicates.
CREATE SQL SECURITY DEFINER VIEW user_directory AS
  SELECT id, email, username FROM app_users;

-- Example data, not a login account. MariaDB accounts are created separately.
INSERT INTO app_users (email, username, password_hash)
VALUES ('student@example.invalid', 'student', 'not-an-application-login');
