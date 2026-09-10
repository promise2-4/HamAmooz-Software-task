from rest_framework.permissions import SAFE_METHODS, BasePermission


class IsAuthenticatedReadOnlyOrAdmin(BasePermission):
    message = "Administrator access is required for this operation."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return True
        return request.user.is_staff
