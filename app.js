const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

export default {
  async fetch(request) {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    const url = new URL(request.url);

    if (url.pathname !== "/lyrics") {
      return new Response("Not found", {
        status: 404,
        headers: CORS_HEADERS,
      });
    }

    const artist = url.searchParams.get("artist")?.trim();
    const song = url.searchParams.get("song")?.trim();
    const duration = url.searchParams.get("duration");

    if (!artist || !song) {
      return jsonResponse(
        {
          error: "Missing artist or song",
        },
        400
      );
    }

    try {
      // --------------------------------
      // Try LRCLIB
      // --------------------------------

      const artists = [];

      const addArtist = (value) => {
        if (!value) return;

        const cleaned = value.trim();

        if (
          cleaned &&
          !artists.some(
            (a) => a.toLowerCase() === cleaned.toLowerCase()
          )
        ) {
          artists.push(cleaned);
        }
      };

      addArtist(artist);

      // Also try artists separated by -, – or —
      if (/[-–—]/.test(artist)) {
        artist
          .split(/\s*[-–—]\s*/)
          .forEach(addArtist);
      }

      for (const artistCandidate of artists) {
        const params = new URLSearchParams({
          artist_name: artistCandidate,
          track_name: song,
        });

        if (
          duration &&
          Number.isFinite(Number(duration)) &&
          Number(duration) > 0
        ) {
          params.set(
            "duration",
            String(Math.round(Number(duration)))
          );
        }

        const response = await fetch(
          `https://lrclib.net/api/get?${params.toString()}`,
          {
            headers: {
              Accept: "application/json",
              "User-Agent": "LyricsWorker/1.0",
            },
          }
        );

        if (!response.ok) {
          continue;
        }

        const data = await response.json();

        // --------------------------------
        // Synced lyrics
        // --------------------------------

        if (data?.syncedLyrics) {
          const lyrics = [];

          data.syncedLyrics
            .split("\n")
            .forEach((line) => {
              const match = line.match(
                /^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/
              );

              if (!match) return;

              const minutes = Number(match[1]);
              const seconds = Number(match[2]);

              lyrics.push({
                seconds: minutes * 60 + seconds,
                lyrics: match[3].trim(),
              });
            });

          return jsonResponse({
            song: data.trackName,
            artist: data.artistName,
            lyrics,
            synced: true,
            fallback: false,
            duration: data.duration,
          });
        }

        // --------------------------------
        // Plain lyrics
        // --------------------------------

        if (data?.plainLyrics) {
          const lyrics = data.plainLyrics
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line !== "")
            .map((line) => ({
              lyrics: line,
            }));

          return jsonResponse({
            song: data.trackName,
            artist: data.artistName,
            lyrics,
            synced: false,
            fallback: false,
            duration: data.duration,
          });
        }
      }

      // --------------------------------
      // Textyl fallback
      // --------------------------------

      const query = encodeURIComponent(`${artist} ${song}`);

      const fallbackResponse = await fetch(
        `https://api.textyl.co/api/lyrics?q=${query}`,
        {
          headers: {
            Accept: "application/json",
          },
        }
      );

      if (fallbackResponse.ok) {
        const lyrics = await fallbackResponse.json();

        if (Array.isArray(lyrics)) {
          lyrics.forEach((lyric) => {
            if (lyric.seconds !== undefined) {
              lyric.seconds = Number(lyric.seconds);
            }
          });
        }

        return jsonResponse({
          lyrics,
          fallback: true,
        });
      }

      return jsonResponse(
        {
          error: "Lyrics not found",
        },
        404
      );
    } catch (error) {
      console.error("Lyrics worker error:", error);

      return jsonResponse(
        {
          error: "Lyrics service failed",
        },
        500
      );
    }
  },
};