package com.passengerscreen.video.ui

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.passengerscreen.video.R
import com.passengerscreen.video.data.VideoItem
import com.passengerscreen.video.player.PlayerActivity
import java.util.concurrent.TimeUnit

/**
 * The library: pick something to watch on the passenger/rear-seat display.
 */
class LibraryActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            PassengerScreenTheme {
                LibraryScreen()
            }
        }
    }
}

private fun mediaPermission(): String =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        Manifest.permission.READ_MEDIA_VIDEO
    } else {
        Manifest.permission.READ_EXTERNAL_STORAGE
    }

private fun Context.hasMediaPermission(): Boolean =
    checkSelfPermission(mediaPermission()) == PackageManager.PERMISSION_GRANTED

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun LibraryScreen(viewModel: LibraryViewModel = viewModel()) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val state by viewModel.state.collectAsStateWithLifecycle()
    var showUrlDialog by rememberSaveable { mutableStateOf(false) }
    var showNotice by rememberSaveable { mutableStateOf(!noticeAcknowledged(context)) }

    val permissionLauncher = androidx.activity.compose.rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted -> viewModel.onPermissionResult(granted) }

    val folderLauncher = androidx.activity.compose.rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocumentTree()
    ) { uri -> uri?.let(viewModel::addFolder) }

    androidx.compose.runtime.LaunchedEffect(Unit) {
        if (context.hasMediaPermission()) {
            viewModel.onPermissionResult(true)
        } else {
            permissionLauncher.launch(mediaPermission())
        }
    }

    if (showNotice) {
        PassengerNoticeDialog(
            onAcknowledge = {
                acknowledgeNotice(context)
                showNotice = false
            }
        )
    }

    if (showUrlDialog) {
        AddUrlDialog(
            onDismiss = { showUrlDialog = false },
            onConfirm = { url, title ->
                viewModel.addNetworkUrl(url, title)
                showUrlDialog = false
            }
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.app_name)) },
                actions = {
                    IconButton(onClick = { folderLauncher.launch(null) }) {
                        Icon(Icons.Default.Folder, stringResource(R.string.add_folder))
                    }
                    IconButton(onClick = { showUrlDialog = true }) {
                        Icon(Icons.Default.Link, stringResource(R.string.add_url))
                    }
                    IconButton(onClick = viewModel::refresh) {
                        Icon(Icons.Default.Refresh, stringResource(R.string.refresh))
                    }
                }
            )
        }
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            if (state.loading) {
                LinearProgressIndicator(Modifier.fillMaxWidth())
            }
            state.error?.let { message ->
                Text(
                    text = message,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(16.dp)
                )
            }

            val sections = listOfNotNull(
                stringResource(R.string.section_network).takeIf { state.networkVideos.isNotEmpty() }
                    ?.to(state.networkVideos),
                stringResource(R.string.section_folders).takeIf { state.folderVideos.isNotEmpty() }
                    ?.to(state.folderVideos),
                stringResource(R.string.section_device).takeIf { state.deviceVideos.isNotEmpty() }
                    ?.to(state.deviceVideos)
            )

            if (sections.isEmpty() && !state.loading) {
                EmptyLibrary(
                    onAddFolder = { folderLauncher.launch(null) },
                    onAddUrl = { showUrlDialog = true }
                )
            } else {
                LazyColumn(
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    sections.forEach { (heading, videos) ->
                        item(key = "header-$heading") {
                            Text(
                                text = "$heading (${videos.size})",
                                style = MaterialTheme.typography.titleSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(top = 8.dp, bottom = 4.dp)
                            )
                        }
                        items(videos, key = { it.uri }) { video ->
                            VideoRow(
                                video = video,
                                resumeMs = viewModel.resumePosition(video.uri),
                                onPlay = { context.startPlayer(video) },
                                onRemove = if (video.source == VideoItem.Source.NETWORK) {
                                    { viewModel.removeNetworkUrl(video.uri) }
                                } else {
                                    null
                                }
                            )
                        }
                    }
                }
            }
        }
    }
}

