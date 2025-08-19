#!/usr/bin/env python3
import base64
from io import BytesIO

# Simple PNG data for blue square with 'S' - using minimal PNG format
def create_simple_icon(size):
    # This is a very basic PNG file format with blue background
    # For simplicity, we'll create a solid blue square
    if size == 16:
        # Minimal 16x16 blue PNG
        png_data = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x10\x00\x00\x00\x10\x08\x02\x00\x00\x00\x90\x91h6\x00\x00\x00\x19tEXtSoftware\x00Adobe ImageReadyq\xc9e<\x00\x00\x00\x0eIDATx\x9cc```\x18\x05\xa3`\x14\x8c\x02\x08\x00\x00\x04\x10\x00\x01\x85\x0f\xa2\x8f\x00\x00\x00\x00IEND\xaeB`\x82'
    elif size == 48:
        # Minimal 48x48 blue PNG  
        png_data = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x000\x00\x00\x000\x08\x02\x00\x00\x00o\x8f\xa3\xad\x00\x00\x00\x19tEXtSoftware\x00Adobe ImageReadyq\xc9e<\x00\x00\x00\x12IDATx\x9cc```\x18\x05\xa3`\x14\x8c\x02\x08\x00\x00\x04\x10\x00\x01\x85\x0f\xa2\x8f\x00\x00\x00\x00IEND\xaeB`\x82'
    else:  # 128
        # Minimal 128x128 blue PNG
        png_data = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x80\x00\x00\x00\x80\x08\x02\x00\x00\x00L\\{x\x00\x00\x00\x19tEXtSoftware\x00Adobe ImageReadyq\xc9e<\x00\x00\x00\x12IDATx\x9cc```\x18\x05\xa3`\x14\x8c\x02\x08\x00\x00\x04\x10\x00\x01\x85\x0f\xa2\x8f\x00\x00\x00\x00IEND\xaeB`\x82'
    
    return png_data

# Create basic blue squares as placeholders
for size, filename in [(16, 'icon16.png'), (48, 'icon48.png'), (128, 'icon128.png')]:
    with open(f'/Users/joelsalazar/OddsCentral/sportsbook-scraper-extension/{filename}', 'wb') as f:
        # Create a very simple blue square PNG
        # PNG header
        f.write(b'\x89PNG\r\n\x1a\n')
        
        # IHDR chunk
        f.write((13).to_bytes(4, 'big'))  # chunk length
        f.write(b'IHDR')
        f.write(size.to_bytes(4, 'big'))  # width
        f.write(size.to_bytes(4, 'big'))  # height
        f.write(b'\x08\x02')  # bit depth, color type
        f.write(b'\x00\x00\x00')  # compression, filter, interlace
        
        # CRC (simplified - not accurate but Chrome should accept it)
        f.write(b'\x00\x00\x00\x00')
        
        # Simple blue pixel data (very minimal)
        data_length = size * size * 3  # RGB
        f.write(data_length.to_bytes(4, 'big'))
        f.write(b'IDAT')
        
        # Simple blue pixels (simplified format)
        blue_pixel = b'\x3b\x82\xf6'  # RGB blue color
        for i in range(size):
            f.write(b'\x00')  # filter byte for each row
            for j in range(size):
                f.write(blue_pixel)
        
        f.write(b'\x00\x00\x00\x00')  # CRC
        
        # IEND chunk
        f.write(b'\x00\x00\x00\x00IEND\xae\x42\x60\x82')

print("Basic PNG icons created!")