-- Database initialization script for production
-- This script will be run when the PostgreSQL container starts

-- Create database if not exists (handled by POSTGRES_DB environment variable)
-- CREATE DATABASE zhuzhen_db;

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Set timezone
SET timezone = 'Asia/Shanghai';

-- Create user if not exists (handled by POSTGRES_USER environment variable)
-- CREATE USER zhuzhen WITH PASSWORD 'your-db-password';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE zhuzhen_db TO zhuzhen;

-- Connect to the database
\c zhuzhen_db;

-- Grant schema privileges
GRANT ALL ON SCHEMA public TO zhuzhen;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO zhuzhen;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO zhuzhen;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO zhuzhen;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO zhuzhen;

-- Performance optimizations
-- Set shared_preload_libraries in postgresql.conf if needed
-- shared_preload_libraries = 'pg_stat_statements'

-- Create indexes for better performance (will be created by SQLAlchemy)
-- These are just examples, actual indexes will be created by the application

-- Log the initialization
DO $$
BEGIN
    RAISE NOTICE 'Database initialization completed successfully';
END $$;
