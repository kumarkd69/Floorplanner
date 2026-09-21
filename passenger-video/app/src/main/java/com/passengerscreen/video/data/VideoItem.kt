package com.passengerscreen.video.data

/** A single playable entry in the library. */
data class VideoItem(
    /** Stable identity: the content/file/http URI, used as the resume-position key. */
    val uri: String,
    val title: String,
    /** Duration in milliseconds, or 0 when unknown (network streams). */
    val durationMs: Long = 0L,
    val sizeBytes: Long = 0L,
    val source: Source
) {
    enum class Source { DEVICE, FOLDER, NETWORK }
}
