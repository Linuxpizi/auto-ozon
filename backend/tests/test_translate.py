if __name__ == "__main__":
    import base64
    from openai import OpenAI

    # --- 1. 准备图片的 Base64 编码 ---
    # 方式A：从本地文件读取
    image_path = "traffic_sign.webp"
    with open(image_path, "rb") as image_file:
        image_base64 = base64.b64encode(image_file.read()).decode("utf-8")

    client = OpenAI(
        api_key="sk-doqrBWEEmvG7rWKlbGEEhwv22Fjmjfx82Kca7vMxAWfROB3o",
        base_url="https://tokenhub.tencentmaas.com/v1",
    )

    response = client.chat.completions.create(
        model="deepseek-v4-pro",
        messages=[
            {"role": "user", "content": "你好，请介绍一下你自己"},
        ],
    )
    print(response.choices[0].message.content)
