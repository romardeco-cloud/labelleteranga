"""
Tests de non-regression pour la regle du "jour commercial" (periode de grace de 2h30 - voir
apps.pos.services.GRACE_CUTOFF) : une vente en caisse faite juste apres minuit, avant 2h30, doit compter
pour la VEILLE, jamais pour sa date calendaire brute - et ce de maniere IDENTIQUE dans tous les rapports
qui regroupent des ventes par jour (Tableau de bord, Clotures de caisse, rapport /reports/daily/, rapport
PDF "Detail par jour").

Ce fichier existe parce que ce meme bug (regroupement par date calendaire brute au lieu du jour commercial)
a ete introduit independamment, au fil du temps, a plusieurs endroits differents du code - la derniere fois
via un rapport PDF affichant une vente de 00h19 sous la mauvaise date. Si l'un de ces tests echoue un jour,
c'est tres probablement qu'une modification a reintroduit ce meme bug quelque part : avant de "corriger" le
test, verifier que le changement de comportement est vraiment voulu.
"""

import io
from datetime import date, datetime, time

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone

from apps.orders.models import Order
from apps.stores.models import PointOfSale


def _aware(d, h, m):
    return timezone.make_aware(datetime.combine(d, time(h, m)))


class BusinessDayGroupingTests(TestCase):
    """
    Scenario commun a tous les tests : une vente en caisse a 00h19 le lendemain (avant les 2h30 de grace)
    doit etre attribuee au jour commercial de la veille - jamais au lendemain, et jamais aux deux a la fois.
    """

    def setUp(self):
        self.store = PointOfSale.objects.create(name="Magasin Test")
        self.cashier_user = User.objects.create_user("caissiere-test")
        # Dates volontairement dans le passe (jamais "aujourd'hui") : le rapport PDF imprime aussi la date du
        # jour ("Edite le ..."), qui pourrait sinon coincider avec une des dates du test et fausser les
        # assertions fondees sur la position du texte dans le PDF.
        self.day_before = date(2024, 3, 15)
        self.day_after = date(2024, 3, 16)

        # Vente normale la veille, en pleine journee : doit toujours compter pour le 15/03.
        Order.objects.create(
            channel=Order.Channel.POS,
            status=Order.Status.PAID,
            payment_method=Order.PaymentMethod.CASH,
            customer_name="Client A",
            total_amount=5000,
            point_of_sale=self.store,
            cashier=self.cashier_user,
            paid_at=_aware(self.day_before, 16, 0),
        )
        # Vente "de grace" a 00h19 le 16/03 : doit compter pour le 15/03, pas pour le 16/03.
        Order.objects.create(
            channel=Order.Channel.POS,
            status=Order.Status.PAID,
            payment_method=Order.PaymentMethod.CASH,
            customer_name="Client B",
            total_amount=8000,
            point_of_sale=self.store,
            cashier=self.cashier_user,
            paid_at=_aware(self.day_after, 0, 19),
        )

    def test_dashboard_totals_period_aggregate(self):
        """Totals(15/03, 15/03, ...) doit inclure la vente de grace ; Totals(16/03, 16/03, ...) non."""
        from apps.reports.dashboard import Totals

        totals_before = Totals(self.day_before, self.day_before, None)
        totals_after = Totals(self.day_after, self.day_after, None)

        self.assertEqual(totals_before.sales, 13000)
        self.assertEqual(totals_before.orders_count, 2)
        self.assertEqual(totals_after.sales, 0)
        self.assertEqual(totals_after.orders_count, 0)

    def test_dashboard_chart_series_groups_by_business_day(self):
        """Le graphique du Tableau de bord (_series) doit afficher le point du 15/03 a 13000, et le 16/03 a 0."""
        from apps.reports.dashboard import _series

        points = _series("month", self.day_before, date(2024, 3, 1), date(2024, 3, 31), None)
        by_key = {p["key"]: p["revenue"] for p in points}

        self.assertEqual(by_key[self.day_before.isoformat()], 13000)
        self.assertEqual(by_key[self.day_after.isoformat()], 0)

    def test_expected_totals_global_closing(self):
        """_compute_expected_totals (Clotures de caisse, fermeture globale) doit suivre la meme regle."""
        from apps.reports.views import _compute_expected_totals

        totals_before = _compute_expected_totals(self.day_before, point_of_sale=self.store.id)
        totals_after = _compute_expected_totals(self.day_after, point_of_sale=self.store.id)

        self.assertEqual(totals_before[Order.PaymentMethod.CASH], 13000)
        self.assertEqual(totals_after[Order.PaymentMethod.CASH], 0)

    def test_daily_sales_view_groups_by_business_day(self):
        """DailySalesView (/api/reports/daily/) doit suivre la meme regle, meme si non utilisee cote frontend."""
        from rest_framework.test import APIRequestFactory, force_authenticate

        from apps.reports.views import DailySalesView

        admin = User.objects.create_superuser("admin-test", "admin@test.local", "x")
        # Fenetre large calculee depuis "aujourd'hui" (jamais un nombre de jours fixe) pour couvrir les dates
        # de test, volontairement dans le passe, quelle que soit la date reelle d'execution de ce test.
        days = (timezone.localdate() - self.day_before).days + 5
        factory = APIRequestFactory()
        request = factory.get(f"/api/reports/daily/?days={days}")
        force_authenticate(request, user=admin)
        response = DailySalesView.as_view()(request)
        by_day = {row["day"]: row for row in response.data}

        self.assertEqual(by_day[self.day_before]["revenue"], 13000)
        self.assertNotIn(self.day_after, by_day)

    def test_pdf_report_detail_par_jour(self):
        """
        Reproduit le signalement utilisateur d'origine : le tableau "Detail par jour" du rapport PDF doit
        afficher la vente de grace sous la veille (13 000 FCFA), jamais sous le lendemain.
        """
        import pdfplumber

        from apps.reports.pdf import sales_report_pdf

        start = date(2024, 3, 14)
        end = date(2024, 3, 17)
        response = sales_report_pdf(start, end, store=None)
        with pdfplumber.open(io.BytesIO(response.content)) as pdf:
            text = "\n".join(page.extract_text() or "" for page in pdf.pages)

        label_before = self.day_before.strftime("%d/%m/%Y")
        label_after = self.day_after.strftime("%d/%m/%Y")
        self.assertIn(label_before, text)
        self.assertIn(label_after, text)
        idx_before = text.index(label_before)
        idx_after = text.index(label_after)
        line_before = text[idx_before : idx_before + 60]
        line_after = text[idx_after : idx_after + 60]
        self.assertIn("13 000", line_before)
        self.assertNotIn("8 000", line_after)
