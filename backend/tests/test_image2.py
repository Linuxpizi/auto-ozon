"""
from openai import OpenAI
import base64

client = OpenAI(
    base_url="https://max.ai-zjl.cc/v1",
    api_key="sk-你的key",
    timeout=180.0,
)

response = client.images.generate(
    model="gpt-image-2",
    prompt="A detailed illustration explaining quantum entanglement, with two particles connected by a glowing line",
    n=1,
    size="1024x1024",
)

item = response.data[0]

if item.b64_json:
    with open("image.png", "wb") as f:
        f.write(base64.b64decode(item.b64_json))
    print("已保存 image.png")
elif item.url:
    print(item.url)
else:
    print(response)
"""

from openai import OpenAI
import base64

client = OpenAI(
    base_url="https://max.ai-zjl.cc/v1",
    api_key="sk-5d6e13cdcebe8a512a5277c1174380861ab73f522e39930d23b6fe3b32bf8251",
    timeout=180.0,
)

response = client.images.generate(
    model="gpt-image-2",
    prompt="A detailed illustration explaining quantum entanglement, with two particles connected by a glowing line",
    n=1,
    size="1024x1024",
)

item = response.data[0]

if item.b64_json:
    with open("image.png", "wb") as f:
        f.write(base64.b64decode(item.b64_json))
    print("已保存 image.png")
elif item.url:
    print(item.url)
else:
    print(response)
