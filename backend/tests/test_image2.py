import httpx
import json

# 中转地址和 API Key
api_key = "sk-NbjTmSnWZVCwLoOG0z0eVigYHtUv8sfSdjJCNtCDVnA7bnfI"

# 请求端点
url = "https://www.liyue888.top/v1"

# 请求头（注意：Authorization 使用 Bearer Token）
headers = {
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json",
}

# # 请求体（与 OpenAI API 完全一致）
# payload = {
#     "model": "gpt-image-2",          # 可尝试 "dall-e-2" 或 "gpt-image-2"，但后者可能不支持
#     "prompt": "A detailed illustration explaining quantum entanglement, with two particles connected by a glowing line",
#     "n": 1,
#     "size": "1024x1024",
# }

# # 发起 POST 请求（设置超时）
# with httpx.Client(timeout=30.0) as client:
#     response = client.post(url, headers=headers, json=payload)

# # 检查 HTTP 状态
# if response.status_code == 200:
#     data = response.json()
#     image_url = data["data"][0]["url"]
#     print("生成的图片 URL：", image_url)
# else:
#     print(f"请求失败，状态码：{response.status_code}")
#     print("响应内容：", response.text)

from openai import OpenAI

client = OpenAI(
    base_url="https://www.liyue888.top/v1",
    api_key=api_key,
)

# 列出所有可用模型
models = client.models.list()
for m in models.data:
    print(m.id)



from openai import OpenAI

client = OpenAI(
    base_url="https://www.liyue888.top/v1",
    api_key=api_key,
)

completion = client.chat.completions.create(
    model="gpt-image-2",
    messages=[
        {"role": "user", "content": "Generate an image of a quantum entanglement illustration with two particles connected by a glowing line."}
    ],
    # 可能还需要指定 response_format 为 "image"（如果中转支持）
    # 不过官方接口中，gpt-image-2 会自动判断输出图像，无需额外参数
)

# 打印返回内容，可能包含图像 URL 或 markdown 图片链接
print(completion.choices[0].message.content)