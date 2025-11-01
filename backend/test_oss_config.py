#!/usr/bin/env python3
"""
Test script to verify OSS configuration and backend setup
"""

import os
import sys
import asyncio
from pathlib import Path

# Add the app directory to Python path
sys.path.insert(0, str(Path(__file__).parent))

def test_imports():
    """Test if all required modules can be imported"""
    print("🔍 Testing imports...")
    
    try:
        from app.config import settings
        print("✅ Config module imported successfully")
    except ImportError as e:
        print(f"❌ Failed to import config: {e}")
        return False
    
    try:
        from app.utils.storage_new import enhanced_storage
        print("✅ OSS storage module imported successfully")
    except ImportError as e:
        print(f"❌ Failed to import OSS storage: {e}")
        return False
    
    return True

def test_oss_config():
    """Test OSS configuration"""
    print("\n🔧 Testing OSS configuration...")
    
    try:
        from app.config import settings
        
        print(f"Environment: {settings.ENVIRONMENT}")
        print(f"OSS Access Key: {settings.OSS_ACCESS_KEY[:8]}..." if settings.OSS_ACCESS_KEY else "Not set")
        print(f"OSS Secret Key: {'Set' if settings.OSS_SECRET_KEY else 'Not set'}")
        print(f"OSS Endpoint: {settings.OSS_ENDPOINT}")
        print(f"OSS Bucket: {settings.OSS_BUCKET}")
        
        # Check if OSS is properly configured
        oss_configured = (
            settings.OSS_ACCESS_KEY and 
            settings.OSS_SECRET_KEY and 
            settings.OSS_ENDPOINT and 
            settings.OSS_BUCKET and
            settings.OSS_ACCESS_KEY != "your-oss-access-key" and
            settings.OSS_SECRET_KEY != "your-oss-secret-key" and
            not settings.OSS_ACCESS_KEY.startswith("your-") and
            not settings.OSS_SECRET_KEY.startswith("your-")
        )
        
        if oss_configured:
            print("✅ OSS configuration looks valid")
        else:
            print("⚠️  OSS configuration needs to be updated with real credentials")
        
        return oss_configured
        
    except Exception as e:
        print(f"❌ Error testing OSS config: {e}")
        return False

async def test_storage_initialization():
    """Test storage initialization"""
    print("\n💾 Testing storage initialization...")
    
    try:
        from app.utils.storage_new import enhanced_storage
        
        print(f"Storage type: {'Local' if enhanced_storage.use_local else 'OSS'}")
        print(f"Local directory: {enhanced_storage.local_dir}")
        
        if not enhanced_storage.use_local:
            print("✅ OSS storage initialized successfully")
        else:
            print("ℹ️  Using local storage (development mode or OSS not configured)")
        
        return True
        
    except Exception as e:
        print(f"❌ Error testing storage: {e}")
        return False

def test_file_structure():
    """Test if required files exist"""
    print("\n📁 Testing file structure...")
    
    required_files = [
        "app/main.py",
        "app/config.py", 
        "app/utils/storage_new.py",
        "requirements.txt",
        "env.production"
    ]
    
    all_exist = True
    for file_path in required_files:
        if os.path.exists(file_path):
            print(f"✅ {file_path}")
        else:
            print(f"❌ {file_path} - Missing")
            all_exist = False
    
    return all_exist

def test_api_structure():
    """Test API structure"""
    print("\n🌐 Testing API structure...")
    
    try:
        from app.api import api_router
        print("✅ API router imported successfully")
        
        # Check if routes are properly configured
        routes = [route.path for route in api_router.routes]
        print(f"Available routes: {len(routes)}")
        
        for route in routes[:5]:  # Show first 5 routes
            print(f"  - {route}")
        
        if len(routes) > 5:
            print(f"  ... and {len(routes) - 5} more")
        
        return True
        
    except Exception as e:
        print(f"❌ Error testing API structure: {e}")
        return False

async def main():
    """Main test function"""
    print("🚀 Starting backend configuration test...\n")
    
    tests = [
        ("File Structure", test_file_structure),
        ("Imports", test_imports),
        ("OSS Configuration", test_oss_config),
        ("Storage Initialization", test_storage_initialization),
        ("API Structure", test_api_structure),
    ]
    
    results = []
    
    for test_name, test_func in tests:
        try:
            if asyncio.iscoroutinefunction(test_func):
                result = await test_func()
            else:
                result = test_func()
            results.append((test_name, result))
        except Exception as e:
            print(f"❌ {test_name} failed with error: {e}")
            results.append((test_name, False))
    
    # Summary
    print("\n" + "="*50)
    print("📊 TEST SUMMARY")
    print("="*50)
    
    passed = 0
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{test_name}: {status}")
        if result:
            passed += 1
    
    print(f"\nPassed: {passed}/{len(results)} tests")
    
    if passed == len(results):
        print("🎉 All tests passed! Backend is ready for deployment.")
    else:
        print("⚠️  Some tests failed. Please check the configuration.")
    
    return passed == len(results)

if __name__ == "__main__":
    asyncio.run(main())
