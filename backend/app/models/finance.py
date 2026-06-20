from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from app.core.db import Base


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class StoreFinance(Base):
    __tablename__ = "store_finances"

    id = Column(Integer, primary_key=True, index=True)
    store_id = Column(Integer, ForeignKey("stores.id", ondelete="CASCADE"), nullable=False, unique=True)
    store_name = Column(String(128), nullable=False)
    currency_code = Column(String(16), nullable=False, default="RUB", comment="余额币种")
    opening_balance = Column(Float, default=0.0, comment="期初余额")
    balance = Column(Float, default=0.0, comment="可用余额 (期末)")
    total_income = Column(Float, default=0.0, comment="总收入 (sales_amount)")
    sales_fee = Column(Float, default=0.0, comment="销售佣金/手续费")
    sales_revenue = Column(Float, default=0.0, comment="销售实际收入 (revenue)")
    sales_partner = Column(Float, default=0.0, comment="销售合作伙伴计划金额")
    returns_amount = Column(Float, default=0.0, comment="退货金额")
    returns_fee = Column(Float, default=0.0, comment="退货手续费")
    returns_revenue = Column(Float, default=0.0, comment="退货实际金额 (revenue)")
    returns_partner = Column(Float, default=0.0, comment="退货合作伙伴计划金额")
    services_cost = Column(Float, default=0.0, comment="服务费总计")
    services_detail = Column(String(1024), default="[]", comment="服务费明细 JSON")
    total_expense = Column(Float, default=0.0, comment="总支出 (sales_fee + returns_fee + services_cost)")
    pending_amount = Column(Float, default=0.0, comment="待结算金额")
    paid = Column(Float, default=0.0, comment="已打款金额")
    last_sync_at = Column(DateTime, default=_utcnow, comment="最后同步时间")
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)


class FinanceCashFlow(Base):
    __tablename__ = "finance_cash_flows"

    id = Column(Integer, primary_key=True, index=True)
    store_id = Column(Integer, ForeignKey("stores.id", ondelete="CASCADE"), nullable=False)
    store_name = Column(String(128), nullable=False)
    period_id = Column(Integer, index=True, comment="Ozon period ID")
    period_begin = Column(String(64), comment="周期开始时间")
    period_end = Column(String(64), comment="周期结束时间")
    orders_amount = Column(Float, default=0.0, comment="订单金额")
    returns_amount = Column(Float, default=0.0, comment="退货金额")
    commission_amount = Column(Float, default=0.0, comment="佣金")
    services_amount = Column(Float, default=0.0, comment="服务费")
    delivery_amount = Column(Float, default=0.0, comment="配送与退货费用")
    currency_code = Column(String(16), default="RUB")
    created_at = Column(DateTime, default=_utcnow)
