"""
LLM service - Groq-based interpretation of well log statistics.
"""
from config.config import config
from services.ai_service import AIService


def interpret_with_llm(well_id: int, well_name: str, curve_names: list, depth_min: float, depth_max: float):
    """
    Get statistics from AIService, then ask Groq LLM for a natural-language interpretation.
    Returns { statistics, interpretation } or raises if Groq is not configured or fails.
    """
    if not config.GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY is not set. Add it to your .env to use AI Interpretation.")

    stats = AIService.interpret(well_id, curve_names, depth_min, depth_max)
    if stats is None:
        return None

    prompt = _build_prompt(well_name, curve_names, depth_min, depth_max, stats)
    interpretation = _call_groq(prompt)
    return {
        "statistics": stats,
        "interpretation": interpretation,
    }


def _build_prompt(well_name: str, curve_names: list, depth_min: float, depth_max: float, stats: dict) -> str:
    """Build the prompt for the LLM."""
    summary = stats.get("summary", "No data.")
    insights_text = "\n".join(
        f"- {ins['curve']}: {ins['interpretation']} (min={ins['statistics']['min']}, max={ins['statistics']['max']}, mean={ins['statistics']['mean']}, std={ins['statistics']['std']}, n={ins['statistics']['count']})"
        for ins in stats.get("insights", [])
    )
    anomalies = stats.get("anomalies", [])
    anomalies_text = ""
    if anomalies:
        anomalies_text = "\nAnomalies (values beyond 2 standard deviations):\n" + "\n".join(
            f"- Depth {a['depth']:.2f}, {a['curve_name']}: value={a['value']:.4f}, mean={a['mean']:.4f} ({a['deviation']})"
            for a in anomalies[:20]
        )
    if len(anomalies) > 20:
        anomalies_text += f"\n... and {len(anomalies) - 20} more."

    return f"""You are an expert petrophysicist and well log analyst. Based on the following well log statistics, provide a concise geological and petrophysical interpretation for the interval.

Well: {well_name}
Depth range: {depth_min} to {depth_max}
Curves: {", ".join(curve_names)}

Summary statistics:
{summary}

Per-curve insights:
{insights_text}
{anomalies_text}

Write 2-4 short paragraphs: (1) overall lithology and formation character, (2) key curve meanings and what they suggest (e.g. GR for shale/sand, density for porosity), (3) any notable anomalies or zones of interest. Use clear, professional language. Do not repeat raw numbers excessively."""


def _call_groq(prompt: str) -> str:
    """Call Groq chat completion. Returns the assistant message content."""
    from groq import Groq

    client = Groq(api_key=config.GROQ_API_KEY)
    response = client.chat.completions.create(
        messages=[
            {
                "role": "system",
                "content": "You are an expert petrophysicist. Provide clear, concise well log interpretations based on the statistics given.",
            },
            {"role": "user", "content": prompt},
        ],
        model="llama-3.3-70b-versatile",
        temperature=0.3,
        max_tokens=1024,
    )
    if not response.choices or not response.choices[0].message.content:
        return "No response from model."
    return response.choices[0].message.content.strip()
