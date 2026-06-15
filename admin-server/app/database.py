import logging
from contextlib import contextmanager

import pymysql
import pymysql.cursors

from .config import config

logger = logging.getLogger(__name__)

_db_available = False


def init_db():
    global _db_available
    try:
        with _conn() as conn:
            pass  # 只验证连接，表由主服务创建
        _db_available = True
        logger.info("MySQL 连接成功")
    except Exception as e:
        _db_available = False
        logger.warning("MySQL 不可用: %s", e)


def is_available() -> bool:
    return _db_available


@contextmanager
def _conn():
    cfg = config.mysql
    conn = pymysql.connect(
        host=cfg.host,
        port=cfg.port,
        user=cfg.user,
        password=cfg.password,
        database=cfg.database,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        connect_timeout=5,
        autocommit=False,
    )
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# ── 统计 ─────────────────────────────────────────────────────────────

def get_overview_stats() -> dict:
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS cnt FROM users")
            total_users = cur.fetchone()["cnt"]

            cur.execute("SELECT COUNT(*) AS cnt FROM translation_history")
            total_translations = cur.fetchone()["cnt"]

            cur.execute("""
                SELECT COUNT(*) AS cnt FROM users
                WHERE DATE(created_at) = CURDATE()
            """)
            new_users_today = cur.fetchone()["cnt"]

            cur.execute("""
                SELECT COUNT(*) AS cnt FROM translation_history
                WHERE DATE(created_at) = CURDATE()
            """)
            translations_today = cur.fetchone()["cnt"]

    return {
        "total_users": total_users,
        "total_translations": total_translations,
        "new_users_today": new_users_today,
        "translations_today": translations_today,
    }


def get_daily_stats(days: int = 14) -> list[dict]:
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    DATE(d.dt) AS date,
                    COALESCE(u.cnt, 0) AS new_users,
                    COALESCE(t.cnt, 0) AS translations
                FROM (
                    SELECT CURDATE() - INTERVAL seq DAY AS dt
                    FROM (
                        SELECT 0 AS seq UNION SELECT 1 UNION SELECT 2 UNION SELECT 3
                        UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7
                        UNION SELECT 8 UNION SELECT 9 UNION SELECT 10 UNION SELECT 11
                        UNION SELECT 12 UNION SELECT 13
                    ) s WHERE seq < %s
                ) d
                LEFT JOIN (
                    SELECT DATE(created_at) AS day, COUNT(*) AS cnt
                    FROM users GROUP BY day
                ) u ON u.day = DATE(d.dt)
                LEFT JOIN (
                    SELECT DATE(created_at) AS day, COUNT(*) AS cnt
                    FROM translation_history GROUP BY day
                ) t ON t.day = DATE(d.dt)
                ORDER BY date ASC
            """, (days,))
            rows = cur.fetchall()
    return [{"date": str(r["date"]), "new_users": r["new_users"], "translations": r["translations"]} for r in rows]


# ── 用户管理 ──────────────────────────────────────────────────────────

def get_users(page: int = 1, page_size: int = 20, q: str = "") -> dict:
    offset = (page - 1) * page_size
    with _conn() as conn:
        with conn.cursor() as cur:
            if q:
                like = f"%{q}%"
                cur.execute(
                    "SELECT COUNT(*) AS cnt FROM users WHERE nickname LIKE %s OR openid LIKE %s",
                    (like, like),
                )
                total = cur.fetchone()["cnt"]
                cur.execute("""
                    SELECT u.id, u.openid, u.nickname, u.avatar_url, u.membership,
                           u.membership_expires_at, u.created_at,
                           COUNT(t.id) AS translation_count
                    FROM users u
                    LEFT JOIN translation_history t ON t.user_id = u.id
                    WHERE u.nickname LIKE %s OR u.openid LIKE %s
                    GROUP BY u.id
                    ORDER BY u.created_at DESC
                    LIMIT %s OFFSET %s
                """, (like, like, page_size, offset))
            else:
                cur.execute("SELECT COUNT(*) AS cnt FROM users")
                total = cur.fetchone()["cnt"]
                cur.execute("""
                    SELECT u.id, u.openid, u.nickname, u.avatar_url, u.membership,
                           u.membership_expires_at, u.created_at,
                           COUNT(t.id) AS translation_count
                    FROM users u
                    LEFT JOIN translation_history t ON t.user_id = u.id
                    GROUP BY u.id
                    ORDER BY u.created_at DESC
                    LIMIT %s OFFSET %s
                """, (page_size, offset))
            users = cur.fetchall()

    for u in users:
        if hasattr(u.get("created_at"), "strftime"):
            u["created_at"] = u["created_at"].strftime("%Y-%m-%d")
        exp = u.get("membership_expires_at")
        u["membership_expires_at"] = exp.strftime("%Y-%m-%d") if exp else None

    return {"total": total, "page": page, "page_size": page_size, "users": users}


def update_user_membership(user_id: int, membership: str, months: int = 1) -> bool:
    if membership not in ("free", "pro"):
        return False
    with _conn() as conn:
        with conn.cursor() as cur:
            if membership == "pro":
                # 从当前到期时间（若未来）或现在起延长 months 个月
                cur.execute("""
                    UPDATE users
                    SET membership = 'pro',
                        membership_expires_at = DATE_ADD(
                            GREATEST(NOW(), COALESCE(membership_expires_at, NOW())),
                            INTERVAL %s MONTH
                        )
                    WHERE id = %s
                """, (months, user_id))
            else:
                cur.execute(
                    "UPDATE users SET membership='free', membership_expires_at=NULL WHERE id=%s",
                    (user_id,),
                )
            return cur.rowcount > 0
