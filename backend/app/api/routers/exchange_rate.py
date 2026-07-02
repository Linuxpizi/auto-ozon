"""Exchange rate API — PBOC / CBR / ECB"""
import logging
from fastapi import APIRouter, HTTPException
from app.services.exchange_rate_service import get_all_rates

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/exchange-rates")
async def get_exchange_rates():
    """Get exchange rates from PBOC, CBR, ECB.

    Returns aggregated rates for key currency pairs:
    CNY/RUB, CNY/USD, USD/RUB, EUR/RUB, EUR/CNY, EUR/USD, etc.
    """
    try:
        result = await get_all_rates()
        return result
    except Exception as e:
        logger.error("Failed to fetch exchange rates: %s", e)
        raise HTTPException(status_code=500, detail=f"获取汇率失败: {e}")
