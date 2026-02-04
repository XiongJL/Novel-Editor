-- Drop tables if they exist to ensure schema matches code
DROP TABLE IF EXISTS `Idea`;

DROP TABLE IF EXISTS `Chapter`;

DROP TABLE IF EXISTS `Volume`;

DROP TABLE IF EXISTS `Novel`;

DROP TABLE IF EXISTS `User`;

-- User Table
CREATE TABLE `User` (
    `id` VARCHAR(64) NOT NULL,
    `username` VARCHAR(255) NULL,
    `password_hash` VARCHAR(255) NULL,
    `nickname` VARCHAR(255) NULL,
    `avatar_url` VARCHAR(500) NULL,
    `last_sync_at` DATETIME NULL,
    `version` INT DEFAULT 1,
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `deleted` BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- Novel Table
CREATE TABLE `Novel` (
    `id` VARCHAR(64) NOT NULL,
    `user_id` VARCHAR(64) NULL,
    `title` VARCHAR(255) NULL,
    `description` TEXT NULL,
    `cover_url` VARCHAR(500) NULL,
    `version` INT DEFAULT 1,
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `deleted` BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- Volume Table
CREATE TABLE `Volume` (
    `id` VARCHAR(64) NOT NULL,
    `novel_id` VARCHAR(64) NULL,
    `title` VARCHAR(255) NULL,
    `order_index` INT NULL,
    `version` INT DEFAULT 1,
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `deleted` BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- Chapter Table
CREATE TABLE `Chapter` (
    `id` VARCHAR(64) NOT NULL,
    `volume_id` VARCHAR(64) NULL,
    `title` VARCHAR(255) NULL,
    `content` LONGTEXT NULL,
    `word_count` INT NULL,
    `order_index` INT NULL,
    `version` INT DEFAULT 1,
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `deleted` BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- Idea Table
CREATE TABLE `Idea` (
    `id` VARCHAR(64) NOT NULL,
    `novel_id` VARCHAR(64) NOT NULL,
    `chapter_id` VARCHAR(64) NULL,
    `content` TEXT NOT NULL,
    `quote` TEXT NULL,
    `cursor` TEXT NULL,
    `is_starred` BOOLEAN DEFAULT FALSE,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    CONSTRAINT `fk_idea_novel` FOREIGN KEY (`novel_id`) REFERENCES `Novel` (`id`) ON DELETE CASCADE
    -- Note: We might skip foreign key for chapter to allow global ideas or handle deleting cleaner manually via app logic if preferred, but CASCADE is safe usually if handled.
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;