"""Reglages gunicorn (charges automatiquement) : plusieurs requetes en meme temps (connexion, catalogue, cloture...) au lieu d'une file d'attente."""

worker_class = "gthread"
workers = 1
threads = 8
timeout = 60
keepalive = 30
