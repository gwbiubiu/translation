import logging
import pymysql
import pymysql.cursors
from contextlib import contextmanager

from .config import config

logger = logging.getLogger(__name__)

# 标记 MySQL 是否可用，启动时检测一次
_db_available = False


def _cfg():
    return config.mysql


def init_db():
    global _db_available
    cfg = _cfg()
    try:
        # 先不指定数据库，创建库
        conn = pymysql.connect(
            host=cfg.host, port=cfg.port,
            user=cfg.user, password=cfg.password,
            charset="utf8mb4",
            connect_timeout=5,
        )
        try:
            with conn.cursor() as cur:
                cur.execute(
                    f"CREATE DATABASE IF NOT EXISTS `{cfg.database}` "
                    "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
                )
            conn.commit()
        finally:
            conn.close()

        with _conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS users (
                        id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                        openid      VARCHAR(64) UNIQUE NOT NULL,
                        nickname    VARCHAR(128) DEFAULT '',
                        avatar_url  TEXT DEFAULT '',
                        membership  VARCHAR(32) DEFAULT 'free',
                        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """)
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS translation_history (
                        id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                        user_id         BIGINT UNSIGNED NOT NULL,
                        source_text     TEXT NOT NULL,
                        translated_text TEXT NOT NULL,
                        source_lang     VARCHAR(16) DEFAULT '',
                        target_lang     VARCHAR(16) DEFAULT '',
                        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
                        INDEX idx_user_time (user_id, created_at DESC)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """)
            conn.commit()

        _db_available = True
        logger.info("MySQL 连接成功，数据库功能已启用")
    except Exception as e:
        _db_available = False
        logger.warning("MySQL 不可用，用户/历史功能已禁用: %s", e)


def is_available() -> bool:
    return _db_available


@contextmanager
def _conn():
    cfg = _cfg()
    conn = pymysql.connect(
        host=cfg.host, port=cfg.port,
        user=cfg.user, password=cfg.password,
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


def get_or_create_user(openid: str, nickname: str = "", avatar_url: str = "") -> dict:
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO users (openid, nickname, avatar_url) VALUES (%s, %s, %s) "
                "ON DUPLICATE KEY UPDATE nickname=VALUES(nickname), avatar_url=VALUES(avatar_url)",
                (openid, nickname, avatar_url),
            )
            cur.execute("SELECT * FROM users WHERE openid=%s", (openid,))
            return cur.fetchone()


def get_user_by_id(user_id: int) -> dict | None:
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM users WHERE id=%s", (user_id,))
            return cur.fetchone()


def record_translation(
    user_id: int,
    source_text: str,
    translated_text: str,
    source_lang: str,
    target_lang: str,
):
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO translation_history "
                "(user_id, source_text, translated_text, source_lang, target_lang) "
                "VALUES (%s, %s, %s, %s, %s)",
                (user_id, source_text[:500], translated_text[:500], source_lang, target_lang),
            )


def get_user_stats(user_id: int) -> dict:
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) AS total FROM translation_history WHERE user_id=%s",
                (user_id,),
            )
            total = cur.fetchone()["total"]
            cur.execute(
                "SELECT source_text, translated_text, source_lang, target_lang, created_at "
                "FROM translation_history WHERE user_id=%s "
                "ORDER BY created_at DESC LIMIT 20",
                (user_id,),
            )
            history = cur.fetchall()
    return {"total": total, "history": history}
