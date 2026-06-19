from sqlalchemy import create_engine, text, inspect
from sqlalchemy.orm import sessionmaker, declarative_base
from app.core.config import DATABASE_URL

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def _migrate_columns(engine):
    """Add missing columns to existing SQLite tables (safe for prod).

    For columns that exist but have the wrong type (e.g. old Float price vs
    new String price), we create a temporary column, copy data, and drop the
    old one.
    """
    inspector = inspect(engine)

    # Simple ALTER TABLE ADD COLUMN (no type conflict)
    simple_migrations = [
        ("stores", "seller_rating", "ALTER TABLE stores ADD COLUMN seller_rating TEXT DEFAULT ''"),
        ("listings", "offer_id", "ALTER TABLE listings ADD COLUMN offer_id VARCHAR(128) DEFAULT ''"),
        ("listings", "product_id", "ALTER TABLE listings ADD COLUMN product_id VARCHAR(128) DEFAULT ''"),
        ("listings", "has_fbo_stocks", "ALTER TABLE listings ADD COLUMN has_fbo_stocks BOOLEAN DEFAULT 0"),
        ("listings", "has_fbs_stocks", "ALTER TABLE listings ADD COLUMN has_fbs_stocks BOOLEAN DEFAULT 0"),
        ("listings", "archived", "ALTER TABLE listings ADD COLUMN archived BOOLEAN DEFAULT 0"),
        ("listings", "is_discounted", "ALTER TABLE listings ADD COLUMN is_discounted BOOLEAN DEFAULT 0"),
        ("listings", "primary_image", "ALTER TABLE listings ADD COLUMN primary_image TEXT DEFAULT ''"),
        ("listings", "old_price", "ALTER TABLE listings ADD COLUMN old_price VARCHAR(32) DEFAULT ''"),
        ("listings", "vat", "ALTER TABLE listings ADD COLUMN vat VARCHAR(16) DEFAULT ''"),
        ("store_finances", "paid", "ALTER TABLE store_finances ADD COLUMN paid REAL DEFAULT 0.0"),
        ("store_finances", "opening_balance", "ALTER TABLE store_finances ADD COLUMN opening_balance REAL DEFAULT 0.0"),
    ]
    for table, column, sql in simple_migrations:
        columns = {c["name"] for c in inspector.get_columns(table)}
        if column not in columns:
            with engine.connect() as conn:
                conn.execute(text(sql))
                conn.commit()

    # Drop obsolete columns that still exist in SQLite with NOT NULL constraints
    _drop_column_if_exists(engine, "store_finances", "account_name")

    # Columns that may exist with wrong type — fix by recreating
    _fix_column_type(engine, "listings", "sku", "VARCHAR(128)", "''")
    _fix_column_type(engine, "listings", "name", "VARCHAR(512)", "''")
    _fix_column_type(engine, "listings", "price", "VARCHAR(32)", "''")

    # Drop obsolete columns that no longer exist in the model
    # but still exist in SQLite with NOT NULL constraints, causing insert failures.
    _drop_column_if_exists(engine, "listings", "product_name")
    _drop_column_if_exists(engine, "listings", "status")
    _drop_column_if_exists(engine, "listings", "image_url")
    _drop_column_if_exists(engine, "listings", "archived_at")


def _fix_column_type(engine, table: str, column: str, new_type: str, default: str):
    """Recreate a column with the correct type (SQLite: no ALTER COLUMN)."""
    inspector = inspect(engine)
    columns = {c["name"] for c in inspector.get_columns(table)}
    if column not in columns:
        # Column doesn't exist yet — simple add
        with engine.connect() as conn:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {new_type} DEFAULT {default}"))
            conn.commit()
        return

    # Check actual type from sqlite_master
    with engine.connect() as conn:
        row = conn.execute(text(
            f"SELECT type FROM pragma_table_info('{table}') WHERE name='{column}'"
        )).fetchone()
    if row and row[0].upper() in ("REAL", "FLOAT", "DOUBLE"):
        # Wrong type — backup data, drop, recreate
        tmp = f"_tmp_{column}"
        with engine.connect() as conn:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {tmp} {new_type} DEFAULT {default}"))
            conn.execute(text(f"UPDATE {table} SET {tmp} = CAST({column} AS TEXT)"))
            conn.execute(text(f"ALTER TABLE {table} DROP COLUMN {column}"))
            conn.execute(text(f"ALTER TABLE {table} RENAME COLUMN {tmp} TO {column}"))
            conn.commit()


def _drop_column_if_exists(engine, table: str, column: str):
    """Drop a column from a SQLite table if it exists (requires SQLite 3.35+)."""
    with engine.connect() as conn:
        row = conn.execute(text(
            f"SELECT name FROM pragma_table_info('{table}') WHERE name='{column}'"
        )).fetchone()
        if row:
            conn.execute(text(f"ALTER TABLE {table} DROP COLUMN {column}"))
            conn.commit()


_migrate_columns(engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
