from app import create_app
from app.config import config

flask_app = create_app()

if __name__ == "__main__":
    flask_app.run(debug=False, port=config.port)
