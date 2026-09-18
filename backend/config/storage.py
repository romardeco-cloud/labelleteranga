import io
import os
import uuid

import cloudinary
import cloudinary.uploader
import cloudinary.utils
from django.core.files.storage import Storage
from django.utils.deconstruct import deconstructible


@deconstructible
class CloudinaryMediaStorage(Storage):
    """
    Stockage des images (photos produits...) sur Cloudinary : le disque de Render est ephemere
    et efface les fichiers a chaque redeploiement. Active quand CLOUDINARY_URL est defini.

    Le nom stocke en base est l'identifiant public (ex. "products/riz_a1b2c3d4") : un suffixe
    aleatoire evite qu'une image en ecrase une autre portant le meme nom de fichier.
    """

    def _save(self, name, content):
        base = os.path.splitext(name.replace("\\", "/"))[0]
        public_id = f"{base}_{uuid.uuid4().hex[:8]}"
        content.seek(0)
        cloudinary.uploader.upload(
            io.BytesIO(content.read()),
            public_id=public_id,
            overwrite=False,
            resource_type="image",
        )
        return public_id

    def url(self, name):
        # f_auto / q_auto : Cloudinary sert le format et la qualite les plus legers pour chaque navigateur
        return cloudinary.utils.cloudinary_url(name, secure=True, fetch_format="auto", quality="auto")[0]

    def exists(self, name):
        return False  # les noms sont uniques (suffixe aleatoire)

    def delete(self, name):
        if name:
            try:
                cloudinary.uploader.destroy(name, resource_type="image")
            except Exception:  # noqa: BLE001 - ne jamais bloquer la suppression d'un produit
                pass

    def size(self, name):
        return 0

    def open(self, name, mode="rb"):
        raise NotImplementedError("Les images sont servies directement par Cloudinary.")
