"""
Rate Limiting & Abuse Prevention Middleware (rate_limiter.py)
------------------------------------------------------------
Protects the AutoHire API against:
1. DoS & Flooding attacks (repeated rapid calls).
2. Malicious LLM / Voice Token exhaustion (e.g. spamming /start-session or /test-voice).
3. Huge payload attacks.

Implements an efficient sliding-window in-memory rate limiter with automatic TTL cleanup,
and extracts real client IP behind reverse proxies (Render, Cloudflare, Nginx).
"""
import time
from collections import defaultdict
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

class RateLimiterMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        # Structure: ip -> list of timestamps
        self.request_history = defaultdict(list)
        self.last_cleanup = time.time()
        
        # Rate limits: (max_requests, window_seconds)
        self.limits = {
            "/api/start-session": (8, 60),      # Max 8 session creations per minute per IP
            "/api/start-session-cv": (6, 60),   # Max 6 CV uploads per minute per IP
            "/api/test-voice": (12, 60),        # Max 12 voice tests per minute per IP (ElevenLabs protection)
            "default_api": (80, 60),            # Max 80 general API calls per minute per IP
        }
        
        # Exempt endpoints (heartbeats, health checks, docs)
        self.exempt_paths = {
            "/ping", "/api/ping", "/health", "/api/health",
            "/docs", "/openapi.json", "/redoc", "/"
        }

    def _get_client_ip(self, request: Request) -> str:
        """Extracts client IP, prioritizing reverse-proxy headers."""
        cf_ip = request.headers.get("cf-connecting-ip")
        if cf_ip:
            return cf_ip.strip()
            
        x_forwarded_for = request.headers.get("x-forwarded-for")
        if x_forwarded_for:
            # First IP in list is original client
            return x_forwarded_for.split(",")[0].strip()
            
        return request.client.host if request.client else "127.0.0.1"

    def _cleanup_stale_records(self, current_time: float):
        """Periodically removes records older than 120 seconds to prevent memory growth."""
        if current_time - self.last_cleanup > 60:
            stale_cutoff = current_time - 120
            keys_to_delete = []
            for ip, timestamps in self.request_history.items():
                active = [t for t in timestamps if t > stale_cutoff]
                if active:
                    self.request_history[ip] = active
                else:
                    keys_to_delete.append(ip)
                    
            for k in keys_to_delete:
                del self.request_history[k]
            self.last_cleanup = current_time

    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path
        
        # Always allow exempt health check & monitoring endpoints
        if path in self.exempt_paths:
            return await call_next(request)

        # Apply rate limiting only to /api routes
        if path.startswith("/api"):
            client_ip = self._get_client_ip(request)
            now = time.time()
            self._cleanup_stale_records(now)

            # Determine limit rule for path
            max_req, window = self.limits.get(path, self.limits["default_api"])
            
            # Key combines IP and path bucket for granular tracking
            bucket_key = f"{client_ip}:{path if path in self.limits else 'api'}"
            timestamps = self.request_history[bucket_key]
            
            # Prune timestamps outside current window
            window_start = now - window
            active_timestamps = [t for t in timestamps if t > window_start]
            
            if len(active_timestamps) >= max_req:
                retry_after = int(window - (now - active_timestamps[0])) + 1
                return JSONResponse(
                    status_code=429,
                    content={
                        "error": "Too Many Requests",
                        "message": "Rate limit exceeded. Please wait a moment before sending more requests.",
                        "retry_after_seconds": max(1, retry_after)
                    },
                    headers={"Retry-After": str(max(1, retry_after))}
                )
                
            active_timestamps.append(now)
            self.request_history[bucket_key] = active_timestamps

        return await call_next(request)
