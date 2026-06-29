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
        # scraped_product_records: 新增列
        ("scraped_product_records", "weight_g", "ALTER TABLE scraped_product_records ADD COLUMN weight_g INTEGER DEFAULT 0"),
        ("scraped_product_records", "depth_mm", "ALTER TABLE scraped_product_records ADD COLUMN depth_mm INTEGER DEFAULT 0"),
        ("scraped_product_records", "height_mm", "ALTER TABLE scraped_product_records ADD COLUMN height_mm INTEGER DEFAULT 0"),
        ("scraped_product_records", "width_mm", "ALTER TABLE scraped_product_records ADD COLUMN width_mm INTEGER DEFAULT 0"),
        ("scraped_product_records", "supplier_sku", "ALTER TABLE scraped_product_records ADD COLUMN supplier_sku VARCHAR(128) DEFAULT ''"),
        ("scraped_product_records", "barcode", "ALTER TABLE scraped_product_records ADD COLUMN barcode VARCHAR(64) DEFAULT ''"),
        ("scraped_product_records", "video_url", "ALTER TABLE scraped_product_records ADD COLUMN video_url VARCHAR(1024) DEFAULT ''"),
        ("scraped_product_records", "ozon_category_id", "ALTER TABLE scraped_product_records ADD COLUMN ozon_category_id INTEGER DEFAULT 0"),
        ("scraped_product_records", "ozon_type_id", "ALTER TABLE scraped_product_records ADD COLUMN ozon_type_id INTEGER DEFAULT 0"),
        ("scraped_product_records", "synced", "ALTER TABLE scraped_product_records ADD COLUMN synced BOOLEAN DEFAULT 1"),
        ("scraped_product_records", "matched", "ALTER TABLE scraped_product_records ADD COLUMN matched BOOLEAN DEFAULT 0"),
        ("scraped_product_records", "matched_suppliers", "ALTER TABLE scraped_product_records ADD COLUMN matched_suppliers TEXT DEFAULT '[]'"),
        ("scraped_product_records", "created_at", "ALTER TABLE scraped_product_records ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP"),
        ("scraped_product_records", "updated_at", "ALTER TABLE scraped_product_records ADD COLUMN updated_at DATETIME"),
        # scraped_product_records: v2 多值字段 (JSON arrays)
        ("scraped_product_records", "video_urls", "ALTER TABLE scraped_product_records ADD COLUMN video_urls TEXT DEFAULT '[]'"),
        ("scraped_product_records", "sku_list", "ALTER TABLE scraped_product_records ADD COLUMN sku_list TEXT DEFAULT '[]'"),
        ("scraped_product_records", "spec_list", "ALTER TABLE scraped_product_records ADD COLUMN spec_list TEXT DEFAULT '[]'"),
        ("orders", "cancellation_initiator", "ALTER TABLE orders ADD COLUMN cancellation_initiator VARCHAR(32) DEFAULT ''"),
        ("orders", "cancellation_reason", "ALTER TABLE orders ADD COLUMN cancellation_reason VARCHAR(128) DEFAULT ''"),
        ("orders", "cancellation_reason_message", "ALTER TABLE orders ADD COLUMN cancellation_reason_message TEXT DEFAULT ''"),
        ("orders", "cancelled_at", "ALTER TABLE orders ADD COLUMN cancelled_at DATETIME"),
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

    # ── scraped_product_records: migrate old single-value → new JSON arrays ──
    _migrate_scraped_product_v2(engine)

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


def _migrate_scraped_product_v2(engine):
    """Convert old single-value columns to new JSON array columns.

    Old columns (kept for backward compat, but data migrated to new format):
      video_url (str) → video_urls (JSON list)
      supplier_sku (str) + barcode (str) → sku_list (JSON list of {sku, barcode})
      weight_g (int) + depth_mm + height_mm + width_mm → spec_list (JSON list of {weight_g, depth_mm, height_mm, width_mm})
    """
    import json as _json
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    if "scraped_product_records" not in tables:
        return
    cols = {c["name"] for c in inspector.get_columns("scraped_product_records")}
    # Only migrate if new columns are empty (first run after upgrade)
    need_migrate = False
    for new_col in ("video_urls", "sku_list", "spec_list"):
        if new_col in cols:
            with engine.connect() as conn:
                row = conn.execute(text(
                    f"SELECT COUNT(*) FROM scraped_product_records WHERE {new_col} = '[]' OR {new_col} IS NULL"
                )).fetchone()
                if row and row[0] > 0:
                    need_migrate = True
                    break
    if not need_migrate:
        return
    with engine.connect() as conn:
        rows = conn.execute(text("SELECT id, video_url, supplier_sku, barcode, weight_g, depth_mm, height_mm, width_mm FROM scraped_product_records")).fetchall()
        for r in rows:
            rid = r[0]
            updates, params = [], []
            # video_url → video_urls
            vu = r[1] or ""
            if vu and cols.get("video_urls") is not None:  # always true after ADD COLUMN
                updates.append("video_urls = ?")
                params.append(_json.dumps([vu], ensure_ascii=False))
            # supplier_sku + barcode → sku_list
            sku = r[2] or ""
            bc = r[3] or ""
            if (sku or bc):
                updates.append("sku_list = ?")
                params.append(_json.dumps([{"sku": sku, "barcode": bc}], ensure_ascii=False))
            # weight + dims → spec_list
            wg = r[4] or 0
            dp = r[5] or 0
            ht = r[6] or 0
            wd = r[7] or 0
            if wg or dp or ht or wd:
                updates.append("spec_list = ?")
                params.append(_json.dumps([{"weight_g": wg, "depth_mm": dp, "height_mm": ht, "width_mm": wd}], ensure_ascii=False))
            if updates:
                params.append(rid)
                conn.execute(text(f"UPDATE scraped_product_records SET {', '.join(updates)} WHERE id = ?"), params)
        conn.commit()


_migrate_columns(engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
