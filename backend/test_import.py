#!/usr/bin/env python3
"""
Test script to verify imports work correctly
"""

try:
    from app.utils.task_status import calculate_display_status, get_task_priority
    print("✅ Task status utilities imported successfully")
    
    from app.models import Task, Submission, TaskType, TaskStatus, SubmissionStatus, Grade
    print("✅ Models imported successfully") 
    
    from app.api.tasks import router
    print("✅ Tasks API router imported successfully")
    
    print("✅ All imports successful - ready for testing!")

except Exception as e:
    print(f"❌ Import error: {e}")
    import traceback
    traceback.print_exc()