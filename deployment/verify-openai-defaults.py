"""Offline wire regression test; run with /opt/deeptutor-venv/bin/python.

Exercise real provider/SDK serialization against a mock HTTP transport. No API
key, external request, or settings change is needed.
"""

import asyncio
import json

import httpx
from openai import AsyncOpenAI

from deeptutor.services.llm.provider_core.openai_compat_provider import OpenAICompatProvider
from deeptutor.services.provider_registry import find_by_name


async def check(model, wire_api, streaming):
    captured = []

    def handle(request):
        body = json.loads(request.content)
        captured.append(body)
        if wire_api == "responses":
            result = {
                "id": "resp_test", "object": "response", "created_at": 0,
                "model": model, "status": "completed",
                "output": [{"id": "msg_test", "type": "message", "role": "assistant",
                            "status": "completed", "content": [
                                {"type": "output_text", "text": "OK", "annotations": []}]}],
                "usage": {"input_tokens": 1, "output_tokens": 1, "total_tokens": 2},
            }
            events = [
                {"type": "response.output_text.delta", "delta": "OK",
                 "item_id": "msg_test", "output_index": 0, "content_index": 0},
                {"type": "response.completed", "response": result},
            ]
        else:
            result = {
                "id": "chatcmpl_test", "object": "chat.completion", "created": 0,
                "model": model, "choices": [{"index": 0, "finish_reason": "stop",
                    "message": {"role": "assistant", "content": "OK"}}],
                "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
            }
            events = [{
                "id": "chatcmpl_test", "object": "chat.completion.chunk", "created": 0,
                "model": model, "choices": [{"index": 0, "finish_reason": "stop",
                    "delta": {"role": "assistant", "content": "OK"}}],
            }]
        if body.get("stream"):
            data = "".join(f"data: {json.dumps(event)}\n\n" for event in events)
            return httpx.Response(200, text=data + "data: [DONE]\n\n",
                                  headers={"content-type": "text/event-stream"})
        return httpx.Response(200, json=result)

    provider = OpenAICompatProvider(
        api_key="test-placeholder", api_base="https://example.invalid/v1",
        default_model=model, spec=find_by_name("openai"), provider_name="openai",
        wire_api=wire_api, configure_env=False,
    )
    await provider._client.close()
    provider._client = AsyncOpenAI(
        api_key="test-placeholder", base_url="https://example.invalid/v1", max_retries=0,
        http_client=httpx.AsyncClient(transport=httpx.MockTransport(handle)),
    )
    deltas = []

    async def on_delta(text):
        deltas.append(text)

    try:
        kwargs = {"messages": [{"role": "user", "content": "Reply OK"}],
                  "reasoning_effort": None, "temperature": 0.7}
        if streaming:
            response = await provider.chat_stream(**kwargs, on_content_delta=on_delta)
        else:
            response = await provider.chat(**kwargs)
        assert len(captured) == 1, f"Expected one request, got {len(captured)}"
        body = captured[0]
        assert "temperature" not in body, "temperature leaked into the API request"
        assert "reasoning" not in body, "reasoning must be left to the model default"
        assert "reasoning_effort" not in body, "reasoning effort must not be sent"
        assert body["model"] == model
        assert response.content == "OK", response.content
        assert response.finish_reason != "error"
        if streaming:
            assert "".join(deltas) == "OK", deltas
    finally:
        await provider._client.close()
    print(json.dumps({"model": model, "api": wire_api, "stream": streaming, "passed": True}))


async def main():
    for model in ("gpt-6.1-terra", "gpt-6-astra"):
        for wire_api in ("responses", "chat"):
            for streaming in (False, True):
                await check(model, wire_api, streaming)


if __name__ == "__main__":
    asyncio.run(main())
