"""Exceptions métier au format §6 `{detail, code}`."""

from fastapi import status


class ApiError(Exception):
    def __init__(self, status_code: int, detail: str, code: str) -> None:
        self.status_code = status_code
        self.detail = detail
        self.code = code


def not_found(detail: str, code: str = "NOT_FOUND") -> ApiError:
    return ApiError(status.HTTP_404_NOT_FOUND, detail, code)


def conflict(detail: str, code: str = "CONFLICT") -> ApiError:
    return ApiError(status.HTTP_409_CONFLICT, detail, code)


def bad_request(detail: str, code: str = "BAD_REQUEST") -> ApiError:
    return ApiError(status.HTTP_400_BAD_REQUEST, detail, code)


def forbidden(detail: str, code: str = "FORBIDDEN") -> ApiError:
    return ApiError(status.HTTP_403_FORBIDDEN, detail, code)
