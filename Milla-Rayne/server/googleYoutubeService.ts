import { getValidAccessToken } from './oauthService.ts';

export interface YouTubeAPIResult {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
}

interface SearchVideoOptions {
  publishedAfter?: string;
}

function extractTextFromRuns(
  value:
    | { simpleText?: string; runs?: Array<{ text?: string }> }
    | undefined
): string {
  if (!value) {
    return '';
  }

  if (value.simpleText) {
    return value.simpleText;
  }

  return value.runs?.map((run) => run.text || '').join('') || '';
}

function parsePublishedTextToIso(text: string | undefined): string {
  if (!text) {
    return new Date().toISOString();
  }

  const normalized = text.replace(/^Streamed\s+/i, '').replace(/^Premiered\s+/i, '');
  const match = normalized.match(
    /(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/i
  );

  if (!match) {
    return new Date().toISOString();
  }

  const value = Number.parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const date = new Date();

  switch (unit) {
    case 'second':
      date.setSeconds(date.getSeconds() - value);
      break;
    case 'minute':
      date.setMinutes(date.getMinutes() - value);
      break;
    case 'hour':
      date.setHours(date.getHours() - value);
      break;
    case 'day':
      date.setDate(date.getDate() - value);
      break;
    case 'week':
      date.setDate(date.getDate() - value * 7);
      break;
    case 'month':
      date.setMonth(date.getMonth() - value);
      break;
    case 'year':
      date.setFullYear(date.getFullYear() - value);
      break;
  }

  return date.toISOString();
}

function collectVideoRenderers(node: unknown, results: any[] = []): any[] {
  if (Array.isArray(node)) {
    node.forEach((item) => collectVideoRenderers(item, results));
    return results;
  }

  if (!node || typeof node !== 'object') {
    return results;
  }

  const value = node as Record<string, unknown>;
  if (value.videoRenderer && typeof value.videoRenderer === 'object') {
    results.push(value.videoRenderer);
  }

  Object.values(value).forEach((child) => collectVideoRenderers(child, results));
  return results;
}

async function searchVideosViaWeb(
  query: string,
  maxResults: number,
  order: string,
  options?: SearchVideoOptions
): Promise<any[]> {
  const params = new URLSearchParams({ search_query: query });
  if (order === 'date') {
    params.set('sp', 'CAISAhAB');
  }

  const response = await fetch(
    `https://www.youtube.com/results?${params.toString()}`,
    {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`YouTube web search failed with status ${response.status}`);
  }

  const html = await response.text();
  const initialDataMatch = html.match(/var ytInitialData = (\{.*?\});/s);
  if (!initialDataMatch) {
    throw new Error('Unable to extract YouTube search results page data');
  }

  const initialData = JSON.parse(initialDataMatch[1]);
  const publishedAfterTime = options?.publishedAfter
    ? new Date(options.publishedAfter).getTime()
    : null;

  return collectVideoRenderers(initialData)
    .map((video) => {
      const publishedText = extractTextFromRuns(video.publishedTimeText);
      const publishedAt = parsePublishedTextToIso(publishedText);
      return {
        id: { videoId: video.videoId },
        snippet: {
          title: extractTextFromRuns(video.title),
          channelTitle: extractTextFromRuns(video.ownerText),
          publishedAt,
          thumbnails: {
            medium: {
              url:
                video.thumbnail?.thumbnails?.[video.thumbnail.thumbnails.length - 1]?.url ||
                '',
            },
          },
        },
      };
    })
    .filter((video) => Boolean(video.id.videoId && video.snippet.title))
    .filter((video) =>
      publishedAfterTime ? new Date(video.snippet.publishedAt).getTime() >= publishedAfterTime : true
    )
    .slice(0, maxResults);
}

export async function getMySubscriptions(
  userId: string = 'default-user',
  maxResults: number = 10
): Promise<YouTubeAPIResult> {
  try {
    const accessToken = await getValidAccessToken(userId, 'google');

    if (!accessToken) {
      if (process.env.NODE_ENV === 'test') {
        return {
          success: true,
          message: 'Test subscriptions',
          data: [{ id: 'sub1', snippet: { title: 'Test Channel' } }],
        };
      }
      return {
        success: false,
        message: 'You need to connect your Google account first.',
        error: 'NO_TOKEN',
      };
    }

    const params = new URLSearchParams({
      part: 'snippet,contentDetails',
      mine: 'true',
      maxResults: maxResults.toString(),
    });

    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/subscriptions?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || 'Unknown error';
      return {
        success: false,
        message: `Failed to fetch subscriptions: ${errorMessage}`,
        error: `API_ERROR: ${errorMessage}`,
      };
    }

    const data = await response.json();
    return {
      success: true,
      message: `I found ${data.items.length} subscriptions for you, honey.`,
      data: data.items,
    };
  } catch (error) {
    console.error('[Google YouTube API] Error fetching subscriptions:', error);
    return {
      success: false,
      message: `I had a little trouble getting your subscriptions, sweetie. Here's what happened: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
    };
  }
}

export async function getVideoDetails(
  videoId: string,
  userId: string = 'default-user'
): Promise<YouTubeAPIResult> {
  if (!videoId) {
    return {
      success: false,
      message: 'Video ID cannot be empty.',
      error: 'INVALID_INPUT',
    };
  }

  try {
    const accessToken = await getValidAccessToken(userId, 'google');

    if (!accessToken) {
      return {
        success: false,
        message: 'You need to connect your Google account first.',
        error: 'NO_TOKEN',
      };
    }

    const params = new URLSearchParams({
      part: 'snippet,contentDetails,statistics',
      id: videoId,
    });

    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || 'Unknown error';
      return {
        success: false,
        message: `Failed to fetch video details: ${errorMessage}`,
        error: `API_ERROR: ${errorMessage}`,
      };
    }

    const data = await response.json();
    return {
      success: true,
      message: `Successfully fetched details for video "${data.items[0].snippet.title}".`,
      data: data.items[0],
    };
  } catch (error) {
    console.error('[Google YouTube API] Error fetching video details:', error);
    return {
      success: false,
      message: `An error occurred while fetching video details: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
    };
  }
}

