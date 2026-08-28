export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Example:
    // /lyrics?artist=Daft%20Punk&song=Get%20Lucky
    if (url.pathname !== "/lyrics") {
      return new Response("Not found", { status: 404 });
    }

    const artist = url.searchParams.get("artist")?.trim();
    const song = url.searchParams.get("song")?.trim();
    const duration = url.searchParams.get("duration");

    if (!artist || !song) {
      return Response.json(
        {
          error: "Missing artist or song"
        },
        { status: 400 }
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
            a => a.toLowerCase() === cleaned.toLowerCase()
          )
        ) {
          artists.push(cleaned);
        }
      };

      addArtist(artist);

      // Also try artists separated by "-"
      if (artist.includes("-")) {
        artist
          .split(/\s*[-–—]\s*/)
          .forEach(addArtist);
      }

      for (const artistCandidate of artists) {
        const params = new URLSearchParams({
          artist_name: artistCandidate,
          track_name: song
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
          `https://lrclib.net/api/get?${params.toString()}`
        );

        if (!response.ok) continue;

        const data = await response.json();

        // -------------------------------
        // Synced lyrics
        // -------------------------------
        if (data?.syncedLyrics) {
          const lyrics = [];

          data.syncedLyrics
            .split("\n")
            .forEach(line => {
              const match = line.match(
                /^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/
              );

              if (!match) return;

              const minutes = Number(match[1]);
              const seconds = Number(match[2]);

              lyrics.push({
                seconds: minutes * 60 + seconds,
                lyrics: match[3]
              });
            });

          return Response.json({
            song: data.trackName,
            artist: data.artistName,
            lyrics,
            synced: true,
            fallback: false,
            duration: data.duration
          });
        }

        // -------------------------------
        // Plain lyrics
        // -------------------------------
        if (data?.plainLyrics) {
          const lyrics = data.plainLyrics
            .split("\n")
            .map(line => line.trim())
            .filter(line => line !== "")
            .map(line => ({
              lyrics: line
            }));

          return Response.json({
            song: data.trackName,
            artist: data.artistName,
            lyrics,
            synced: false,
            fallback: false,
            duration: data.duration
          });
        }
      }

      // --------------------------------
      // Textyl fallback
      // --------------------------------
      const query = encodeURIComponent(
        `${artist} ${song}`
      );

      const fallbackResponse = await fetch(
        `https://api.textyl.co/api/lyrics?q=${query}`
      );

      if (fallbackResponse.ok) {
        const lyrics = await fallbackResponse.json();

        lyrics.forEach(lyric => {
          lyric.seconds = `${lyric.seconds}.00`;
        });

        return Response.json({
          lyrics,
          fallback: true
        });
      }

      // Nothing found
      return Response.json(
        {
          error: "Lyrics not found"
        },
        { status: 404 }
      );

    } catch (error) {
      console.error(error);

      return Response.json(
        {
          error: "Lyrics service failed"
        },
        { status: 500 }
      );
    }
  }
};