private fun Context.startPlayer(video: VideoItem) {
    startActivity(
        Intent(this, PlayerActivity::class.java).apply {
            data = Uri.parse(video.uri)
            putExtra(PlayerActivity.EXTRA_TITLE, video.title)
        }
    )
}

@Composable
private fun VideoRow(
    video: VideoItem,
    resumeMs: Long,
    onPlay: () -> Unit,
    onRemove: (() -> Unit)?
) {
    Card(Modifier.fillMaxWidth().clickable(onClick = onPlay)) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    text = video.title,
                    style = MaterialTheme.typography.bodyLarge,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
                val subtitle = buildString {
                    if (video.durationMs > 0) append(formatDuration(video.durationMs))
                    if (video.sizeBytes > 0) {
                        if (isNotEmpty()) append("  ·  ")
                        append("%.1f MB".format(video.sizeBytes / 1_048_576.0))
                    }
                    if (resumeMs > 0) {
                        if (isNotEmpty()) append("  ·  ")
                        append("resume ${formatDuration(resumeMs)}")
                    }
                }
                if (subtitle.isNotEmpty()) {
                    Spacer(Modifier.height(2.dp))
                    Text(
                        text = subtitle,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            if (onRemove != null) {
                Spacer(Modifier.width(8.dp))
                IconButton(onClick = onRemove) {
                    Icon(Icons.Default.Close, stringResource(R.string.remove))
                }
            }
        }
    }
}

@Composable
private fun EmptyLibrary(onAddFolder: () -> Unit, onAddUrl: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = stringResource(R.string.empty_title),
            style = MaterialTheme.typography.titleMedium
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text = stringResource(R.string.empty_body),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(Modifier.height(20.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Button(onClick = onAddFolder) {
                Icon(Icons.Default.Folder, null)
                Spacer(Modifier.width(8.dp))
                Text(stringResource(R.string.add_folder))
            }
            Button(onClick = onAddUrl) {
                Icon(Icons.Default.Add, null)
                Spacer(Modifier.width(8.dp))
                Text(stringResource(R.string.add_url))
            }
        }
    }
}

@Composable
private fun AddUrlDialog(onDismiss: () -> Unit, onConfirm: (String, String) -> Unit) {
    var url by remember { mutableStateOf("") }
    var title by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.add_url)) },
        text = {
            Column {
                OutlinedTextField(
                    value = url,
                    onValueChange = { url = it },
                    label = { Text(stringResource(R.string.url_hint)) },
                    singleLine = true
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = title,
                    onValueChange = { title = it },
                    label = { Text(stringResource(R.string.title_hint)) },
                    singleLine = true
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onConfirm(url, title) },
                enabled = url.isNotBlank()
            ) { Text(stringResource(R.string.add)) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.cancel)) }
        }
    )
}

@Composable
private fun PassengerNoticeDialog(onAcknowledge: () -> Unit) {
    AlertDialog(
        onDismissRequest = {},
        title = { Text(stringResource(R.string.notice_title)) },
        text = { Text(stringResource(R.string.notice_body)) },
        confirmButton = {
            TextButton(onClick = onAcknowledge) { Text(stringResource(R.string.notice_ack)) }
        }
    )
}

private const val NOTICE_PREFS = "passenger_screen_notice"
private const val NOTICE_KEY = "acknowledged"

private fun noticeAcknowledged(context: Context): Boolean =
    context.getSharedPreferences(NOTICE_PREFS, Context.MODE_PRIVATE)
        .getBoolean(NOTICE_KEY, false)

private fun acknowledgeNotice(context: Context) {
    context.getSharedPreferences(NOTICE_PREFS, Context.MODE_PRIVATE)
        .edit().putBoolean(NOTICE_KEY, true).apply()
}

internal fun formatDuration(ms: Long): String {
    val hours = TimeUnit.MILLISECONDS.toHours(ms)
    val minutes = TimeUnit.MILLISECONDS.toMinutes(ms) % 60
    val seconds = TimeUnit.MILLISECONDS.toSeconds(ms) % 60
    return if (hours > 0) {
        "%d:%02d:%02d".format(hours, minutes, seconds)
    } else {
        "%d:%02d".format(minutes, seconds)
    }
}