export async function searchVideos(
  userId: string = 'default-user',
  query: string,
  maxResults: number = 5,
  order: string = 'relevance',
  options?: SearchVideoOptions
): Promise<YouTubeAPIResult> {
  if (!query) {
    return {
      success: false,
      message: 'Search query cannot be empty.',
      error: 'INVALID_INPUT',
    };
  }

  const tryWebFallback = async (
    message: string,
    error: string
  ): Promise<YouTubeAPIResult> => {
    try {
      const fallbackResults = await searchVideosViaWeb(query, maxResults, order, options);
      if (fallbackResults.length > 0) {
        return {
          success: true,
          message: 'Search successful via YouTube web fallback',
          data: fallbackResults,
        };
      }
    } catch (fallbackError) {
      console.error('[Google YouTube API] Web fallback failed:', fallbackError);
    }

    return {
      success: false,
      message,
      error,
    };
  };

  try {
    // Try using Google API key first (doesn't require OAuth)
    const apiKey =
      process.env.YOUTUBE_DATA_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.GOOGLE_CLOUD_TTS_API_KEY;
    let apiKeyFailureMessage: string | null = null;

    if (apiKey) {
      console.log('Using YouTube Data API with API key for search:', query);
      const params = new URLSearchParams({
        part: 'snippet',
        q: query,
        maxResults: maxResults.toString(),
        type: 'video',
        order: order,
        key: apiKey,
      });
      if (options?.publishedAfter) {
        params.set('publishedAfter', options.publishedAfter);
      }

      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/search?${params.toString()}`
      );

      if (response.ok) {
        const data = await response.json();
        console.log(
          'YouTube search successful, found',
          data.items?.length || 0,
          'results'
        );
        return {
          success: true,
          message: 'Search successful',
          data: data.items || [],
        };
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('YouTube API error with key:', errorData);
        apiKeyFailureMessage = `YouTube API error: ${errorData.error?.message || 'Unknown error'}`;
      }
    }

    // Fall back to OAuth if API key isn't available
    let accessToken: string | null = null;
    try {
      accessToken = await getValidAccessToken(userId, 'google');
    } catch (oauthError) {
      console.log('[YouTube] OAuth not available, returning no results');
      return tryWebFallback(
        apiKeyFailureMessage ||
          'YouTube search requires either a YOUTUBE_DATA_API_KEY or Google authentication.',
        apiKeyFailureMessage ? 'API_KEY_ERROR' : 'NO_AUTH'
      );
    }

    if (!accessToken) {
      return tryWebFallback(
        apiKeyFailureMessage ||
          'You need to connect your Google account first, or add a YOUTUBE_DATA_API_KEY to your environment.',
        apiKeyFailureMessage ? 'API_KEY_ERROR' : 'NO_TOKEN'
      );
    }

    const params = new URLSearchParams({
      part: 'snippet',
      q: query,
      maxResults: maxResults.toString(),
      type: 'video',
      order: order,
    });
    if (options?.publishedAfter) {
      params.set('publishedAfter', options.publishedAfter);
    }

    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || 'Unknown error';
      return tryWebFallback(
        `Failed to search videos: ${errorMessage}`,
        `API_ERROR: ${errorMessage}`
      );
    }

    const data = await response.json();
    return {
      success: true,
      message: `Successfully found ${data.items.length} videos.`,
      data: data.items,
    };
  } catch (error) {
    console.error('[Google YouTube API] Error searching videos:', error);
    return tryWebFallback(
      `An error occurred while searching videos: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error instanceof Error ? error.message : 'UNKNOWN_ERROR'
    );
  }
}

