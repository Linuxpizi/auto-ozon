"""OpenAI image generate/edit smoke test.

Run manually when you need to verify the upstream image API:

    cd backend
    OPENAI_API_KEY=sk-xxx .venv/bin/python tests/test_image2.py

This file intentionally avoids doing network calls during pytest collection.
"""

import base64
import os
from pathlib import Path
from urllib.request import urlretrieve

import pytest
from openai import OpenAI

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - optional for direct script usage
    load_dotenv = None


if load_dotenv:
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")


BASE_URL = os.getenv("OPENAI_BASE_URL", "https://example.cc/v1")
API_KEY = os.getenv("OPENAI_API_KEY", "sk-")
IMAGE_MODEL = os.getenv("OPENAI_IMAGE_MODEL", "gpt-image-2")
OUTPUT_DIR = Path(__file__).resolve().parent / "outputs"


client = OpenAI(
    base_url=BASE_URL,
    api_key=API_KEY,
    timeout=180.0,
)


RUN_REAL_IMAGE_API_TESTS = os.getenv("RUN_OPENAI_IMAGE_TESTS") == "1"
pytestmark = pytest.mark.skipif(
    not RUN_REAL_IMAGE_API_TESTS,
    reason="Set RUN_OPENAI_IMAGE_TESTS=1 to run real OpenAI image API smoke tests.",
)


def save_image_response(response, output_name: str) -> Path:
    """Save the first image item returned by images.generate/images.edit."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_path = OUTPUT_DIR / output_name
    item = response.data[0]

    if item.b64_json:
        output_path.write_bytes(base64.b64decode(item.b64_json))
        print(f"已保存 {output_path}")
        return output_path

    if item.url:
        urlretrieve(item.url, output_path)
        print(f"已下载 {output_path}: {item.url}")
        return output_path

    raise RuntimeError(f"图片接口没有返回 b64_json 或 url: {response}")


def generate_source_image() -> Path:
    """Generate one source image and save it locally."""
    response = client.images.generate(
        model=IMAGE_MODEL,
        prompt="A detailed illustration explaining quantum entanglement, with two particles connected by a glowing line",
        n=1,
        size="1024x1024",
    )
    return save_image_response(response, "image_generate.png")


def edit_source_image(input_image_path: Path | None = None) -> Path:
    """client.images.edit test case: edit a local source image and save the result."""
    source_path = input_image_path or (OUTPUT_DIR / "image_generate.png")
    if not source_path.exists():
        source_path = generate_source_image()

    with source_path.open("rb") as image_file:
        response = client.images.edit(
            model=IMAGE_MODEL,
            image=image_file,
            prompt="删除图片中的文字",
            n=1,
            size="1024x1024",
            quality="high",
            response_format="b64_json",
        )

    return save_image_response(response, "image_edit.png")


def test_images_generate() -> None:
    """pytest smoke case for client.images.generate."""
    assert generate_source_image().exists()


def test_images_edit() -> None:
    """pytest smoke case for client.images.edit."""
    assert edit_source_image().exists()


if __name__ == "__main__":
    generated_path="traffic_sign.webp"
    # generated_path = generate_source_image()
    edited_path = edit_source_image(Path("traffic_sign.webp"))
    print(f"生成图: {generated_path}")
    print(f"编辑图: {edited_path}")