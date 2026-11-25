-- Run once as a database administrator against an existing Aiven database.
-- Existing image paths and rows are preserved.

ALTER TABLE users
  ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER is_staff;

ALTER TABLE lost_items
  ADD COLUMN image_data MEDIUMBLOB NULL AFTER image,
  ADD COLUMN image_mime_type VARCHAR(50) NULL AFTER image_data;

ALTER TABLE found_items
  ADD COLUMN image_data MEDIUMBLOB NULL AFTER image,
  ADD COLUMN image_mime_type VARCHAR(50) NULL AFTER image_data;
