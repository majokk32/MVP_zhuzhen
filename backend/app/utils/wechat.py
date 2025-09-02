"""
WeChat Mini Program integration utilities
"""

import httpx
from typing import Optional, Dict
from app.config import settings


class WeChatError(Exception):
    """WeChat API error"""
    pass


async def get_wechat_session(js_code: str) -> Dict[str, str]:
    """
    Exchange js_code for session_key and openid
    
    Args:
        js_code: The code from WeChat mini program wx.login()
    
    Returns:
        Dict containing openid, session_key, and optionally unionid
    
    Raises:
        WeChatError: If the API call fails
    """
    url = "https://api.weixin.qq.com/sns/jscode2session"
    params = {
        "appid": settings.WX_APPID,
        "secret": settings.WX_SECRET,
        "js_code": js_code,
        "grant_type": "authorization_code"
    }
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(url, params=params, timeout=10.0)
            response.raise_for_status()
            data = response.json()
            
            # Check for WeChat API errors
            if "errcode" in data and data["errcode"] != 0:
                raise WeChatError(f"WeChat API error: {data.get('errmsg', 'Unknown error')}")
            
            # Validate required fields
            if "openid" not in data:
                raise WeChatError("Missing openid in WeChat response")
            
            return {
                "openid": data["openid"],
                "session_key": data.get("session_key", ""),
                "unionid": data.get("unionid")  # May be None
            }
            
        except httpx.HTTPError as e:
            raise WeChatError(f"HTTP error when calling WeChat API: {str(e)}")
        except Exception as e:
            raise WeChatError(f"Unexpected error: {str(e)}")


async def decrypt_phone_number(session_key: str, encrypted_data: str, iv: str) -> Optional[str]:
    """
    Decrypt phone number from WeChat encrypted data
    
    Args:
        session_key: Session key from WeChat
        encrypted_data: Encrypted phone data
        iv: Initialization vector
    
    Returns:
        Decrypted phone number or None
    
    Note:
        This is a placeholder. Actual implementation requires
        proper decryption using AES with the session_key
    """
    # TODO: Implement WeChat data decryption
    # This requires additional libraries like pycryptodome
    # For MVP, we might ask users to input phone manually
    return None


def validate_wechat_config() -> bool:
    """
    Validate WeChat configuration
    
    Returns:
        True if WeChat config is properly set
    """
    return bool(settings.WX_APPID and settings.WX_SECRET)