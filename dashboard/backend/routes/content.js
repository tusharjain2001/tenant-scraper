const { Router } = require("express");
const openai     = require("../openai");
const supabase   = require("../supabase");

const router = Router();

const BRAND = `Prophives is a premium AI-powered property management platform built for Dubai, UK, and US real estate markets.
It helps property managers and letting agencies automate tenant communications, rent reminders, maintenance tickets, and owner reporting.
Website: https://prophives.com`;

// POST /api/content/generate-today
router.post("/generate-today", async (req, res) => {
  const { market = "dubai", theme } = req.body;

  try {
    const prompt = `You are a social media content strategist for a PropTech SaaS company.

Brand: ${BRAND}

Generate a LinkedIn/Instagram post for the ${market.toUpperCase()} property management market.
${theme ? `Theme: ${theme}` : "Pick a relevant theme (e.g. AI automation, tenant experience, rental market trends)."}

Return a JSON object with exactly these fields:
- caption: string (150–220 chars, engaging opening hook, 2-3 short paragraphs)
- image_prompt: string (detailed Midjourney/DALL-E prompt for a professional image matching the post)
- cta: string (1 sentence call to action with prophives.com)
- hashtags: array of 8–12 strings (no # prefix)
- market: "${market}"
- theme: string (the chosen theme)`;

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.8,
    });

    const content = JSON.parse(response.choices[0].message.content);

    // Store in Supabase
    const { data, error } = await supabase
      .from("content_briefs")
      .insert({
        market:       content.market || market,
        theme:        content.theme,
        caption:      content.caption,
        image_prompt: content.image_prompt,
        cta:          content.cta,
        hashtags:     content.hashtags,
        openai_model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ ok: true, brief: data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/content/history
router.get("/history", async (req, res) => {
  const { market, limit = "10" } = req.query;
  let q = supabase
    .from("content_briefs")
    .select("*")
    .order("generated_at", { ascending: false })
    .limit(parseInt(limit));

  if (market) q = q.eq("market", market);

  const { data, error } = await q;
  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true, briefs: data });
});

module.exports = router;
