"use client";

import { useState, useEffect, useCallback, useRef } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Video {
  id: string;
  snippet: {
    title: string;
    description: string;
    thumbnails: { medium: { url: string } };
    publishedAt: string;
  };
  statistics: {
    viewCount: string;
    likeCount: string;
    commentCount: string;
  };
}

interface YTComment {
  id: string;                    // thread id (top-level)
  snippet: {
    topLevelComment: {
      id: string;
      snippet: { textDisplay: string; authorDisplayName: string; likeCount: number; publishedAt: string };
    };
    totalReplyCount: number;
  };
  replies?: {
    comments: {
      id: string;
      snippet: { textDisplay: string; authorDisplayName: string; publishedAt: string };
    }[];
  };
}

interface LocalComment {
  id: number;                    // our DB id — needed for delete
  youtube_comment_id: string;
  parent_youtube_id: string | null;
  text: string;
}

interface Note {
  id: number;
  video_id: string;
  title: string | null;
  content: string;
  tags: string[];
  created_at: string;
}

// ── API helper ─────────────────────────────────────────────────────────────────

async function apiFetch(
  path: string,
  token: string | null,
  options: RequestInit = {}
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Request failed");
  }
  return res.json();
}

// ── Root Page ──────────────────────────────────────────────────────────────────

export default function Home() {
  const [token, setToken] = useState<string | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // On mount: grab token from URL (set by backend after OAuth) and persist it
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get("token");

    if (urlToken) {
      localStorage.setItem("yt_token", urlToken);
      setToken(urlToken);
      // Clean the token from the URL so it's not visible / bookmarked
      window.history.replaceState({}, "", "/");
    } else {
      const saved = localStorage.getItem("yt_token");
      if (saved) setToken(saved);
    }
  }, []);

  // When token is available, fetch the user's videos
  useEffect(() => {
    if (!token) return;
    setLoadingVideos(true);
    setError(null);
    apiFetch("/videos", token)
      .then((data) => setVideos(data.data || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoadingVideos(false));
  }, [token]);

  const handleLogout = async () => {
    if (!token) return;
    try {
      await apiFetch("/logout", token, { method: "POST" });
    } catch (_) {
      // Revoke may fail if token already expired — still clear locally
    }
    localStorage.removeItem("yt_token");
    setToken(null);
    setVideos([]);
    setSelectedVideo(null);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-slate-200 p-8 font-sans">
      {/* NAV */}
      <nav className="flex justify-between items-center mb-10 border-b border-white/5 pb-6">
        <h1 className="text-xl font-black tracking-tighter text-indigo-500">
          YT_COMPANION{" "}
          <span className="text-white/20 font-light">v2.0</span>
        </h1>

        {!token ? (
          <button
            onClick={() => (window.location.href = `${API}/login`)}
            className="bg-indigo-600 hover:bg-indigo-500 px-6 py-2 rounded-full font-bold transition-all shadow-lg shadow-indigo-600/20"
          >
            Connect Channel
          </button>
        ) : (
          <div className="flex items-center gap-4">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
              Session Active
            </span>
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <button
              onClick={handleLogout}
              className="text-[10px] font-black text-slate-500 uppercase tracking-widest hover:text-red-400 transition-colors border border-white/10 px-3 py-1 rounded-full hover:border-red-500/40"
            >
              Logout
            </button>
          </div>
        )}
      </nav>

      {/* NOT LOGGED IN */}
      {!token && (
        <div className="h-[60vh] flex flex-col items-center justify-center text-slate-600">
          <div className="w-16 h-16 mb-6 bg-slate-900 rounded-3xl flex items-center justify-center text-3xl">
            🔗
          </div>
          <p className="font-black uppercase tracking-widest text-xs mb-2">
            Connect your YouTube channel to get started
          </p>
          <p className="text-xs text-slate-700">
            Click "Connect Channel" above
          </p>
        </div>
      )}

      {/* LOGGED IN */}
      {token && (
        <div className="grid grid-cols-12 gap-10">
          {/* SIDEBAR — video list */}
          <aside className="col-span-4 h-[calc(100vh-180px)] overflow-y-auto sticky top-8 pr-2 space-y-3">
            <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">
              Your Content Library
            </h2>

            {loadingVideos && (
              <p className="text-xs text-slate-600 animate-pulse">
                Loading your videos...
              </p>
            )}

            {error && (
              <p className="text-xs text-red-400 bg-red-500/10 p-3 rounded-xl border border-red-500/20">
                {error}
              </p>
            )}

            {!loadingVideos && videos.length === 0 && !error && (
              <p className="text-xs text-slate-600">
                No videos found on your channel.
              </p>
            )}

            {videos.map((vid) => (
              <div
                key={vid.id}
                onClick={() => setSelectedVideo(vid)}
                className={`group p-3 rounded-2xl cursor-pointer border transition-all duration-300 ${
                  selectedVideo?.id === vid.id
                    ? "bg-indigo-600/10 border-indigo-500 shadow-xl shadow-indigo-500/5"
                    : "bg-slate-900/40 border-white/5 hover:border-white/10"
                }`}
              >
                <div className="relative overflow-hidden rounded-xl mb-3">
                  <img
                    src={vid.snippet.thumbnails.medium.url}
                    alt={vid.snippet.title}
                    className="w-full transform group-hover:scale-105 transition-transform duration-500"
                  />
                </div>
                <p className="text-sm font-bold line-clamp-2 px-1 group-hover:text-indigo-400 transition-colors">
                  {vid.snippet.title}
                </p>
                <div className="flex gap-3 mt-2 px-1">
                  <Stat icon="👁" value={Number(vid.statistics?.viewCount || 0).toLocaleString()} />
                  <Stat icon="👍" value={Number(vid.statistics?.likeCount || 0).toLocaleString()} />
                  <Stat icon="💬" value={Number(vid.statistics?.commentCount || 0).toLocaleString()} />
                </div>
              </div>
            ))}
          </aside>

          {/* WORKSPACE */}
          <main className="col-span-8">
            {selectedVideo ? (
              <Workspace
                key={selectedVideo.id}
                video={selectedVideo}
                token={token}
              />
            ) : (
              <div className="h-[60vh] flex flex-col items-center justify-center border-2 border-dashed border-white/5 rounded-[48px] text-slate-600">
                <div className="w-12 h-12 mb-4 bg-slate-900 rounded-2xl flex items-center justify-center text-2xl">
                  📽️
                </div>
                <p className="font-black uppercase tracking-widest text-xs">
                  Select a video to launch editor
                </p>
              </div>
            )}
          </main>
        </div>
      )}
    </div>
  );
}

