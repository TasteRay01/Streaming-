const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");

const manifest = {
  id: "community.globalp2p.authorized",
  version: "1.0.0",
  name: "Global P2P",
  description:
    "Global movies and series from authorized/public-domain sources.",
  resources: ["catalog", "meta", "stream"],
  types: ["movie", "series"],
  idPrefixes: ["ttarchive-"],
  catalogs: [
    {
      type: "movie",
      id: "global_movies",
      name: "🌍 Global Movies"
    },
    {
      type: "series",
      id: "global_series",
      name: "🌍 Global Series"
    }
  ]
};

const builder = new addonBuilder(manifest);

const ARCHIVE = "https://archive.org";

function isAnime(title = "") {
  return /\banime\b|\bjapanese\s+animation\b|\banimation\s+japanese\b/i.test(
    title
  );
}

async function archiveSearch() {
  const response = await axios.get(`${ARCHIVE}/advancedsearch.php`, {
    timeout: 12000,
    params: {
      q: "mediatype:movies",
      fl: "identifier,title,description,year,creator",
      rows: 100,
      page: 1,
      output: "json"
    }
  });

  return response.data?.response?.docs || [];
}

function makeMeta(item, type) {
  if (!item?.identifier || !item?.title) return null;

  const title = String(item.title);

  if (isAnime(title)) return null;

  return {
    id: `ttarchive-${item.identifier}`,
    type,
    name: title,
    description:
      typeof item.description === "string"
        ? item.description
        : "",
    releaseInfo: item.year
      ? String(item.year)
      : undefined
  };
}

builder.defineCatalogHandler(async (args) => {
  try {
    const docs = await archiveSearch();

    const metas = docs
      .map((item) => makeMeta(item, args.type))
      .filter(Boolean);

    return { metas };
  } catch (error) {
    console.error("Catalog error:", error.message);
    return { metas: [] };
  }
});

builder.defineMetaHandler(async (args) => {
  const id = String(args.id || "");

  if (!id.startsWith("ttarchive-")) {
    return { meta: null };
  }

  const identifier = id.replace("ttarchive-", "");

  try {
    const response = await axios.get(
      `${ARCHIVE}/metadata/${encodeURIComponent(identifier)}`,
      { timeout: 10000 }
    );

    const data = response.data;

    if (!data?.metadata) {
      return { meta: null };
    }

    const title = data.metadata.title || identifier;

    if (isAnime(title)) {
      return { meta: null };
    }

    return {
      meta: {
        id,
        type: args.type,
        name: title,
        description: data.metadata.description || ""
      }
    };
  } catch (error) {
    console.error("Meta error:", error.message);
    return { meta: null };
  }
});

async function getTorrentFiles(identifier) {
  const response = await axios.get(
    `${ARCHIVE}/metadata/${encodeURIComponent(identifier)}`,
    { timeout: 10000 }
  );

  const files = response.data?.files || [];

  return files.filter((file) =>
    String(file.name || "")
      .toLowerCase()
      .endsWith(".torrent")
  );
}

function extractInfoHash(file) {
  const name = String(file?.name || "");

  const match = name.match(/([a-f0-9]{40})/i);

  return match ? match[1].toLowerCase() : null;
}

builder.defineStreamHandler(async (args) => {
  const id = String(args.id || "");

  if (!id.startsWith("ttarchive-")) {
    return { streams: [] };
  }

  const identifier = id.replace("ttarchive-", "");

  try {
    const files = await getTorrentFiles(identifier);

    const streams = [];

    for (const file of files) {
      const infoHash = extractInfoHash(file);

      if (!infoHash) continue;

      streams.push({
        name: "⚡ Global P2P",
        title: `🌍 Public Domain / Authorized\n${file.name}`,
        infoHash
      });
    }

    return { streams };
  } catch (error) {
    console.error("Stream error:", error.message);
    return { streams: [] };
  }
});

const port = Number(process.env.PORT || 7000);

serveHTTP(builder.getInterface(), { port });

console.log(`Global P2P running on port ${port}`);
