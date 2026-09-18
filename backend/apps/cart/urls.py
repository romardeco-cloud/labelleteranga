from django.urls import path

from .views import CartAddItemView, CartClearView, CartDetailView, CartUpdateItemView

urlpatterns = [
    path("<str:session_key>/", CartDetailView.as_view()),
    path("<str:session_key>/add/", CartAddItemView.as_view()),
    path("<str:session_key>/clear/", CartClearView.as_view()),
    path("<str:session_key>/items/<int:item_id>/", CartUpdateItemView.as_view()),
]
