const axios = require('axios');

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const BASE = "https://www.tikwm.com/api/";
const CDN = "https://www.tikwm.com";
const HEAD = { "user-agent": UA, accept: "application/json, text/plain, */*", referer: "https://www.tikwm.com/" };

const toObj = (raw) => {
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    const a = raw.indexOf("{");
    const b = raw.lastIndexOf("}");
    if (a > -1 && b > a) {
      try { return JSON.parse(raw.slice(a, b + 1)); } catch {}
    }
  }
  return null;
};

const direct = async (target) => {
  try {
    const { data } = await axios.get(target, { timeout: 15000, headers: HEAD });
    return toObj(data);
  } catch { return null; }
};

const proxied = async (target) => {
  const gateways = [
    (u) => `https://api.cors.lol/?url=${encodeURIComponent(u)}`,
    (u) => `https://r.jina.ai/${u}`,
  ];
  for (const make of gateways) {
    try {
      const { data } = await axios.get(make(target), { timeout: 45000, headers: { "user-agent": UA } });
      const o = toObj(data);
      if (o && typeof o.code === "number") return o;
    } catch {}
  }
  return null;
};

const abs = (v) => (v ? (/^https?:/i.test(v) ? v : CDN + v) : null);

const tiktokDl = async (url) => {
  const start = Date.now();
  if (!url || !/(tiktok\.com|^\d+$)/i.test(String(url).trim())) {
    throw new Error("URL TikTok tidak valid.");
  }

  const endpoint = `${BASE}?url=${encodeURIComponent(String(url).trim())}&hd=1`;
  const json = (await direct(endpoint)) || (await proxied(endpoint));

  if (!json) throw new Error("Gagal terhubung ke server tikwm (timeout/rate-limit).");
  if (json.code !== 0 || !json.data) {
    throw new Error(json.msg || "Video tidak ditemukan atau bersifat privat.");
  }

  const d = json.data;
  return {
    status: true,
    time: `${Date.now() - start}ms`,
    result: {
      id: d.id,
      region: d.region,
      title: (d.title || "").trim(),
      duration: d.duration || 0,
      cover: abs(d.origin_cover || d.cover),
      author: {
        id: d.author?.id || null,
        username: d.author?.unique_id || null,
        nickname: d.author?.nickname || null,
        avatar: abs(d.author?.avatar),
      },
      music: {
        title: d.music_info?.title || null,
        mp3: abs(d.music_info?.play || d.music),
      },
      video: {
        nowatermark: abs(d.play),
        hd: abs(d.hdplay),
        watermark: abs(d.wmplay),
      },
      images: Array.isArray(d.images) && d.images.length ? d.images.map(abs) : [],
    },
  };
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).json({ status: false, error: "Missing 'url' parameter." });

  try {
    const result = await tiktokDl(targetUrl);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ status: false, error: error.message });
  }
};
