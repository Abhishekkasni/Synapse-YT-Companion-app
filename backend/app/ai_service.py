import os
import httpx


async def generate_viral_titles(current_title: str) -> list[str]:
    """
    Uses Groq's free API (Llama 3.3 70B) to generate 3 viral YouTube titles.

    Get a free key at: https://console.groq.com
    Add to .env:  GROQ_API_KEY=gsk_...

    Groq free tier is very generous — 14,400 requests/day, 30 req/min.
    """
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return [
            "Error: GROQ_API_KEY is missing from .env",
            "Get a free key at console.groq.com",
            "Then restart the server",
        ]

    prompt = (
        f"You are a YouTube growth expert. "
        f"Give me exactly 3 viral, click-worthy YouTube titles for a video currently titled: '{current_title}'. "
        f"Return ONLY the 3 titles separated by a pipe character | with no extra text, numbering, or explanation. "
        f"Example format: Title One | Title Two | Title Three"
    )

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "llama-3.3-70b-versatile",
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.9,
                    "max_tokens": 200,
                },
            )
            response.raise_for_status()
            data = response.json()
            raw_text = data["choices"][0]["message"]["content"].strip()

        titles = [t.strip() for t in raw_text.split("|")]

        # Fallback if model ignores the pipe format
        if len(titles) < 3:
            return [
                f"You Won't Believe What Happened with {current_title}",
                f"The Truth About {current_title} Nobody Tells You",
                f"I Tried {current_title} for 30 Days — Here's What Happened",
            ]

        return titles[:3]

    except Exception as e:
        print(f"[AI ERROR] {e}")
        return [
            f"Error: {str(e)[:60]}",
            "Check your GROQ_API_KEY in .env",
            "Check server logs for details",
        ]