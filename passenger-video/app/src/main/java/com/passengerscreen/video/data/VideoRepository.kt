package com.passengerscreen.video.data

import android.content.ContentUris
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.MediaStore
import androidx.documentfile.provider.DocumentFile
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

/**
 * Owns everything the library screen shows: videos found on the device, videos
 * inside folders the user granted via the storage-access framework, saved
 * network URLs, and per-video resume positions.
 *
 * Reads that touch MediaStore or SAF are suspending and run on [Dispatchers.IO];
 * the small preference-backed lists are cheap enough to read inline.
 */
class VideoRepository(private val context: Context) {

    private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    // ---- Device library (MediaStore) ----------------------------------------

    suspend fun loadDeviceVideos(): List<VideoItem> = withContext(Dispatchers.IO) {
        val projection = arrayOf(
            MediaStore.Video.Media._ID,
            MediaStore.Video.Media.DISPLAY_NAME,
            MediaStore.Video.Media.DURATION,
            MediaStore.Video.Media.SIZE
        )
        val items = mutableListOf<VideoItem>()
        context.contentResolver.query(
            MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
            projection,
            null,
            null,
            "${MediaStore.Video.Media.DATE_ADDED} DESC"
        )?.use { cursor ->
            val idCol = cursor.getColumnIndexOrThrow(MediaStore.Video.Media._ID)
            val nameCol = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.DISPLAY_NAME)
            val durationCol = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.DURATION)
            val sizeCol = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.SIZE)
            while (cursor.moveToNext()) {
                val id = cursor.getLong(idCol)
                val uri = ContentUris.withAppendedId(
                    MediaStore.Video.Media.EXTERNAL_CONTENT_URI, id
                )
                items += VideoItem(
                    uri = uri.toString(),
                    title = cursor.getString(nameCol) ?: uri.lastPathSegment.orEmpty(),
                    durationMs = cursor.getLong(durationCol),
                    sizeBytes = cursor.getLong(sizeCol),
                    source = VideoItem.Source.DEVICE
                )
            }
        }
        items
    }

    // ---- Granted folders (SAF) ----------------------------------------------

    /** Persists read access to [treeUri] so the folder survives a reboot. */
    fun addFolder(treeUri: Uri) {
        runCatching {
            context.contentResolver.takePersistableUriPermission(
                treeUri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION
            )
        }
        val folders = folderUris().toMutableSet()
        folders += treeUri.toString()
        prefs.edit().putStringSet(KEY_FOLDERS, folders).apply()
    }

    fun removeFolder(treeUri: String) {
        val folders = folderUris().toMutableSet()
        folders -= treeUri
        prefs.edit().putStringSet(KEY_FOLDERS, folders).apply()
        runCatching {
            context.contentResolver.releasePersistableUriPermission(
                Uri.parse(treeUri),
                Intent.FLAG_GRANT_READ_URI_PERMISSION
            )
        }
    }

    fun folderUris(): Set<String> = prefs.getStringSet(KEY_FOLDERS, emptySet()).orEmpty()

    suspend fun loadFolderVideos(): List<VideoItem> = withContext(Dispatchers.IO) {
        folderUris().flatMap { treeUri ->
            val root = DocumentFile.fromTreeUri(context, Uri.parse(treeUri))
            if (root == null || !root.canRead()) emptyList() else scanFolder(root)
        }
    }

    /** Walks a granted tree breadth-first, capped so a huge card can't hang the UI. */
    private fun scanFolder(root: DocumentFile): List<VideoItem> {
        val items = mutableListOf<VideoItem>()
        val queue = ArrayDeque(listOf(root))
        var visited = 0
        while (queue.isNotEmpty() && items.size < MAX_FOLDER_ITEMS && visited < MAX_FOLDER_NODES) {
            val dir = queue.removeFirst()
            for (child in dir.listFiles()) {
                visited++
                when {
                    child.isDirectory -> queue.addLast(child)
                    child.type?.startsWith("video/") == true -> items += VideoItem(
                        uri = child.uri.toString(),
                        title = child.name ?: child.uri.lastPathSegment.orEmpty(),
                        sizeBytes = child.length(),
                        source = VideoItem.Source.FOLDER
                    )
                }
                if (items.size >= MAX_FOLDER_ITEMS) break
            }
        }
        return items
    }

    // ---- Network URLs --------------------------------------------------------

    fun addNetworkUrl(url: String, title: String) {
        val entries = networkEntries().toMutableList()
        entries.removeAll { it.uri == url }
        entries.add(0, VideoItem(url, title.ifBlank { url }, source = VideoItem.Source.NETWORK))
        saveNetworkEntries(entries)
    }

    fun removeNetworkUrl(url: String) {
        saveNetworkEntries(networkEntries().filterNot { it.uri == url })
    }

    fun networkEntries(): List<VideoItem> {
        val raw = prefs.getString(KEY_NETWORK, null) ?: return emptyList()
        return runCatching {
            val array = JSONArray(raw)
            (0 until array.length()).map { i ->
                val obj = array.getJSONObject(i)
                VideoItem(
                    uri = obj.getString("uri"),
                    title = obj.optString("title", obj.getString("uri")),
                    source = VideoItem.Source.NETWORK
                )
            }
        }.getOrDefault(emptyList())
    }

    private fun saveNetworkEntries(entries: List<VideoItem>) {
        val array = JSONArray()
        entries.forEach { item ->
            array.put(JSONObject().put("uri", item.uri).put("title", item.title))
        }
        prefs.edit().putString(KEY_NETWORK, array.toString()).apply()
    }

    // ---- Resume positions ----------------------------------------------------

    fun resumePosition(uri: String): Long = prefs.getLong(resumeKey(uri), 0L)

    /**
     * Stores where playback stopped. Positions near the start or the very end are
     * cleared instead, so a finished video does not resume one second from its end.
     */
    fun saveResumePosition(uri: String, positionMs: Long, durationMs: Long) {
        val nearEnd = durationMs > 0 && positionMs > durationMs - RESUME_END_SLACK_MS
        val editor = prefs.edit()
        if (positionMs < RESUME_MIN_MS || nearEnd) {
            editor.remove(resumeKey(uri))
        } else {
            editor.putLong(resumeKey(uri), positionMs)
        }
        editor.apply()
    }

    private fun resumeKey(uri: String) = "resume:$uri"

    private companion object {
        const val PREFS = "passenger_screen"
        const val KEY_FOLDERS = "folders"
        const val KEY_NETWORK = "network"
        const val RESUME_MIN_MS = 10_000L
        const val RESUME_END_SLACK_MS = 15_000L
        const val MAX_FOLDER_ITEMS = 2_000
        const val MAX_FOLDER_NODES = 20_000
    }
}