// ── Stat badge ─────────────────────────────────────────────────────────────────

function Stat({ icon, value }: { icon: string; value: string }) {
  return (
    <span className="text-[10px] text-slate-500 flex items-center gap-1">
      {icon} {value}
    </span>
  );
}

// ── Workspace ──────────────────────────────────────────────────────────────────

function Workspace({ video, token }: { video: Video; token: string }) {
  const [activeTab, setActiveTab] = useState<"editor" | "comments" | "notes">(
    "editor"
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Embedded player */}
      <div className="aspect-video rounded-[32px] overflow-hidden border-4 border-slate-900 shadow-2xl bg-black">
        <iframe
          className="w-full h-full"
          src={`https://www.youtube.com/embed/${video.id}`}
          allowFullScreen
        />
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2 bg-slate-900/40 p-1.5 rounded-2xl border border-white/5 w-fit">
        {(["editor", "comments", "notes"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
              activeTab === tab
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {tab === "editor" ? "✏️ Editor" : tab === "comments" ? "💬 Comments" : "📝 Notes"}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "editor" && (
        <EditorTab video={video} token={token} />
      )}
      {activeTab === "comments" && (
        <CommentsTab videoId={video.id} token={token} />
      )}
      {activeTab === "notes" && (
        <NotesTab videoId={video.id} />
      )}
    </div>
  );
}

// ── Editor Tab ─────────────────────────────────────────────────────────────────

function EditorTab({ video, token }: { video: Video; token: string }) {
  const [title, setTitle] = useState(video.snippet.title);
  const [description, setDescription] = useState(video.snippet.description);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loadingAI, setLoadingAI] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const handleAI = async () => {
    setLoadingAI(true);
    setSuggestions([]);
    try {
      const data = await apiFetch(
        `/videos/${video.id}/suggestions`,
        token,
        { method: "POST", body: JSON.stringify({ title }) }
      );
      setSuggestions(data.suggestions || []);
    } catch (e: any) {
      setMsg({ type: "err", text: e.message });
    }
    setLoadingAI(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await apiFetch(
        `/videos/${video.id}/metadata`,
        token,
        { method: "PUT", body: JSON.stringify({ title, description }) }
      );
      setMsg({ type: "ok", text: "Title & description updated on YouTube ✓" });
    } catch (e: any) {
      setMsg({ type: "err", text: e.message });
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      {/* AI Suggestions */}
      <div className="bg-indigo-500/5 border border-indigo-500/20 p-7 rounded-[32px]">
        <div className="flex justify-between items-center mb-5">
          <div>
            <h3 className="font-bold text-white">AI Title Suggestions</h3>
            <p className="text-xs text-indigo-400/60 font-medium mt-0.5">
              Powered by Groq · Llama 3.3 70B
            </p>
          </div>
          <button
            onClick={handleAI}
            disabled={loadingAI}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-5 py-2.5 rounded-xl text-xs font-black transition-all shadow-lg shadow-indigo-600/20 uppercase tracking-widest"
          >
            {loadingAI ? "Analyzing..." : "Generate 3 Titles"}
          </button>
        </div>

        {suggestions.length > 0 && (
          <div className="grid gap-2">
            {suggestions.map((sug, i) => (
              <button
                key={i}
                onClick={() => setTitle(sug)}
                className="text-left p-4 bg-black/40 border border-white/5 rounded-xl hover:border-indigo-500/50 hover:bg-black/60 transition-all text-sm group flex items-center gap-4"
              >
                <span className="text-indigo-500 font-black opacity-40 group-hover:opacity-100 text-lg">
                  {i + 1}
                </span>
                {sug}
              </button>
            ))}
            <p className="text-[10px] text-slate-600 ml-1 mt-1">
              Click any title to use it in the editor below
            </p>
          </div>
        )}
      </div>

      {/* Metadata Editor */}
      <div className="bg-slate-900/20 p-7 rounded-[32px] border border-white/5 space-y-5">
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
            Video Title
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-black/40 border border-white/10 p-4 rounded-xl font-bold focus:border-indigo-500 outline-none transition-all"
          />
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={6}
            className="w-full bg-black/40 border border-white/10 p-4 rounded-xl outline-none focus:border-indigo-500 transition-all text-sm leading-relaxed"
          />
        </div>

        {msg && (
          <p
            className={`text-xs px-4 py-2 rounded-xl ${
              msg.type === "ok"
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                : "bg-red-500/10 text-red-400 border border-red-500/20"
            }`}
          >
            {msg.text}
          </p>
        )}

        <div className="flex gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-[2] bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-black py-4 rounded-2xl transition-all shadow-xl shadow-emerald-500/10 uppercase tracking-widest text-sm"
          >
            {saving ? "Saving..." : "Save to YouTube"}
          </button>
          <button
            onClick={() => {
              setTitle(video.snippet.title);
              setDescription(video.snippet.description);
              setMsg(null);
            }}
            className="flex-1 border border-white/10 text-white/40 font-bold rounded-2xl hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 transition-all text-[10px] uppercase tracking-widest"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Comments Tab ───────────────────────────────────────────────────────────────

function CommentsTab({ videoId, token }: { videoId: string; token: string }) {
  const [ytComments, setYtComments] = useState<YTComment[]>([]);
  const [localComments, setLocalComments] = useState<LocalComment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [replyingTo, setReplyingTo] = useState<{ id: string; name: string } | null>(null);
  const [replyText, setReplyText] = useState("");
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadComments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ytData, localData] = await Promise.all([
        apiFetch(`/videos/${videoId}/comments`, token),
        // We fetch our local comments to know which ones we can delete
        apiFetch(`/videos/${videoId}/comments/local`, token),
      ]);
      setYtComments(ytData.data || []);
      setLocalComments(localData.data || []);
    } catch (e: any) {
      // If comments are disabled on the video YouTube returns 403
      setError(e.message);
    }
    setLoading(false);
  }, [videoId, token]);

  useEffect(() => { loadComments(); }, [loadComments]);

  const postComment = async () => {
    if (!newComment.trim()) return;
    setPosting(true);
    try {
      await apiFetch(`/videos/${videoId}/comments`, token, {
        method: "POST",
        body: JSON.stringify({ text: newComment }),
      });
      setNewComment("");
      await loadComments();
    } catch (e: any) {
      setError(e.message);
    }
    setPosting(false);
  };

  const postReply = async () => {
    if (!replyText.trim() || !replyingTo) return;
    setPosting(true);
    try {
      await apiFetch(`/videos/${videoId}/comments`, token, {
        method: "POST",
        body: JSON.stringify({ text: replyText, parent_id: replyingTo.id }),
      });
      setReplyingTo(null);
      setReplyText("");
      await loadComments();
    } catch (e: any) {
      setError(e.message);
    }
    setPosting(false);
  };

  const deleteComment = async (localId: number) => {
    try {
      await apiFetch(`/comments/${localId}`, token, { method: "DELETE" });
      setLocalComments((prev) => prev.filter((c) => c.id !== localId));
      await loadComments();
    } catch (e: any) {
      setError(e.message);
    }
  };

  // Map youtube_comment_id → local DB id so we can show delete button
  const deletableMap = new Map(
    localComments.map((c) => [c.youtube_comment_id, c.id])
  );

  return (
    <div className="space-y-5">
      {/* New comment box */}
      <div className="bg-slate-900/20 p-6 rounded-[28px] border border-white/5 space-y-3">
        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
          Post a Comment
        </label>
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          rows={3}
          placeholder="Write your comment..."
          className="w-full bg-black/40 border border-white/10 p-4 rounded-xl outline-none focus:border-indigo-500 transition-all text-sm"
        />
        <button
          onClick={postComment}
          disabled={posting || !newComment.trim()}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all"
        >
          {posting ? "Posting..." : "Post Comment"}
        </button>
      </div>

      {/* Reply modal */}
      {replyingTo && (
        <div className="bg-indigo-500/5 border border-indigo-500/30 p-5 rounded-[24px] space-y-3">
          <div className="flex justify-between items-center">
            <p className="text-xs text-indigo-400 font-bold">
              ↩ Replying to {replyingTo.name}
            </p>
            <button
              onClick={() => { setReplyingTo(null); setReplyText(""); }}
              className="text-slate-500 hover:text-white text-xs"
            >
              Cancel
            </button>
          </div>
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            rows={2}
            placeholder="Write your reply..."
            className="w-full bg-black/40 border border-white/10 p-3 rounded-xl outline-none focus:border-indigo-500 transition-all text-sm"
          />
          <button
            onClick={postReply}
            disabled={posting || !replyText.trim()}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all"
          >
            {posting ? "Posting..." : "Send Reply"}
          </button>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-400 bg-red-500/10 p-3 rounded-xl border border-red-500/20">
          {error}
        </p>
      )}

      {loading && (
        <p className="text-xs text-slate-600 animate-pulse">Loading comments...</p>
      )}

      {/* Comment list */}
      <div className="space-y-3">
        {ytComments.map((thread) => {
          const top = thread.snippet.topLevelComment;
          const canDelete = deletableMap.has(top.id);
          return (
            <div
              key={thread.id}
              className="bg-slate-900/30 border border-white/5 rounded-[20px] p-5 space-y-3"
            >
              {/* Top-level comment */}
              <div className="flex justify-between gap-3">
                <div className="flex-1">
                  <p className="text-xs font-bold text-indigo-400 mb-1">
                    {top.snippet.authorDisplayName}
                  </p>
                  <p className="text-sm text-slate-300">{top.snippet.textDisplay}</p>
                  <div className="flex gap-4 mt-2">
                    <span className="text-[10px] text-slate-600">
                      👍 {top.snippet.likeCount}
                    </span>
                    <button
                      onClick={() =>
                        setReplyingTo({
                          id: top.id,
                          name: top.snippet.authorDisplayName,
                        })
                      }
                      className="text-[10px] text-slate-500 hover:text-indigo-400 font-bold uppercase tracking-widest transition-colors"
                    >
                      ↩ Reply
                    </button>
                  </div>
                </div>
                {canDelete && (
                  <button
                    onClick={() => deleteComment(deletableMap.get(top.id)!)}
                    className="text-[10px] text-red-500/50 hover:text-red-400 font-bold uppercase transition-colors self-start"
                    title="Delete your comment"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Replies */}
              {thread.replies?.comments?.map((reply) => {
                const canDeleteReply = deletableMap.has(reply.id);
                return (
                  <div
                    key={reply.id}
                    className="ml-5 pl-4 border-l border-white/5 flex justify-between gap-3"
                  >
                    <div className="flex-1">
                      <p className="text-[10px] font-bold text-slate-400 mb-0.5">
                        {reply.snippet.authorDisplayName}
                      </p>
                      <p className="text-xs text-slate-400">
                        {reply.snippet.textDisplay}
                      </p>
                    </div>
                    {canDeleteReply && (
                      <button
                        onClick={() =>
                          deleteComment(deletableMap.get(reply.id)!)
                        }
                        className="text-[10px] text-red-500/50 hover:text-red-400 font-bold transition-colors self-start"
                        title="Delete your reply"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Notes Tab ──────────────────────────────────────────────────────────────────

function NotesTab({ videoId }: { videoId: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [creating, setCreating] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Debounce: wait 400ms after user stops typing before searching
  const handleSearchChange = (val: string) => {
    setSearchInput(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(val), 400);
  };

  const handleTagChange = (val: string) => {
    setTagInput(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setTagFilter(val), 400);
  };
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newTags, setNewTags] = useState("");  // comma-separated input
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadNotes = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (tagFilter) params.set("tag", tagFilter);
      const data = await apiFetch(
        `/videos/${videoId}/notes?${params.toString()}`,
        null
      );
      setNotes(data);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }, [videoId, search, tagFilter]);

  useEffect(() => { loadNotes(); }, [loadNotes]);

  const createNote = async () => {
    if (!newContent.trim()) return;
    try {
      await apiFetch(`/videos/${videoId}/notes`, null, {
        method: "POST",
        body: JSON.stringify({
          video_id: videoId,
          title: newTitle || null,
          content: newContent,
          tags: newTags.split(",").map((t) => t.trim()).filter(Boolean),
        }),
      });
      setNewTitle("");
      setNewContent("");
      setNewTags("");
      setCreating(false);
      await loadNotes();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const deleteNote = async (noteId: number) => {
    try {
      await apiFetch(`/notes/${noteId}`, null, { method: "DELETE" });
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="space-y-5">
      {/* Search + filter bar */}
      <div className="flex gap-3">
        <input
          value={searchInput}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="🔍 Search notes..."
          className="flex-1 bg-black/40 border border-white/10 px-4 py-2.5 rounded-xl text-sm outline-none focus:border-indigo-500 transition-all"
        />
        <input
          value={tagInput}
          onChange={(e) => handleTagChange(e.target.value)}
          placeholder="🏷 Filter by tag"
          className="w-40 bg-black/40 border border-white/10 px-4 py-2.5 rounded-xl text-sm outline-none focus:border-indigo-500 transition-all"
        />
        <button
          onClick={() => setCreating(true)}
          className="bg-indigo-600 hover:bg-indigo-500 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all"
        >
          + New Note
        </button>
      </div>

      {/* New note form */}
      {creating && (
        <div className="bg-indigo-500/5 border border-indigo-500/20 p-6 rounded-[24px] space-y-3">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Note title (optional)"
            className="w-full bg-black/40 border border-white/10 px-4 py-2.5 rounded-xl text-sm font-bold outline-none focus:border-indigo-500 transition-all"
          />
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="Write your idea, script draft, keyword list..."
            rows={4}
            className="w-full bg-black/40 border border-white/10 p-4 rounded-xl text-sm outline-none focus:border-indigo-500 transition-all"
          />
          <input
            value={newTags}
            onChange={(e) => setNewTags(e.target.value)}
            placeholder="Tags (comma-separated): script, seo, thumbnail"
            className="w-full bg-black/40 border border-white/10 px-4 py-2.5 rounded-xl text-xs outline-none focus:border-indigo-500 transition-all"
          />
          <div className="flex gap-3">
            <button
              onClick={createNote}
              disabled={!newContent.trim()}
              className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-black px-6 py-2.5 rounded-xl text-xs uppercase tracking-widest transition-all"
            >
              Save Note
            </button>
            <button
              onClick={() => { setCreating(false); setNewTitle(""); setNewContent(""); setNewTags(""); }}
              className="text-slate-500 hover:text-white text-xs transition-colors px-4"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-400 bg-red-500/10 p-3 rounded-xl border border-red-500/20">
          {error}
        </p>
      )}

      {loading && (
        <p className="text-xs text-slate-600 animate-pulse">Loading notes...</p>
      )}

      {!loading && notes.length === 0 && (
        <p className="text-xs text-slate-600 text-center py-10">
          No notes yet. Click "+ New Note" to start.
        </p>
      )}

      {/* Note cards */}
      <div className="grid gap-3">
        {notes.map((note) => (
          <div
            key={note.id}
            className="bg-slate-900/30 border border-white/5 rounded-[20px] p-5"
          >
            <div className="flex justify-between items-start gap-3">
              <div className="flex-1">
                {note.title && (
                  <p className="font-bold text-sm mb-1">{note.title}</p>
                )}
                <p className="text-sm text-slate-400 leading-relaxed whitespace-pre-wrap">
                  {note.content}
                </p>
                {note.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {note.tags.map((tag) => (
                      <button
                        key={tag}
                        onClick={() => { setTagInput(tag); setTagFilter(tag); }}
                        className="text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2.5 py-0.5 rounded-full font-bold hover:bg-indigo-500/20 transition-colors"
                      >
                        #{tag}
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-slate-600 mt-2">
                  {new Date(note.created_at).toLocaleString()}
                </p>
              </div>
              <button
                onClick={() => deleteNote(note.id)}
                className="text-[10px] text-red-500/40 hover:text-red-400 font-bold uppercase transition-colors"
                title="Delete note"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}