from flask import Flask

from .auth import auth_bp
from .config import config
from .database import init_db
from .payment import payment_bp
from .routes import bp
from .user import user_bp


def create_app() -> Flask:
    app = Flask(__name__, template_folder="../templates")
    app.secret_key = config.session_secret

    init_db()

    app.register_blueprint(bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(user_bp)
    app.register_blueprint(payment_bp)

    @app.after_request
    def add_cors_headers(response):
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Access-Control-Request-Private-Network"
        response.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS, GET"
        response.headers["Access-Control-Allow-Private-Network"] = "true"
        return response

    return app
