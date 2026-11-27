"""Limiteur de débit en mémoire (processus) — anti brute-force login / FO."""

from __future__ import annotations

import time
from collections import defaultdict
from threading import Lock


class RateLimiter:
    """Fenêtre glissante simple ; suffisant pour un seul worker API MVP."""

    def __init__(self, *, max_calls: int, window_seconds: float) -> None:
        self.max_calls = max_calls
        self.window_seconds = window_seconds
        self._hits: dict[str, list[float]] = defaultdict(list)
        self._lock = Lock()

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        with self._lock:
            recent = [t for t in self._hits[key] if now - t < self.window_seconds]
            if len(recent) >= self.max_calls:
                self._hits[key] = recent
                return False
            recent.append(now)
            self._hits[key] = recent
            return True

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


# Login : 20 tentatives / minute / IP (tolère agents de test, freine le brute-force).
login_limiter = RateLimiter(max_calls=20, window_seconds=60.0)
