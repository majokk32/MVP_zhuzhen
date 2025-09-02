"""
Main application entry point
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
import os

from app.config import settings
from app.database import init_db
from app.api import api_router
from app.schemas import ResponseBase

# Create FastAPI app
app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="公考督学助手后端API",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Mount static files for local development
if os.path.exists("uploads"):
    app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


# Global exception handler
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        content=ResponseBase(
            code=exc.status_code,
            msg=exc.detail,
            data=None
        ).dict()
    )


@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    return JSONResponse(
        status_code=500,
        content=ResponseBase(
            code=500,
            msg=f"Internal server error: {str(exc)}",
            data=None
        ).dict()
    )


# Root endpoint
@app.get("/", response_model=ResponseBase)
async def root():
    return ResponseBase(
        data={
            "name": settings.PROJECT_NAME,
            "version": settings.VERSION,
            "docs": "/docs",
            "health": "/health"
        }
    )


# Health check endpoint
@app.get("/health", response_model=ResponseBase)
async def health_check():
    return ResponseBase(
        data={
            "status": "healthy",
            "database": "connected"  # In production, actually check DB connection
        }
    )


# Include API routes
app.include_router(api_router)


# Startup event
@app.on_event("startup")
async def startup_event():
    """Initialize database on startup"""
    await init_db()
    print(f"✅ {settings.PROJECT_NAME} v{settings.VERSION} started successfully!")
    print(f"📚 API Documentation: http://localhost:8000/docs")


# Shutdown event
@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    print(f"👋 {settings.PROJECT_NAME} shutting down...")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )