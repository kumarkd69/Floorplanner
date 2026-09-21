package com.passengerscreen.video

import android.app.Application
import com.passengerscreen.video.data.VideoRepository

class PassengerScreenApp : Application() {

    val repository: VideoRepository by lazy { VideoRepository(this) }
}
