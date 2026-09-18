import io
from urllib.parse import urlparse

import openpyxl
import requests
from django.core.files.base import ContentFile
from openpyxl.utils import get_column_letter

from apps.stores.models import PointOfSale, Stock

from .models import Category, Product

BASE_HEADERS = [
    "sku",
    "name",
    "category",
    "price",
    "compare_at_price",
    "unit",
    "description",
    "is_active",
    "image_url",
]

STOCK_COLUMN_PREFIX = "stock:"


def export_products_to_excel(queryset=None):
    """
    Retourne un fichier .xlsx (bytes) listant les produits, avec une colonne
    "stock:<Point de vente>" par point de vente actif.
    """
    queryset = queryset if queryset is not None else Product.objects.select_related("category").prefetch_related(
        "stocks__point_of_sale"
    )
    stores = list(PointOfSale.objects.filter(is_active=True).order_by("name"))
    headers = BASE_HEADERS + [f"{STOCK_COLUMN_PREFIX}{store.name}" for store in stores]

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Produits"
    ws.append(headers)

    for product in queryset:
        stock_by_store = {s.point_of_sale_id: s.quantity for s in product.stocks.all()}
        row = [
            product.sku,
            product.name,
            product.category.name if product.category else "",
            float(product.price),
            float(product.compare_at_price) if product.compare_at_price else None,
            product.unit,
            product.description,
            "oui" if product.is_active else "non",
            product.image.url if product.image else "",
        ]
        row += [stock_by_store.get(store.id, 0) for store in stores]
        ws.append(row)

    for i, header in enumerate(headers, start=1):
        ws.column_dimensions[get_column_letter(i)].width = max(14, len(header) + 4)

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer


def _attach_image_from_url(product, url):
    """Telecharge une image depuis une URL et la rattache au produit."""
    response = requests.get(url, timeout=15)
    response.raise_for_status()

    filename = urlparse(url).path.rsplit("/", 1)[-1] or f"{product.sku}.jpg"
    if "." not in filename:
        filename += ".jpg"

    product.image.save(filename, ContentFile(response.content), save=True)


def import_products_from_excel(file_obj):
    """
    Lit un fichier .xlsx et cree/met a jour les produits (upsert par sku).
    Les colonnes "stock:<Point de vente>" mettent a jour le stock de ce
    produit pour le point de vente correspondant (doit deja exister -
    utiliser /admin/stores pour creer un point de vente au prealable).
    Retourne un resume: {created, updated, errors: [...]}
    """
    wb = openpyxl.load_workbook(file_obj, data_only=True)
    ws = wb.active

    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return {"created": 0, "updated": 0, "errors": ["Fichier vide."]}

    header = [str(h).strip() if h else "" for h in rows[0]]
    header_lower = [h.lower() for h in header]
    required = {"sku", "name", "price"}
    if not required.issubset(set(header_lower)):
        return {
            "created": 0,
            "updated": 0,
            "errors": [f"Colonnes obligatoires manquantes: {required - set(header_lower)}"],
        }

    col_index = {name: idx for idx, name in enumerate(header_lower)}
    stock_columns = [
        (idx, h[len(STOCK_COLUMN_PREFIX):].strip())
        for idx, h in enumerate(header)
        if h.lower().startswith(STOCK_COLUMN_PREFIX)
    ]
    stores_by_name = {s.name.lower(): s for s in PointOfSale.objects.all()}

    created, updated, errors = 0, 0, []

    for row_number, row in enumerate(rows[1:], start=2):
        if row is None or all(cell is None for cell in row):
            continue
        try:
            sku = str(row[col_index["sku"]]).strip()
            name = str(row[col_index["name"]]).strip()
            price = row[col_index["price"]]
            if not sku or not name or price is None:
                errors.append(f"Ligne {row_number}: sku, name et price sont obligatoires.")
                continue

            category_name = None
            if "category" in col_index and row[col_index["category"]]:
                category_name = str(row[col_index["category"]]).strip()

            category = None
            if category_name:
                category, _ = Category.objects.get_or_create(name=category_name)

            defaults = {
                "name": name,
                "price": price,
                "category": category,
            }
            if "compare_at_price" in col_index and row[col_index["compare_at_price"]] not in (None, ""):
                defaults["compare_at_price"] = row[col_index["compare_at_price"]]
            if "unit" in col_index and row[col_index["unit"]]:
                defaults["unit"] = str(row[col_index["unit"]]).strip()
            if "description" in col_index and row[col_index["description"]]:
                defaults["description"] = str(row[col_index["description"]]).strip()
            if "is_active" in col_index and row[col_index["is_active"]] is not None:
                val = str(row[col_index["is_active"]]).strip().lower()
                defaults["is_active"] = val in ("oui", "yes", "true", "1")

            obj, was_created = Product.objects.update_or_create(sku=sku, defaults=defaults)
            if was_created:
                created += 1
            else:
                updated += 1

            if "image_url" in col_index and row[col_index["image_url"]]:
                image_url = str(row[col_index["image_url"]]).strip()
                try:
                    _attach_image_from_url(obj, image_url)
                except Exception as exc:  # noqa: BLE001
                    errors.append(f"Ligne {row_number}: image non recuperee ({image_url}) - {exc}")

            for idx, store_name in stock_columns:
                if row[idx] is None or row[idx] == "":
                    continue
                store = stores_by_name.get(store_name.lower())
                if not store:
                    errors.append(
                        f"Ligne {row_number}: point de vente '{store_name}' introuvable, stock ignore "
                        f"(creez-le d'abord dans Points de vente)."
                    )
                    continue
                Stock.objects.update_or_create(
                    product=obj, point_of_sale=store, defaults={"quantity": int(row[idx])}
                )
        except Exception as exc:  # noqa: BLE001
            errors.append(f"Ligne {row_number}: {exc}")

    return {"created": created, "updated": updated, "errors": errors}
