import io

import openpyxl
from openpyxl.utils import get_column_letter

from .models import Category, Product

EXPORT_HEADERS = [
    "sku",
    "name",
    "category",
    "price",
    "compare_at_price",
    "stock_quantity",
    "unit",
    "description",
    "is_active",
]


def export_products_to_excel(queryset=None):
    """Retourne un fichier .xlsx (bytes) listant les produits."""
    queryset = queryset if queryset is not None else Product.objects.select_related("category").all()

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Produits"
    ws.append(EXPORT_HEADERS)

    for product in queryset:
        ws.append(
            [
                product.sku,
                product.name,
                product.category.name if product.category else "",
                float(product.price),
                float(product.compare_at_price) if product.compare_at_price else None,
                product.stock_quantity,
                product.unit,
                product.description,
                "oui" if product.is_active else "non",
            ]
        )

    for i, header in enumerate(EXPORT_HEADERS, start=1):
        ws.column_dimensions[get_column_letter(i)].width = max(14, len(header) + 4)

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer


def import_products_from_excel(file_obj):
    """
    Lit un fichier .xlsx et cree/met a jour les produits (upsert par sku).
    Retourne un resume: {created, updated, errors: [...]}
    """
    wb = openpyxl.load_workbook(file_obj, data_only=True)
    ws = wb.active

    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return {"created": 0, "updated": 0, "errors": ["Fichier vide."]}

    header = [str(h).strip().lower() if h else "" for h in rows[0]]
    required = {"sku", "name", "price"}
    if not required.issubset(set(header)):
        return {
            "created": 0,
            "updated": 0,
            "errors": [f"Colonnes obligatoires manquantes: {required - set(header)}"],
        }

    col_index = {name: idx for idx, name in enumerate(header)}
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
            if "stock_quantity" in col_index and row[col_index["stock_quantity"]] is not None:
                defaults["stock_quantity"] = int(row[col_index["stock_quantity"]])
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
        except Exception as exc:  # noqa: BLE001
            errors.append(f"Ligne {row_number}: {exc}")

    return {"created": created, "updated": updated, "errors": errors}
