import sys
from unittest.mock import MagicMock

# Mock pymysql before any app module imports it
sys.modules["pymysql"] = MagicMock()
sys.modules["pymysql.cursors"] = MagicMock()

# Mock app.database so __init__.py doesn't call init_db() with real DB
sys.modules["app.database"] = MagicMock()
