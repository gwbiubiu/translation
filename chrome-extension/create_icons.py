"""运行一次即可生成插件所需图标：python create_icons.py"""
import os
import struct
import zlib


def make_png(size: int, r: int, g: int, b: int) -> bytes:
    def chunk(tag: bytes, data: bytes) -> bytes:
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    raw = b"".join(b"\x00" + bytes([r, g, b] * size) for _ in range(size))
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"IEND", b"")
    )


os.makedirs("icons", exist_ok=True)
for size in [16, 48, 128]:
    with open(f"icons/icon{size}.png", "wb") as f:
        f.write(make_png(size, 26, 115, 232))  # #1a73e8
    print(f"  icons/icon{size}.png")

print("完成！")
