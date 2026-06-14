from flask import Flask

from .auth import auth_bp
from .config import config
from .database import init_db
from .routes import api_bp


def create_app() -> Flask:
    app = Flask(__name__)
    app.secret_key = config.session_secret

    init_db()

    app.register_blueprint(auth_bp)
    app.register_blueprint(api_bp)

    @app.after_request
    def cors(response):
        response.headers["Access-Control-Allow-Origin"] = "http://localhost:5174"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PATCH, OPTIONS"
        response.headers["Access-Control-Allow-Credentials"] = "true"
        return response

    return app
