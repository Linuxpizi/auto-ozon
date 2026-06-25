import base64
from openai import OpenAI

# --- 1. 准备图片的 Base64 编码 ---
# 方式A：从本地文件读取
image_path = "traffic_sign.webp"
with open(image_path, "rb") as image_file:
    image_base64 = base64.b64encode(image_file.read()).decode("utf-8")

# 方式B：从 URL 下载图片（需先下载到本地，再按方式A处理）
# import urllib.request
# urllib.request.urlretrieve("https://c7.alamy.com/comp/xxx.jpg", "temp.jpg")

# --- 2. 初始化 OpenAI 客户端 ---
client = OpenAI(
    base_url="http://localhost:11434/v1",
    api_key="ollama",  # 任意字符串即可
)

# --- 3. 发送请求 ---
response = client.chat.completions.create(
    model="translategemma:12b",
    messages=[
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": "翻译成俄罗斯语(Ru)",  # 翻译指令
                },
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"},
                },
            ],
        }
    ],
    max_tokens=200,
)

# --- 4. 输出结果 ---
print(response.choices[0].message.content)
