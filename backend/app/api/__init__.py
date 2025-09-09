"""
API routes initialization
"""

from fastapi import APIRouter
from app.api import users, tasks, submissions, admin, notifications, learning_data, subscription, reviews, materials, tags, analytics

# Create main API router
api_router = APIRouter(prefix="/api/v1")

# Include all route modules
api_router.include_router(users.router, tags=["users"])
api_router.include_router(tasks.router, tags=["tasks"])
api_router.include_router(submissions.router, tags=["submissions"])
api_router.include_router(admin.router, tags=["admin"])
api_router.include_router(notifications.router, tags=["notifications"])
api_router.include_router(learning_data.router, tags=["learning"])
api_router.include_router(subscription.router, tags=["subscription"])
api_router.include_router(reviews.router, tags=["reviews"])
api_router.include_router(materials.router, tags=["materials"])
api_router.include_router(tags.router, tags=["tags"])
api_router.include_router(analytics.router, tags=["analytics"])