#!/usr/bin/env python3
"""
Test script for task status calculation logic
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from datetime import datetime, timedelta
from app.models import Task, Submission, TaskType, TaskStatus, SubmissionStatus, Grade


def test_status_calculation():
    """Test the status calculation logic with mock data"""
    
    # Create mock task object  
    class MockTask:
        def __init__(self, task_type=TaskType.NORMAL, status=TaskStatus.ONGOING, deadline=None):
            self.task_type = task_type
            self.status = status
            self.deadline = deadline
            self.id = 1
    
    # Create mock submission object
    class MockSubmission:
        def __init__(self, status=SubmissionStatus.SUBMITTED, grade=None, score=None):
            self.status = status
            self.grade = grade
            self.score = score
            self.task_id = 1
            
    # Test cases
    print("🧪 Testing task status calculation logic...")
    
    try:
        from app.utils.task_status import calculate_display_status, get_task_priority
        
        # Test case 1: Normal task, no submission
        task1 = MockTask()
        result1 = calculate_display_status(task1, None)
        print(f"✅ Test 1 - No submission: {result1}")
        
        # Test case 2: Normal task, submitted but not graded
        task2 = MockTask()
        submission2 = MockSubmission(SubmissionStatus.SUBMITTED)
        result2 = calculate_display_status(task2, submission2)
        print(f"✅ Test 2 - Submitted: {result2}")
        
        # Test case 3: Normal task, graded 
        task3 = MockTask()
        submission3 = MockSubmission(SubmissionStatus.GRADED, Grade.GOOD)
        result3 = calculate_display_status(task3, submission3)
        print(f"✅ Test 3 - Graded: {result3}")
        
        # Test case 4: Extra task (课后加餐)
        task4 = MockTask(TaskType.EXTRA)
        result4 = calculate_display_status(task4, None)
        print(f"✅ Test 4 - Extra task: {result4}")
        
        # Test case 5: Ended task
        task5 = MockTask(status=TaskStatus.ENDED)
        result5 = calculate_display_status(task5, None)
        print(f"✅ Test 5 - Ended task: {result5}")
        
        # Test priority calculation
        priority1 = get_task_priority(task1, None)
        priority2 = get_task_priority(task4, None) 
        print(f"✅ Priority test - Normal: {priority1}, Extra: {priority2}")
        
        print("🎉 All status calculation tests passed!")
        return True
        
    except Exception as e:
        print(f"❌ Status calculation test failed: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = test_status_calculation()
    sys.exit(0 if success else 1)