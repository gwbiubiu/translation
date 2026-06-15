from flask import Flask, g

from .auth import auth_bp
from .config import config
from .database import init_db
from .routes import bp
from .user import set_token_cookie, user_bp


def create_app() -> Flask:
    app = Flask(__name__, template_folder="../templates")
    app.secret_key = config.session_secret

    init_db()

    app.register_blueprint(bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(user_bp)

    @app.after_request
    def maybe_renew_token(response):
        if getattr(g, "renew_token", False) and hasattr(g, "user_id"):
            set_token_cookie(response, g.user_id)
        return response

    @app.after_request
    def add_cors_headers(response):
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Access-Control-Request-Private-Network"
        response.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS, GET"
        response.headers["Access-Control-Allow-Private-Network"] = "true"
        return response

    return app
