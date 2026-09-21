package com.passengerscreen.video.ui

import android.app.Application
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.passengerscreen.video.PassengerScreenApp
import com.passengerscreen.video.data.VideoItem
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class LibraryState(
    val loading: Boolean = false,
    val hasMediaPermission: Boolean = false,
    val deviceVideos: List<VideoItem> = emptyList(),
    val folderVideos: List<VideoItem> = emptyList(),
    val networkVideos: List<VideoItem> = emptyList(),
    val error: String? = null
)

class LibraryViewModel(app: Application) : AndroidViewModel(app) {

    private val repository = (app as PassengerScreenApp).repository

    private val _state = MutableStateFlow(LibraryState())
    val state: StateFlow<LibraryState> = _state.asStateFlow()

    init {
        _state.update { it.copy(networkVideos = repository.networkEntries()) }
    }

    fun onPermissionResult(granted: Boolean) {
        _state.update { it.copy(hasMediaPermission = granted) }
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            val device = if (_state.value.hasMediaPermission) {
                runCatching { repository.loadDeviceVideos() }
            } else {
                Result.success(emptyList())
            }
            val folders = runCatching { repository.loadFolderVideos() }
            _state.update { current ->
                current.copy(
                    loading = false,
                    deviceVideos = device.getOrDefault(emptyList()),
                    folderVideos = folders.getOrDefault(emptyList()),
                    networkVideos = repository.networkEntries(),
                    error = (device.exceptionOrNull() ?: folders.exceptionOrNull())?.message
                )
            }
        }
    }

    fun addFolder(treeUri: Uri) {
        repository.addFolder(treeUri)
        refresh()
    }

    fun addNetworkUrl(url: String, title: String) {
        val trimmed = url.trim()
        if (trimmed.isEmpty()) return
        repository.addNetworkUrl(trimmed, title.trim())
        _state.update { it.copy(networkVideos = repository.networkEntries()) }
    }

    fun removeNetworkUrl(url: String) {
        repository.removeNetworkUrl(url)
        _state.update { it.copy(networkVideos = repository.networkEntries()) }
    }

    fun resumePosition(uri: String): Long = repository.resumePosition(uri)
}
