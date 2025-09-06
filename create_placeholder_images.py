#!/usr/bin/env python3
"""
创建小程序需要的占位图片
"""

from PIL import Image, ImageDraw, ImageFont
import os

def create_placeholder_image(size, text, filename, bg_color="#f5f5f5", text_color="#999999"):
    """创建占位图片"""
    # 创建图片
    img = Image.new('RGB', size, bg_color)
    draw = ImageDraw.Draw(img)
    
    # 尝试使用系统字体
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Arial.ttf", 20)
    except:
        try:
            font = ImageFont.truetype("arial.ttf", 20)
        except:
            font = ImageFont.load_default()
    
    # 计算文本位置（居中）
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    x = (size[0] - text_width) // 2
    y = (size[1] - text_height) // 2
    
    # 绘制文本
    draw.text((x, y), text, fill=text_color, font=font)
    
    # 保存图片
    img.save(filename)
    print(f"✅ 创建图片: {filename}")

def main():
    """主函数"""
    # 确保目录存在
    images_dir = "/Users/majokk/ZhuzhenMVP/MVP_zhuzhen/miniprogram/assets/images"
    os.makedirs(images_dir, exist_ok=True)
    
    # 创建默认头像 (正方形)
    create_placeholder_image(
        size=(120, 120),
        text="头像",
        filename=os.path.join(images_dir, "default-avatar.png"),
        bg_color="#e6e6e6",
        text_color="#666666"
    )
    
    # 创建空状态图片 (长方形)
    create_placeholder_image(
        size=(200, 150),
        text="暂无任务",
        filename=os.path.join(images_dir, "empty-task.png"),
        bg_color="#fafafa",
        text_color="#cccccc"
    )
    
    # 创建logo占位图
    create_placeholder_image(
        size=(100, 100),
        text="LOGO",
        filename=os.path.join(images_dir, "logo.png"),
        bg_color="#667eea",
        text_color="#ffffff"
    )
    
    print("\n🎉 所有占位图片创建完成！")

if __name__ == "__main__":
    main()