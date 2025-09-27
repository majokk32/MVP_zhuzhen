#!/usr/bin/env python3
"""Generate test JWT token for API testing"""

import sys
import os
sys.path.append('.')

from app.auth import create_access_token

# Create token for user ID 1
token_data = {"sub": "1"}  # user ID
token = create_access_token(token_data)
print(f"Bearer {token}")