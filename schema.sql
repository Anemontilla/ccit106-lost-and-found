-- Lost & Found MySQL schema (Node.js + Express, CCIT 106 lab)
-- Run as the admin user on your managed MySQL instance.

CREATE DATABASE IF NOT EXISTS lost_and_found
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE lost_and_found;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(150) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  id_number VARCHAR(20) UNIQUE,
  role ENUM('Management', 'Normal_User') NOT NULL DEFAULT 'Normal_User',
  is_staff TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS lost_items (
  item_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  date_lost DATE,
  location_lost VARCHAR(100),
  image VARCHAR(255),
  status ENUM('Open', 'Claimed', 'Resolved') NOT NULL DEFAULT 'Open',
  reported_by INT NULL,
  claimed_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reported_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (claimed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS found_items (
  item_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  date_found DATE,
  location_found VARCHAR(100),
  image VARCHAR(255),
  status ENUM('Open', 'Claimed', 'Resolved') NOT NULL DEFAULT 'Open',
  reported_by INT NULL,
  claimed_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reported_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (claimed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS claim_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  item_type ENUM('lost', 'found') NOT NULL,
  item_id INT NOT NULL,
  requester INT NOT NULL,
  reason TEXT NOT NULL,
  status ENUM('Pending', 'Approved', 'Declined') NOT NULL DEFAULT 'Pending',
  manager_note TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (requester) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Database-backed express-session store (requirement 1c)
CREATE TABLE IF NOT EXISTS sessions (
  session_id VARCHAR(128) NOT NULL PRIMARY KEY,
  expires INT UNSIGNED NOT NULL,
  data TEXT NULL
) ENGINE=InnoDB;

CREATE INDEX idx_lost_name ON lost_items(name);
CREATE INDEX idx_found_name ON found_items(name);
CREATE INDEX idx_claims_requester ON claim_requests(requester);

-- Non-root application user (run once; replace the password)
CREATE USER IF NOT EXISTS 'lab_app'@'%' IDENTIFIED BY '<CHANGE_ME>';
GRANT SELECT, INSERT, UPDATE, DELETE ON lost_and_found.* TO 'lab_app'@'%';
FLUSH PRIVILEGES;