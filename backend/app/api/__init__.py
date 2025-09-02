"""
API routes initialization
"""

from fastapi import APIRouter
from app.api import users, tasks, submissions, admin, notifications

# Create main API router
api_router = APIRouter(prefix="/api/v1")

# Include all route modules
api_router.include_router(users.router, tags=["users"])
api_router.include_router(tasks.router, tags=["tasks"])
api_router.include_router(submissions.router, tags=["submissions"])
api_router.include_router(admin.router, tags=["admin"])
api_router.include_router(notifications.router, tags=["notifications"])