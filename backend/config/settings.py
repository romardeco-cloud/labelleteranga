import os
from datetime import timedelta
from pathlib import Path

import dj_database_url
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "insecure-dev-key")
DEBUG = os.environ.get("DJANGO_DEBUG", "True") == "True"

ALLOWED_HOSTS = [
    h.strip()
    for h in os.environ.get("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")
    if h.strip()
]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # 3rd party
    "rest_framework",
    "rest_framework_simplejwt",
    "corsheaders",
    "django_filters",
    # local apps
    "apps.catalog",
    "apps.stores",
    "apps.cart",
    "apps.orders",
    "apps.payments",
    "apps.reports",
    "apps.accounts",
    "apps.notifications",
    "apps.pos",
    "apps.documents",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "apps.reports.sealopts.SealOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

DATABASES = {
    "default": dj_database_url.config(
        default=os.environ.get(
            "DATABASE_URL",
            "postgres://postgres:postgres@localhost:5432/labelleteranga",
        ),
        conn_max_age=600,
    )
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "fr-fr"
TIME_ZONE = "Africa/Dakar"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# Images : Cloudinary en production (CLOUDINARY_URL defini), disque local sinon.
STORAGES = {
    "default": {
        "BACKEND": "config.storage.CloudinaryMediaStorage"
        if os.environ.get("CLOUDINARY_URL")
        else "django.core.files.storage.FileSystemStorage"
    },
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.AllowAny",),
    "DEFAULT_FILTER_BACKENDS": ("django_filters.rest_framework.DjangoFilterBackend",),
    "DEFAULT_PAGINATION_CLASS": "config.pagination.StandardPagination",
    "PAGE_SIZE": 24,
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=8),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
}

CORS_ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get(
        "CORS_ALLOWED_ORIGINS", "http://localhost:3000"
    ).split(",")
    if o.strip()
]
# Domaine officiel : labelleteranga.com, www. et les sites de chaque point de vente (resto., supermarche., ...)
CORS_ALLOWED_ORIGIN_REGEXES = [r"^https://([a-z0-9-]+\.)?labelleteranga\.com$"]
CSRF_TRUSTED_ORIGINS = CORS_ALLOWED_ORIGINS + ["https://labelleteranga.com", "https://*.labelleteranga.com"]

# Stripe
STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY", "")
STRIPE_PUBLISHABLE_KEY = os.environ.get("STRIPE_PUBLISHABLE_KEY", "")
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
STRIPE_CURRENCY = os.environ.get("STRIPE_CURRENCY", "xof")

FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")
BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:8000")

# Wave (Wave for Business Checkout)
WAVE_API_KEY = os.environ.get("WAVE_API_KEY", "")
WAVE_CURRENCY = os.environ.get("WAVE_CURRENCY", "XOF")

# Orange Money (Orange Money Web Payment)
ORANGE_MONEY_CLIENT_ID = os.environ.get("ORANGE_MONEY_CLIENT_ID", "")
ORANGE_MONEY_CLIENT_SECRET = os.environ.get("ORANGE_MONEY_CLIENT_SECRET", "")
ORANGE_MONEY_MERCHANT_KEY = os.environ.get("ORANGE_MONEY_MERCHANT_KEY", "")
# Le code devise attendu par le sandbox Orange peut differer de l'ISO "XOF"
# (ex. "OUV" observe sur certains environnements de test) - a verifier avec
# votre contrat marchand Orange Money avant mise en production.
ORANGE_MONEY_CURRENCY = os.environ.get("ORANGE_MONEY_CURRENCY", "XOF")

# WhatsApp Cloud API (Meta) - voir apps/notifications/whatsapp.py pour le
# detail de la configuration et le texte exact du modele a faire approuver
WHATSAPP_ACCESS_TOKEN = os.environ.get("WHATSAPP_ACCESS_TOKEN", "")
WHATSAPP_PHONE_NUMBER_ID = os.environ.get("WHATSAPP_PHONE_NUMBER_ID", "")
WHATSAPP_API_VERSION = os.environ.get("WHATSAPP_API_VERSION", "v21.0")
WHATSAPP_TEMPLATE_NAME = os.environ.get("WHATSAPP_TEMPLATE_NAME", "")
WHATSAPP_TEMPLATE_LANGUAGE = os.environ.get("WHATSAPP_TEMPLATE_LANGUAGE", "fr")
# Numero WhatsApp de la boutique (format international sans "+", ex: 221771234567)
WHATSAPP_SHOP_NUMBER = os.environ.get("WHATSAPP_SHOP_NUMBER", "")

if not DEBUG:
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
