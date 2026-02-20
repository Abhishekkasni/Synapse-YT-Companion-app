import os
from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials


def get_youtube_client(session: dict) -> object:
    """
    Build an authenticated YouTube client from a stored session dict.
    session must have keys: access_token, refresh_token, token_uri,
    client_id, client_secret, scopes.
    
    Using a full Credentials object (not just token=) means the library
    can transparently refresh expired access tokens.
    """
    creds = Credentials(
        token=session["access_token"],
        refresh_token=session.get("refresh_token"),
        token_uri=session.get("token_uri", "https://oauth2.googleapis.com/token"),
        client_id=session.get("client_id"),
        client_secret=session.get("client_secret"),
        scopes=session.get("scopes"),
    )
    return build("youtube", "v3", credentials=creds)


# ── Video ──────────────────────────────────────────────────────────────────────

def list_my_videos(youtube, max_results: int = 20) -> list:
    """
    Returns up to max_results videos uploaded by the authenticated user.

    Strategy:
      1. Get the authenticated user's "uploads" playlist ID via channels.list
      2. Pull video IDs from that playlist via playlistItems.list
      3. Fetch full snippet + statistics for those IDs via videos.list
    
    This is the correct way — search.list(forMine=True) requires an expensive
    quota (100 units) and only returns snippet, not statistics.
    """
    # Step 1: get uploads playlist id
    ch_response = youtube.channels().list(
        part="contentDetails",
        mine=True
    ).execute()

    items = ch_response.get("items", [])
    if not items:
        return []

    uploads_playlist_id = items[0]["contentDetails"]["relatedPlaylists"]["uploads"]

    # Step 2: get video IDs from the uploads playlist
    playlist_response = youtube.playlistItems().list(
        part="contentDetails",
        playlistId=uploads_playlist_id,
        maxResults=max_results
    ).execute()

    video_ids = [
        item["contentDetails"]["videoId"]
        for item in playlist_response.get("items", [])
    ]

    if not video_ids:
        return []

    # Step 3: get full details for those video IDs
    videos_response = youtube.videos().list(
        part="snippet,statistics",
        id=",".join(video_ids)
    ).execute()

    return videos_response.get("items", [])

def fetch_video_details(youtube, video_id: str):
    """Returns full snippet + statistics for one video."""
    response = youtube.videos().list(
        part="snippet,statistics",
        id=video_id
    ).execute()
    items = response.get("items", [])
    if not items:
        return None
    return items[0]


def update_video_info(youtube, video_id: str, title: str, description: str):
    """
    YouTube requires you to send back the FULL existing snippet when updating,
    otherwise it wipes fields like categoryId, tags, etc.
    """
    video_data = youtube.videos().list(part="snippet", id=video_id).execute()
    items = video_data.get("items", [])
    if not items:
        raise ValueError(f"Video {video_id} not found on YouTube.")

    snippet = items[0]["snippet"]
    snippet["title"] = title
    snippet["description"] = description

    return youtube.videos().update(
        part="snippet",
        body={"id": video_id, "snippet": snippet}
    ).execute()


# ── Comments ───────────────────────────────────────────────────────────────────

def fetch_video_comments(youtube, video_id: str, max_results: int = 50):
    """
    Returns a list of top-level comment threads, each with replies nested inside.
    """
    response = youtube.commentThreads().list(
        part="snippet,replies",
        videoId=video_id,
        maxResults=max_results,
        textFormat="plainText"
    ).execute()
    return response.get("items", [])


def post_comment(youtube, video_id: str, text: str) -> str:
    """
    Posts a new top-level comment. Returns the YouTube comment ID.
    """
    response = youtube.commentThreads().insert(
        part="snippet",
        body={
            "snippet": {
                "videoId": video_id,
                "topLevelComment": {
                    "snippet": {"textOriginal": text}
                }
            }
        }
    ).execute()
    # The top-level comment id lives here:
    return response["snippet"]["topLevelComment"]["id"]


def reply_to_comment(youtube, parent_id: str, text: str) -> str:
    """
    Replies to an existing top-level comment. parent_id is the YouTube comment ID.
    Returns the new reply's YouTube comment ID.
    """
    response = youtube.comments().insert(
        part="snippet",
        body={
            "snippet": {
                "parentId": parent_id,
                "textOriginal": text
            }
        }
    ).execute()
    return response["id"]


def delete_comment(youtube, youtube_comment_id: str):
    """
    Permanently deletes a comment or reply from YouTube.
    Only works on comments made by the authenticated account.
    """
    youtube.comments().delete(id=youtube_comment_id).execute()
