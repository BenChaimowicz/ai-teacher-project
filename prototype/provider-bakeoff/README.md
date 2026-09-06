# PROTOTYPE — Provider bakeoff: DeepSeek vs Terra

Throwaway. Not the product.

**Question:** Does DeepSeek `deepseek-v4-pro` meet the grounded-synthesis quality bar well enough to be the primary Generator model, with OpenAI `gpt-5.6-terra` as the fallback?

DeepSeek stays primary unless Terra shows a clear, material quality advantage. The job is instructional writing from provided You.com-shaped excerpts plus strict JSON — not web search and not general-knowledge recall.

OpenRouter is the bakeoff phone line only. The spec still owns the `Generator` port.

```bash
export OPENROUTER_API_KEY=…
npm start
```

Writes `runs/latest.json` and `runs/latest.html`.
