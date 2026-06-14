from flask import Flask

from .routes import bp


def create_app() -> Flask:
    app = Flask(__name__, template_folder="../templates")
    app.register_blueprint(bp)

    @app.after_request
    def add_cors_headers(response):
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Access-Control-Request-Private-Network"
        response.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
        response.headers["Access-Control-Allow-Private-Network"] = "true"
        return response

    return app
