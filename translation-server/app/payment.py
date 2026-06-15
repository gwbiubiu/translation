import uuid
from datetime import datetime, timezone

from dateutil.relativedelta import relativedelta
from flask import Blueprint, jsonify, request, session

from .config import config
from .database import create_order, get_order, get_user_by_id, update_order_paid
from .user import login_required

payment_bp = Blueprint("payment", __name__)

PRICE = 9.90


def _alipay_client():
    from alipay import AliPay
    from alipay import AliPayConfig as SDKConfig

    cfg = config.alipay
    return AliPay(
        appid=cfg.app_id,
        app_notify_url=cfg.notify_url,
        app_private_key_string=cfg.private_key,
        alipay_public_key_string=cfg.public_key,
        sign_type="RSA2",
        config=SDKConfig(timeout=15),
        debug=cfg.sandbox,
    )


@payment_bp.route("/api/payment/create", methods=["POST"])
@login_required
def create():
    cfg = config.alipay
    if not cfg.app_id or not cfg.private_key:
        return jsonify({"error": "支付功能暂未配置，请联系管理员"}), 503

    user_id = session["user_id"]
    out_trade_no = uuid.uuid4().hex

    try:
        result = _alipay_client().api_alipay_trade_precreate(
            subject="智能翻译 Pro 会员（1个月）",
            out_trade_no=out_trade_no,
            total_amount=str(PRICE),
        )
    except Exception as e:
        return jsonify({"error": f"创建支付订单失败: {e}"}), 500

    if result.get("code") != "10000":
        return jsonify({"error": result.get("sub_msg", "支付宝下单失败")}), 500

    create_order(user_id, out_trade_no, PRICE, months=1)
    return jsonify({"qr_code_url": result["qr_code"], "out_trade_no": out_trade_no})


@payment_bp.route("/api/payment/notify", methods=["POST"])
def notify():
    data = request.form.to_dict()
    signature = data.pop("sign", None)

    try:
        valid = _alipay_client().verify(data, signature)
    except Exception:
        return "fail", 400

    if not valid:
        return "fail", 400

    trade_status = data.get("trade_status", "")
    out_trade_no = data.get("out_trade_no", "")

    # 金额防篡改校验
    try:
        if round(float(data.get("total_amount", "0")), 2) != PRICE:
            return "fail", 400
    except ValueError:
        return "fail", 400

    if trade_status != "TRADE_SUCCESS":
        return "success"

    order = get_order(out_trade_no)
    if not order or order["status"] == "paid":
        return "success"  # 幂等

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    user = get_user_by_id(order["user_id"])
    current_expiry = user.get("membership_expires_at") if user else None
    base = current_expiry if (current_expiry and current_expiry > now) else now
    new_expiry = base + relativedelta(months=int(order["months"]))

    update_order_paid(
        out_trade_no=out_trade_no,
        alipay_trade_no=data.get("trade_no", ""),
        user_id=order["user_id"],
        new_expiry=new_expiry,
    )
    return "success"


@payment_bp.route("/api/payment/query/<out_trade_no>", methods=["GET"])
@login_required
def query(out_trade_no):
    order = get_order(out_trade_no)
    if not order or order["user_id"] != session["user_id"]:
        return jsonify({"error": "订单不存在"}), 404
    return jsonify({"status": order["status"]})
