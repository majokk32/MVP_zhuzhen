#!/usr/bin/env python3
"""
Simple test to verify OSS configuration without external dependencies
"""

import os
import json

def test_env_file():
    """Test environment configuration file"""
    print("🔍 Testing environment configuration...")
    
    env_file = "env.production"
    if not os.path.exists(env_file):
        print(f"❌ {env_file} not found")
        return False
    
    print(f"✅ {env_file} exists")
    
    # Read and parse the environment file
    with open(env_file, 'r') as f:
        content = f.read()
    
    # Check for OSS configuration
    oss_config = {
        'OSS_ACCESS_KEY': False,
        'OSS_SECRET_KEY': False,
        'OSS_ENDPOINT': False,
        'OSS_BUCKET': False
    }
    
    for line in content.split('\n'):
        if line.startswith('OSS_ACCESS_KEY='):
            value = line.split('=', 1)[1]
            oss_config['OSS_ACCESS_KEY'] = value and value != 'your-actual-oss-access-key'
        elif line.startswith('OSS_SECRET_KEY='):
            value = line.split('=', 1)[1]
            oss_config['OSS_SECRET_KEY'] = value and value != 'your-actual-oss-secret-key'
        elif line.startswith('OSS_ENDPOINT='):
            value = line.split('=', 1)[1]
            oss_config['OSS_ENDPOINT'] = bool(value)
        elif line.startswith('OSS_BUCKET='):
            value = line.split('=', 1)[1]
            oss_config['OSS_BUCKET'] = bool(value)
    
    print("\n📋 OSS Configuration Status:")
    for key, status in oss_config.items():
        status_icon = "✅" if status else "❌"
        print(f"  {status_icon} {key}: {'Configured' if status else 'Not configured'}")
    
    all_configured = all(oss_config.values())
    if all_configured:
        print("\n✅ OSS configuration is complete!")
    else:
        print("\n⚠️  OSS configuration needs to be updated with real credentials")
    
    return all_configured

def test_file_structure():
    """Test if all required files exist"""
    print("\n📁 Testing file structure...")
    
    required_files = [
        "app/main.py",
        "app/config.py", 
        "app/utils/storage_new.py",
        "app/utils/storage.py",
        "requirements.txt",
        "env.production",
        "docker-compose.production.yml",
        "Dockerfile.production",
        "nginx.conf",
        "deploy.sh",
        "setup-ssl.sh"
    ]
    
    all_exist = True
    for file_path in required_files:
        if os.path.exists(file_path):
            print(f"✅ {file_path}")
        else:
            print(f"❌ {file_path} - Missing")
            all_exist = False
    
    return all_exist

def test_deployment_scripts():
    """Test deployment scripts"""
    print("\n🚀 Testing deployment scripts...")
    
    scripts = ["deploy.sh", "setup-ssl.sh", "quick-setup.sh"]
    
    for script in scripts:
        if os.path.exists(script):
            # Check if script is executable
            if os.access(script, os.X_OK):
                print(f"✅ {script} (executable)")
            else:
                print(f"⚠️  {script} (not executable)")
        else:
            print(f"❌ {script} - Missing")
    
    return True

def test_oss_storage_code():
    """Test OSS storage implementation"""
    print("\n💾 Testing OSS storage implementation...")
    
    storage_file = "app/utils/storage_new.py"
    if not os.path.exists(storage_file):
        print(f"❌ {storage_file} not found")
        return False
    
    with open(storage_file, 'r') as f:
        content = f.read()
    
    # Check for OSS-related code
    oss_checks = [
        ('import oss2', 'OSS2 import'),
        ('oss2.Auth', 'OSS authentication'),
        ('oss2.Bucket', 'OSS bucket creation'),
        ('put_object', 'OSS upload method'),
        ('delete_object', 'OSS delete method')
    ]
    
    all_found = True
    for check, description in oss_checks:
        if check in content:
            print(f"✅ {description}")
        else:
            print(f"❌ {description} - Not found")
            all_found = False
    
    return all_found

def main():
    """Main test function"""
    print("🚀 Starting simple backend configuration test...\n")
    
    tests = [
        ("File Structure", test_file_structure),
        ("Environment Configuration", test_env_file),
        ("Deployment Scripts", test_deployment_scripts),
        ("OSS Storage Implementation", test_oss_storage_code),
    ]
    
    results = []
    
    for test_name, test_func in tests:
        try:
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
        print("🎉 All configuration tests passed! Ready for deployment.")
        print("\n📋 Next steps:")
        print("1. Update OSS credentials in env.production")
        print("2. Run: ./deploy.sh aliyun")
        print("3. Test the API endpoints")
    else:
        print("⚠️  Some tests failed. Please check the configuration.")
    
    return passed == len(results)

if __name__ == "__main__":
    main()
