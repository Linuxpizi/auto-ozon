"""Feishu (飞书) notification service — sends return-order alerts.

Uses the official ``lark-oapi`` SDK (飞书开放平台).

Two delivery methods supported:
  1. **App messaging** (recommended) — uses App ID + App Secret to obtain
     a tenant_access_token, then sends rich interactive card messages to
     a specified chat via ``im/v1/messages``.
  2. **Webhook** (fallback) — posts a simple text/json payload to a
     custom bot webhook URL.
"""

import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# lark-oapi import (lazy)
# ---------------------------------------------------------------------------
_lark_client_cls = None


def _get_lark_client(app_id: str, app_secret: str):
    """Return a configured lark Client (lazy import)."""
    global _lark_client_cls
    try:
        import lark_oapi as lark

        return lark.Client.builder().app_id(app_id).app_secret(app_secret).build()
    except ImportError:
        logger.error(
            "lark-oapi is not installed. "
            "Install it with: pip install lark-oapi"
        )
        return None
    except Exception as exc:
        logger.error("Failed to create Feishu client: %s", exc)
        return None


# ---------------------------------------------------------------------------
# Send via App messaging (interactive card)
# ---------------------------------------------------------------------------

def send_return_order_notification(
    app_id: str,
    app_secret: str,
    chat_id: str,
    return_data: dict,
) -> bool:
    """Send a rich interactive card message about a new return order.

    Args:
        app_id: Feishu App ID.
        app_secret: Feishu App Secret.
        chat_id: Target chat ID (oc_xxxx).
        return_data: Dict with return order details.

    Returns:
        True if sent successfully.
    """
    client = _get_lark_client(app_id, app_secret)
    if not client:
        return False

    try:
        import lark_oapi as lark
        from lark_oapi.api.im.v1 import CreateMessageRequest, CreateMessageRequestBody

        card = _build_return_card(return_data)

        request = (
            CreateMessageRequest.builder()
            .receive_id_type("chat_id")
            .request_body(
                CreateMessageRequestBody.builder()
                .receive_id(chat_id)
                .msg_type("interactive")
                .content(json.dumps(card))
                .build()
            )
            .build()
        )

        response = client.im.v1.message.create(request)

        if not response.success():
            logger.error(
                "Feishu send failed: code=%s msg=%s",
                response.code,
                response.msg,
            )
            return False

        logger.info("Feishu notification sent for return %s", return_data.get("return_id", ""))
        return True

    except Exception as exc:
        logger.error("Feishu send_return_order_notification error: %s", exc)
        return False


def send_text_message(
    app_id: str,
    app_secret: str,
    chat_id: str,
    text: str,
) -> bool:
    """Send a plain text message to a Feishu chat."""
    client = _get_lark_client(app_id, app_secret)
    if not client:
        return False

    try:
        import lark_oapi as lark
        from lark_oapi.api.im.v1 import CreateMessageRequest, CreateMessageRequestBody

        content = json.dumps({"text": text})

        request = (
            CreateMessageRequest.builder()
            .receive_id_type("chat_id")
            .request_body(
                CreateMessageRequestBody.builder()
                .receive_id(chat_id)
                .msg_type("text")
                .content(content)
                .build()
            )
            .build()
        )

        response = client.im.v1.message.create(request)
        if not response.success():
            logger.error("Feishu text send failed: code=%s msg=%s", response.code, response.msg)
            return False
        return True

    except Exception as exc:
        logger.error("Feishu send_text_message error: %s", exc)
        return False


# ---------------------------------------------------------------------------
# Webhook fallback
# ---------------------------------------------------------------------------

