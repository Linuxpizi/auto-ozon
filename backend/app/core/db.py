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
        ("stores", "fbs_error_index", "ALTER TABLE stores ADD COLUMN fbs_error_index TEXT DEFAULT ''"),
        ("stores", "product_cursor_active", "ALTER TABLE stores ADD COLUMN product_cursor_active VARCHAR(128) DEFAULT ''"),
        ("stores", "product_cursor_archived", "ALTER TABLE stores ADD COLUMN product_cursor_archived VARCHAR(128) DEFAULT ''"),
        ("listings", "offer_id", "ALTER TABLE listings ADD COLUMN offer_id VARCHAR(128) DEFAULT ''"),
        ("listings", "product_id", "ALTER TABLE listings ADD COLUMN product_id VARCHAR(128) DEFAULT ''"),
        ("listings", "has_fbo_stocks", "ALTER TABLE listings ADD COLUMN has_fbo_stocks BOOLEAN DEFAULT 0"),
        ("listings", "has_fbs_stocks", "ALTER TABLE listings ADD COLUMN has_fbs_stocks BOOLEAN DEFAULT 0"),
        ("listings", "archived", "ALTER TABLE listings ADD COLUMN archived BOOLEAN DEFAULT 0"),
        ("listings", "is_discounted", "ALTER TABLE listings ADD COLUMN is_discounted BOOLEAN DEFAULT 0"),
        ("listings", "primary_image", "ALTER TABLE listings ADD COLUMN primary_image TEXT DEFAULT ''"),
        ("listings", "old_price", "ALTER TABLE listings ADD COLUMN old_price VARCHAR(32) DEFAULT ''"),
        ("listings", "vat", "ALTER TABLE listings ADD COLUMN vat VARCHAR(16) DEFAULT ''"),
        ("listings", "barcodes", "ALTER TABLE listings ADD COLUMN barcodes TEXT DEFAULT '[]'"),
        ("listings", "description", "ALTER TABLE listings ADD COLUMN description TEXT DEFAULT ''"),
        ("listings", "images", "ALTER TABLE listings ADD COLUMN images TEXT DEFAULT '[]'"),
        ("listings", "min_price", "ALTER TABLE listings ADD COLUMN min_price VARCHAR(32) DEFAULT ''"),
        ("listings", "status", "ALTER TABLE listings ADD COLUMN status VARCHAR(32) DEFAULT ''"),
        ("listings", "type_id", "ALTER TABLE listings ADD COLUMN type_id INTEGER DEFAULT 0"),
        ("listings", "category_id", "ALTER TABLE listings ADD COLUMN category_id INTEGER DEFAULT 0"),
        ("listings", "volume_weight", "ALTER TABLE listings ADD COLUMN volume_weight REAL DEFAULT 0.0"),
        ("listings", "currency_code", "ALTER TABLE listings ADD COLUMN currency_code VARCHAR(16) DEFAULT ''"),
        ("listings", "is_kgt", "ALTER TABLE listings ADD COLUMN is_kgt BOOLEAN DEFAULT 0"),
        ("listings", "is_prepayment_allowed", "ALTER TABLE listings ADD COLUMN is_prepayment_allowed BOOLEAN DEFAULT 0"),
        ("listings", "commissions_json", "ALTER TABLE listings ADD COLUMN commissions_json TEXT DEFAULT '[]'"),
        ("listings", "stock_present", "ALTER TABLE listings ADD COLUMN stock_present INTEGER DEFAULT 0"),
        ("listings", "stock_reserved", "ALTER TABLE listings ADD COLUMN stock_reserved INTEGER DEFAULT 0"),
        ("listings", "ozon_created_at", "ALTER TABLE listings ADD COLUMN ozon_created_at VARCHAR(64) DEFAULT ''"),
        ("store_finances", "paid", "ALTER TABLE store_finances ADD COLUMN paid REAL DEFAULT 0.0"),
        ("store_finances", "opening_balance", "ALTER TABLE store_finances ADD COLUMN opening_balance REAL DEFAULT 0.0"),
        ("store_finances", "currency_code", "ALTER TABLE store_finances ADD COLUMN currency_code VARCHAR(16) DEFAULT 'RUB'"),
        ("store_finances", "sales_fee", "ALTER TABLE store_finances ADD COLUMN sales_fee REAL DEFAULT 0.0"),
        ("store_finances", "sales_revenue", "ALTER TABLE store_finances ADD COLUMN sales_revenue REAL DEFAULT 0.0"),
        ("store_finances", "sales_partner", "ALTER TABLE store_finances ADD COLUMN sales_partner REAL DEFAULT 0.0"),
        ("store_finances", "returns_amount", "ALTER TABLE store_finances ADD COLUMN returns_amount REAL DEFAULT 0.0"),
        ("store_finances", "returns_fee", "ALTER TABLE store_finances ADD COLUMN returns_fee REAL DEFAULT 0.0"),
        ("store_finances", "returns_revenue", "ALTER TABLE store_finances ADD COLUMN returns_revenue REAL DEFAULT 0.0"),
        ("store_finances", "returns_partner", "ALTER TABLE store_finances ADD COLUMN returns_partner REAL DEFAULT 0.0"),
        ("store_finances", "services_cost", "ALTER TABLE store_finances ADD COLUMN services_cost REAL DEFAULT 0.0"),
        ("store_finances", "services_detail", "ALTER TABLE store_finances ADD COLUMN services_detail VARCHAR(1024) DEFAULT '[]'"),
        ("orders", "product_id", "ALTER TABLE orders ADD COLUMN product_id INTEGER DEFAULT 0"),
        ("orders", "products_json", "ALTER TABLE orders ADD COLUMN products_json TEXT DEFAULT '[]'"),
        ("orders", "substatus", "ALTER TABLE orders ADD COLUMN substatus VARCHAR(64) DEFAULT ''"),
        ("orders", "offer_id", "ALTER TABLE orders ADD COLUMN offer_id VARCHAR(128) DEFAULT ''"),
        ("orders", "customer_price", "ALTER TABLE orders ADD COLUMN customer_price REAL DEFAULT 0.0"),
        ("orders", "payout", "ALTER TABLE orders ADD COLUMN payout REAL DEFAULT 0.0"),
        ("orders", "commission", "ALTER TABLE orders ADD COLUMN commission REAL DEFAULT 0.0"),
        ("orders", "discount", "ALTER TABLE orders ADD COLUMN discount REAL DEFAULT 0.0"),
        ("orders", "in_process_at", "ALTER TABLE orders ADD COLUMN in_process_at DATETIME"),
        ("orders", "available_actions", "ALTER TABLE orders ADD COLUMN available_actions TEXT DEFAULT '[]'"),
        ("orders", "currency_code", "ALTER TABLE orders ADD COLUMN currency_code VARCHAR(16) DEFAULT ''"),
    ]
    for table, column, sql in simple_migrations:
        columns = {c["name"] for c in inspector.get_columns(table)}
        if column not in columns:
            with engine.connect() as conn:
                conn.execute(text(sql))
                conn.commit()

    # Drop obsolete columns that still exist in SQLite with NOT NULL constraints
    _drop_column_if_exists(engine, "store_finances", "account_name")

    # Drop obsolete order columns removed from model
    _drop_column_if_exists(engine, "orders", "upper_barcode")
    _drop_column_if_exists(engine, "orders", "lower_barcode")
    _drop_column_if_exists(engine, "orders", "delivery_type")
    _drop_column_if_exists(engine, "orders", "is_premium")
    _drop_column_if_exists(engine, "orders", "payment_type")
    _drop_column_if_exists(engine, "orders", "delivery_date_begin")
    _drop_column_if_exists(engine, "orders", "delivery_date_end")
    _drop_column_if_exists(engine, "orders", "is_legal")
    _drop_column_if_exists(engine, "orders", "delivery_method")
    _drop_column_if_exists(engine, "orders", "warehouse_name")

    # Columns that may exist with wrong type — fix by recreating
    _fix_column_type(engine, "listings", "sku", "VARCHAR(128)", "''")
    _fix_column_type(engine, "listings", "name", "VARCHAR(512)", "''")
    _fix_column_type(engine, "listings", "price", "VARCHAR(32)", "''")

    # Drop obsolete columns that no longer exist in the model
    # but still exist in SQLite with NOT NULL constraints, causing insert failures.
    _drop_column_if_exists(engine, "listings", "product_name")
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
