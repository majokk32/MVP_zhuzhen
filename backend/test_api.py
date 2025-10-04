import requests
import json

try:
    # Get auth token first (you need to replace with actual token)
    headers = {"Content-Type": "application/json"}
    
    # Test learning overview API
    response = requests.get("http://localhost:8000/learning/overview", headers=headers)
    print("Status Code:", response.status_code)
    print("Response:")
    print(json.dumps(response.json(), indent=2, ensure_ascii=False))
    
except Exception as e:
    print("Error:", e)