def send_webhook_notification(webhook_url: str, return_data: dict) -> bool:
    """Send a notification via Feishu custom bot webhook (fallback method).

    Args:
        webhook_url: The incoming webhook URL.
        return_data: Dict with return order details.

    Returns:
        True if sent successfully.
    """
    try:
        import httpx

        store_name = return_data.get("store_name", "未知店铺")
        return_id = return_data.get("return_id", "")
        product_name = return_data.get("product_name", "")
        offer_id = return_data.get("offer_id", "")
        quantity = return_data.get("quantity", 0)
        return_price = return_data.get("return_price", 0.0)
        reason = return_data.get("reason", "")
        status = return_data.get("status", "")

        text = (
            f"📦 **退货提醒**\n\n"
            f"**店铺**: {store_name}\n"
            f"**退货ID**: {return_id}\n"
            f"**商品**: {product_name}\n"
            f"**SKU**: {offer_id}\n"
            f"**数量**: {quantity}\n"
            f"**退货金额**: {return_price}\n"
            f"**原因**: {reason}\n"
            f"**状态**: {status}\n"
        )

        payload = {"msg_type": "interactive", "card": {
            "header": {
                "title": {"tag": "plain_text", "content": f"📦 退货提醒 — {store_name}"},
                "template": "red",
            },
            "elements": [
                {"tag": "markdown", "content": text},
            ],
        }}

        resp = httpx.post(webhook_url, json=payload, timeout=10)
        resp.raise_for_status()
        logger.info("Feishu webhook notification sent for return %s", return_id)
        return True

    except Exception as exc:
        logger.error("Feishu webhook error: %s", exc)
        return False


# ---------------------------------------------------------------------------
# Card builder
# ---------------------------------------------------------------------------

def _build_return_card(return_data: dict) -> dict:
    """Build a Feishu interactive card for a return order notification."""
    store_name = return_data.get("store_name", "未知店铺")
    return_id = return_data.get("return_id", "")
    product_name = return_data.get("product_name", "")
    offer_id = return_data.get("offer_id", "")
    quantity = return_data.get("quantity", 0)
    return_price = return_data.get("return_price", 0.0)
    reason = return_data.get("reason", "")
    reason_message = return_data.get("reason_message", "")
    status = return_data.get("status", "")
    image_url = return_data.get("image_url", "")

    elements = []

    # Image (if available)
    if image_url:
        elements.append({
            "tag": "img",
            "img_key": image_url,
            "alt": {"tag": "plain_text", "content": product_name},
        })

    fields = [
        {"is_short": True, "text": {"tag": "lark_md", "content": f"**店铺**\n{store_name}"}},
        {"is_short": True, "text": {"tag": "lark_md", "content": f"**退货ID**\n{return_id}"}},
        {"is_short": False, "text": {"tag": "lark_md", "content": f"**商品**\n{product_name}"}},
        {"is_short": True, "text": {"tag": "lark_md", "content": f"**SKU**\n{offer_id}"}},
        {"is_short": True, "text": {"tag": "lark_md", "content": f"**数量**\n{quantity}"}},
        {"is_short": True, "text": {"tag": "lark_md", "content": f"**退货金额**\n¥{return_price}"}},
        {"is_short": True, "text": {"tag": "lark_md", "content": f"**状态**\n{status}"}},
    ]

    elements.append({"tag": "div", "fields": fields})

    if reason or reason_message:
        reason_text = reason
        if reason_message:
            reason_text = f"{reason}: {reason_message}" if reason else reason_message
        elements.append({
            "tag": "div",
            "text": {"tag": "lark_md", "content": f"**退货原因**: {reason_text}"},
        })

    elements.append({"tag": "hr"})
    elements.append({
        "tag": "note",
        "elements": [
            {"tag": "plain_text", "content": "由鲸智 AI 自动监控推送"},
        ],
    })

    return {
        "header": {
            "title": {"tag": "plain_text", "content": f"📦 退货提醒 — {store_name}"},
            "template": "red",
        },
        "elements": elements,
    }


# ---------------------------------------------------------------------------
# Convenience: send notification using feishu_config from DB
# ---------------------------------------------------------------------------

def notify_return_order(feishu_config, return_data: dict, chat_id: str = "") -> bool:
    """Send return order notification using the given feishu config.

    Args:
        feishu_config: FeishuConfig model instance (app_id, app_secret, webhook_url, enabled).
        return_data: Dict with return order details.
        chat_id: Optional chat_id for app messaging.

    Returns:
        True if sent successfully.
    """
    if not feishu_config or feishu_config.enabled != 1:
        logger.debug("Feishu notification disabled or config missing")
        return False

    # Prefer app messaging if we have credentials + chat_id
    if feishu_config.app_id and feishu_config.app_secret and chat_id:
        return send_return_order_notification(
            app_id=feishu_config.app_id,
            app_secret=feishu_config.app_secret,
            chat_id=chat_id,
            return_data=return_data,
        )

    # Fallback to webhook
    if feishu_config.webhook_url:
        return send_webhook_notification(
            webhook_url=feishu_config.webhook_url,
            return_data=return_data,
        )

    logger.warning("Feishu config present but no app credentials or webhook_url set")
    return False
