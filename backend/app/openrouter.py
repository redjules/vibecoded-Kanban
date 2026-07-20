import os

import httpx

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
OPENROUTER_MODEL = "openai/gpt-oss-120b"
REQUEST_TIMEOUT_SECONDS = 20.0


class OpenRouterError(Exception):
    """A provider failure that can be safely shown to an authenticated user."""


class OpenRouterClient:
    def __init__(
        self,
        api_key: str | None = None,
        client: httpx.Client | None = None,
    ) -> None:
        self.api_key = api_key or os.environ.get("OPENROUTER_API_KEY")
        self.client = client or httpx.Client(
            base_url=OPENROUTER_BASE_URL,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )

    def close(self) -> None:
        self.client.close()

    def complete(self, prompt: str) -> str:
        if not self.api_key:
            raise OpenRouterError("AI is not configured on this server.")

        try:
            response = self.client.post(
                "/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={
                    "model": OPENROUTER_MODEL,
                    "messages": [{"role": "user", "content": prompt}],
                },
            )
            response.raise_for_status()
            payload = response.json()
            content = payload["choices"][0]["message"]["content"]
        except httpx.TimeoutException as error:
            raise OpenRouterError("The AI provider timed out. Try again.") from error
        except httpx.HTTPStatusError as error:
            raise OpenRouterError("The AI provider rejected the request.") from error
        except (KeyError, TypeError, ValueError) as error:
            raise OpenRouterError("The AI provider returned an invalid response.") from error

        if not isinstance(content, str) or not content.strip():
            raise OpenRouterError("The AI provider returned an empty response.")
        return content