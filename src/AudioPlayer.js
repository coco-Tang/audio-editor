import { EventEmitter2 } from 'eventemitter2';

const PLAY_STATE_IDLE = 'idle';
const PLAY_STATE_PLAY = 'play';
const PLAY_STATE_PAUSED = 'paused';
const PLAY_STATE_STOPPED = 'stopped';

export class AudioPlayer {

    constructor(audioBuffer) {
        this.audioBuffer = audioBuffer;
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        this.sourceNode = null;
        this.volumeNode = null;
        this.state = PLAY_STATE_IDLE;
        this.volume = 1.0;
        this.muted = false;
        this.loop = false;
        this.playbackStartTime = 0;
        this.playbackStart = 0;
        this.playbackDuration = 0;
        this.playbackPosition = 0;
        this.updateTimer = null;
        this.eventEmitter = new EventEmitter2({});
    }

    on(event, callback) {
        this.eventEmitter.on(event, callback);
    }

    _updatePlaybackPosition() {
        let elapsed = this.audioCtx.currentTime - this.playbackStartTime;
        if (elapsed > this.playbackDuration && this.loop) {
            this.playbackStartTime += this.playbackDuration;
            this.elapsed -= this.playbackDuration;
        }
        this.playbackPosition = this.playbackStart + elapsed;
    }

    _restart(start, end) {
        this.sourceNode = this.audioCtx.createBufferSource()
        this.sourceNode.buffer = this.audioBuffer;
        this.sourceNode.loop = this.loop;
        this.sourceNode.loopStart = start;
        this.sourceNode.loopEnd = end;
        this.volumeNode = this.audioCtx.createGain();
        this.volumeNode.gain.value = this.muted ? 0 : this.volume;
        this.sourceNode.connect(this.volumeNode);
        this.volumeNode.connect(this.audioCtx.destination);
        this.playbackStartTime = this.audioCtx.currentTime;
        this.playbackStart = start;
        this.playbackDuration = end - start;
        this.playbackPosition = start;
        this.sourceNode.onended = function (e) {
            this._updatePlaybackPosition();
            console.log("Playback ended.");
            switch (this.state) {
                case PLAY_STATE_PLAY:
                    this.state = PLAY_STATE_STOPPED;
                    this.eventEmitter.emit('end', this.playbackPosition, 'stopped');
                    break;
                case PLAY_STATE_PAUSED:
                    this.eventEmitter.emit('end', this.playbackPosition, 'paused');
                    break;
                default:
                    this.eventEmitter.emit('end', this.playbackPosition);
                    break;
            }
        }.bind(this);
        this.state = PLAY_STATE_PLAY;
        if (this.loop) {
            this.sourceNode.start(0, this.playbackStart);
        } else {
            this.sourceNode.start(0, this.playbackStart, this.playbackDuration);
        }
        this.updateTimer = setInterval(function () {
            this._updatePlaybackPosition();
            switch (this.state) {
                case PLAY_STATE_PLAY:
                    this.eventEmitter.emit('progress', this.playbackPosition);
                    break;
            }
        }.bind(this), 100);
    }

    _stop(nextState) {
        clearInterval(this.updateTimer);
        this.state = nextState;
        this.sourceNode.stop();
    }

    start(start, end) {
        if (this.state != PLAY_STATE_IDLE) {
            throw "Invalid state";
        }
        start = start || 0;
        end = end || this.audioBuffer.duration;
        this._restart(start, end);
    }

    pause() {
        if (this.state != PLAY_STATE_PLAY) {
            throw "Invalid state";
        }
        this._stop(PLAY_STATE_PAUSED);
    }

    resume() {
        if (this.state != PLAY_STATE_PAUSED) {
            throw "Invalid state";
        }
        let start = this.playbackPosition;
        let end = this.playbackStart + this.playbackDuration;
        this._restart(start, end);
    }

    stop() {
        let prevState = this.state;
        if (this.state == PLAY_STATE_PLAY ||
            this.state == PLAY_STATE_STOPPED) {
            this._stop(PLAY_STATE_IDLE);
        } else {
            this.state = PLAY_STATE_IDLE;
        }
        if (prevState == PLAY_STATE_PAUSED ||
            prevState == PLAY_STATE_STOPPED) {
            this.eventEmitter.emit('end');
        }
    }

    getState() {
        return this.state;
    }

    getPlaybackPosition() {
        return this.playbackPosition;
    }

    getVolume() {
        return this.volume;
    }

    _applyVolume() {
        if (this.state == PLAY_STATE_PLAY) {
            this.volumeNode.gain.value = this.volume;
        }
    }

    setVolume(volume) {
        this.volume = volume;
        if (this.volume > 1.0) {
            this.volume = 1.0;
        }
        if (this.volume < 0.1) {
            this.volume = 0.1;
        }
        this._applyVolume();
    }

    incVolume() {
        this.volume += 0.1;
        if (this.volume > 1.0) {
            this.volume = 1.0;
        }
        this._applyVolume();
    }

    decVolume() {
        this.volume -= 0.1;
        if (this.volume < 0.1) {
            this.volume = 0.1;
        }
        this._applyVolume();
    }

    _applyMute() {
        if (this.state == PLAY_STATE_PLAY) {
            this.volumeNode.gain.value = this.muted ? 0 : this.volume;
        }
    }

    isMuted() {
        return this.muted;
    }

    mute(enabled) {
        this.muted = enabled;
        this._applyMute();
    }

    getLoopMode() {
        return this.loop;
    }

    setLoopMode(enabled) {
        this.loop = enabled;
    }

}
