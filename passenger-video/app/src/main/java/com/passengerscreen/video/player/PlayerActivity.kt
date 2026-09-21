package com.passengerscreen.video.player

import android.app.PictureInPictureParams
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Rational
import android.view.WindowManager
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.annotation.OptIn
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import com.passengerscreen.video.PassengerScreenApp
import com.passengerscreen.video.R

/**
 * Fullscreen, landscape playback for the passenger/rear-seat display.
 *
 * Playback position is saved on every pause and on leaving the screen, so the
 * library can offer a resume point.
 */
@OptIn(UnstableApi::class)
class PlayerActivity : ComponentActivity() {

    private var player: ExoPlayer? = null
    private lateinit var playerView: PlayerView
    private var mediaUri: String = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val uri: Uri? = intent?.data
        if (uri == null) {
            Toast.makeText(this, R.string.error_no_media, Toast.LENGTH_LONG).show()
            finish()
            return
        }
        mediaUri = uri.toString()

        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        WindowCompat.setDecorFitsSystemWindows(window, false)

        playerView = PlayerView(this).apply {
            setShowNextButton(false)
            setShowPreviousButton(false)
            controllerShowTimeoutMs = 3_500
        }
        setContentView(playerView)

        intent.getStringExtra(EXTRA_TITLE)?.takeIf { it.isNotBlank() }?.let { title = it }

        enterImmersiveMode()
    }

    override fun onStart() {
        super.onStart()
        initializePlayer()
    }

    override fun onStop() {
        super.onStop()
        releasePlayer()
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        maybeEnterPictureInPicture()
    }

    private fun initializePlayer() {
        if (player != null) return

        val repository = (application as PassengerScreenApp).repository
        val exoPlayer = ExoPlayer.Builder(this).build()
        exoPlayer.addListener(object : Player.Listener {
            override fun onPlayerError(error: PlaybackException) {
                Toast.makeText(
                    this@PlayerActivity,
                    getString(R.string.error_playback, error.errorCodeName),
                    Toast.LENGTH_LONG
                ).show()
            }
        })

        exoPlayer.setMediaItem(MediaItem.fromUri(mediaUri))
        val resumeAt = repository.resumePosition(mediaUri)
        if (resumeAt > 0) exoPlayer.seekTo(resumeAt)
        exoPlayer.prepare()
        exoPlayer.playWhenReady = true

        playerView.player = exoPlayer
        player = exoPlayer
    }

    private fun releasePlayer() {
        player?.let { active ->
            val repository = (application as PassengerScreenApp).repository
            repository.saveResumePosition(
                uri = mediaUri,
                positionMs = active.currentPosition,
                durationMs = active.duration.takeIf { it > 0 } ?: 0L
            )
            playerView.player = null
            active.release()
        }
        player = null
    }

    private fun enterImmersiveMode() {
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }

    /** Keeps video visible in a corner when the passenger switches apps. */
    private fun maybeEnterPictureInPicture() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        if (!packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)) return
        val active = player ?: return
        if (!active.isPlaying) return

        val format = active.videoFormat
        val params = PictureInPictureParams.Builder().apply {
            if (format != null && format.width > 0 && format.height > 0) {
                setAspectRatio(Rational(format.width, format.height))
            }
        }.build()
        runCatching { enterPictureInPictureMode(params) }
    }

    companion object {
        /** Optional display name, used for the task label in recents. */
        const val EXTRA_TITLE = "com.passengerscreen.video.extra.TITLE"
    }
}