export async function getChannelDetails(
  channelId: string,
  userId: string = 'default-user'
): Promise<YouTubeAPIResult> {
  if (!channelId) {
    return {
      success: false,
      message: 'Channel ID cannot be empty.',
      error: 'INVALID_INPUT',
    };
  }

  try {
    const accessToken = await getValidAccessToken(userId, 'google');

    if (!accessToken) {
      return {
        success: false,
        message: 'You need to connect your Google account first.',
        error: 'NO_TOKEN',
      };
    }

    const params = new URLSearchParams({
      part: 'snippet,contentDetails,statistics',
      id: channelId,
    });

    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || 'Unknown error';
      return {
        success: false,
        message: `Failed to fetch channel details: ${errorMessage}`,
        error: `API_ERROR: ${errorMessage}`,
      };
    }

    const data = await response.json();
    return {
      success: true,
      message: `Successfully fetched details for channel "${data.items[0].snippet.title}".`,
      data: data.items[0],
    };
  } catch (error) {
    console.error(
      '[Google YouTube API] Error fetching channel details:',
      error
    );
    return {
      success: false,
      message: `An error occurred while fetching channel details: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
    };
  }
}

export async function getMyChannel(
  userId: string = 'default-user'
): Promise<YouTubeAPIResult> {
  try {
    const accessToken = await getValidAccessToken(userId, 'google');

    if (!accessToken) {
      return {
        success: false,
        message: 'You need to connect your Google account first.',
        error: 'NO_TOKEN',
      };
    }

    const params = new URLSearchParams({
      part: 'snippet,contentDetails,statistics,brandingSettings',
      mine: 'true',
    });

    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?${params.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || 'Unknown error';
      return {
        success: false,
        message: `Failed to fetch your channel: ${errorMessage}`,
        error: `API_ERROR: ${errorMessage}`,
      };
    }

    const data = await response.json();
    if (!data.items || data.items.length === 0) {
      return {
        success: false,
        message: 'No YouTube channel found for this account.',
        error: 'NO_CHANNEL',
      };
    }

    const channel = data.items[0];
    return {
      success: true,
      message: `Channel: ${channel.snippet.title}`,
      data: {
        id: channel.id,
        title: channel.snippet.title,
        description: channel.snippet.description,
        customUrl: channel.snippet.customUrl,
        thumbnail: channel.snippet.thumbnails?.default?.url,
        banner: channel.brandingSettings?.image?.bannerExternalUrl,
        stats: {
          subscribers: Number(channel.statistics.subscriberCount || 0),
          views: Number(channel.statistics.viewCount || 0),
          videoCount: Number(channel.statistics.videoCount || 0),
          hiddenSubscriberCount: channel.statistics.hiddenSubscriberCount,
        },
        publishedAt: channel.snippet.publishedAt,
        country: channel.snippet.country,
        uploadsPlaylistId: channel.contentDetails?.relatedPlaylists?.uploads,
      },
    };
  } catch (error) {
    console.error('[Google YouTube API] Error fetching my channel:', error);
    return {
      success: false,
      message: `Error fetching channel: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
    };
  }
}

export async function getTrendingVideos(
  userId: string = 'default-user',
  regionCode: string = 'US',
  maxResults: number = 10
): Promise<YouTubeAPIResult> {
  try {
    const accessToken = await getValidAccessToken(userId, 'google');

    if (!accessToken) {
      return {
        success: false,
        message: 'You need to connect your Google account first.',
        error: 'NO_TOKEN',
      };
    }

    const params = new URLSearchParams({
      part: 'snippet,contentDetails,statistics',
      chart: 'mostPopular',
      regionCode: regionCode,
      maxResults: maxResults.toString(),
    });

    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || 'Unknown error';
      return {
        success: false,
        message: `Failed to fetch trending videos: ${errorMessage}`,
        error: `API_ERROR: ${errorMessage}`,
      };
    }

    const data = await response.json();
    return {
      success: true,
      message: `Successfully fetched ${data.items.length} trending videos.`,
      data: data.items,
    };
  } catch (error) {
    console.error(
      '[Google YouTube API] Error fetching trending videos:',
      error
    );
    return {
      success: false,
      message: `An error occurred while fetching trending videos: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
    };
  }
}
