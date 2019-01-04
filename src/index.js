
import Konva from 'konva';
import _ from 'lodash';

import { AudioBufferOps } from './AudioBufferOps.js';
import { AudioPlayer } from "./AudioPlayer.js";
import { TimeAxisShape } from './TimeAxis.js';
import { WaveformShape } from './Waveform.js';
import { Region } from './Region.js';

import * as Comlink from 'comlinkjs';
import Worker from 'worker-loader!./task.js';

const AudioTask = Comlink.proxy(new Worker());

var audioTask = null;
var defaultSampleRate = 8000;
var audioBuffer = null;
var audioFilePath = '';

var audioPlayer = null

/*
  Drawing Area:
  +----------+----+----------+----+------------------------------------------------+
  |          |    |          |    |                                                |
  |          |    |          |    |                                                |
  +----------+----+----------+----+------------------------------------------------+
  |          |    |          |    |                                                |
  0          s    p          c    e                                                1
  |   hide   |      visible       |                    hide                        |
  |          |     view port      |                                                |

  s: viewport start, scroll position
  e: viewport end
  p: playback position
  c: cursor position
*/

var mmapClientHeight = 80; // px
var waveClientHeight = 240; // px
var minScrollBarWidth = 8; // px
var scrollBarWidth = 0; // px
var scrollBarHeight = 10; // px
var clientWidth = 1000; // px
var clientHeight = waveClientHeight + 1 + scrollBarHeight; // px
var totalClientWidth = clientWidth; // px
var pixelsPerSeconds = 20;
var plotMode = 'peak'; // peak or wave mode
var peakPlotRatio = 4; // peak mode only
var wavePlotRatio = 1; // wave mode only
var viewportRatio = clientWidth / totalClientWidth;
var viewportPosition = 0; // sec
var cursorPosition = 0; // sec
var playbackStartPosition = 0; // sec
var playbackPosition = 0; // sec
var cursorKnobSize = 10; // px
var cursorEnabled = false;
var regionKnobSize = 10; // px
var regions = [];
var activeRegion = null;
var minSelectWidth = 10; // px
var selectState = {
    start: 0,
    end: 0,
    state: 'empty'
};

function dumpDebugInfo() {
    let div = document.getElementById('waveform-debug');
    if (div) {
        let ostr = '<pre style="font-size: 18px;">debug dump:\n';

        ostr += `  file path: ${audioFilePath}\n`;
        ostr += `  file size: ${audioBuffer.length} bytes, duration: ${audioBuffer.duration.toFixed(3)}s, rate: ${audioBuffer.sampleRate}HZ\n`
        ostr += `  pixels: ${pixelsPerSeconds}pps, viewport range: ${(viewportRatio * audioBuffer.duration).toFixed(3)}s, ratio: ${viewportRatio.toFixed(3)}%\n`
        ostr += `  scroll: ${viewportPosition.toFixed(3)}s\n`
        ostr += `  cursor: ${cursorPosition.toFixed(3)}s\n`
        ostr += `  playback: ${playbackStartPosition.toFixed(3)}s - ${playbackPosition.toFixed(3)}s\n`;

        ostr += `  select: ${selectState.state}\n`;
        if (selectState.state != 'empty') {
            ostr += `    start: ${selectState.start.toFixed(3)}s\n`;
            ostr += `    end: ${selectState.end.toFixed(3)}s\n`;
        }

        if (regions.length) {
            ostr += '  regions:\n';
            for (let i = 0; i < regions.length; i++) {
                let r = regions[i];
                ostr += `    #${r.id}: (${r.start.toFixed(3)}s, ${r.end.toFixed(3)}s), label: ${r.label}\n`;
            }
        } else {
            ostr += '  regions: empty\n';
        }
        if (activeRegion) {
            ostr += `  active region: #${activeRegion.id}\n`;
        } else {
            ostr += '  active region: none\n';
        }

        ostr += '</pre>';

        div.innerHTML = ostr;
    }
}

// time to index
function time2Idx(t) {
    return ~~((t / audioBuffer.duration) * audioBuffer.length);
}

function idx2Time(i) {
    return (i / audioBuffer.length) * audioBuffer.duration;
}

// time to percent
function time2Percent(t) {
    return t / audioBuffer.duration;
}

// time to position
function time2Pos(t) {
    return ~~((t / audioBuffer.duration) * clientWidth);
}

function pos2Time(x) {
    return (x / clientWidth) * audioBuffer.duration;
}

// time to viewport position
function time2ViewPos(t) {
    return ~~((t - viewportPosition) / audioBuffer.duration * totalClientWidth);
}

function viewPos2Time(x) {
    return ((x / totalClientWidth) * audioBuffer.duration) + viewportPosition;
}

// Composing minimap
var minimap = new Konva.Layer();

var mmapTrack = new WaveformShape({
    width: clientWidth,
    height: mmapClientHeight,
    stroke: '#85C1E9',
    strokeWidth: 1,
    fill: '#85C1E9',
    name: 'track'
});

minimap.add(mmapTrack);

var mmapTAxis = new TimeAxisShape({
    width: clientWidth,
    height: mmapClientHeight,
    stroke: '#8812D0',
    strokeWidth: 1,
    name: 'time-axis'
})

minimap.add(mmapTAxis);

var mmapProgress = new Konva.Rect({
    x: 0,
    y: 0,
    width: 0,
    height: mmapClientHeight,
    stroke: '#6E4786',
    strokeWidth: 1,
    fill: '#6E4786',
    opacity: 0.5,
    name: 'progress'
});

minimap.add(mmapProgress);

var mmapCursor = new Konva.Rect({
    x: 0,
    y: 0,
    width: scrollBarWidth,
    height: mmapClientHeight,
    stroke: '#1E8449',
    strokeWidth: 1,
    fill: '#1E8449',
    opacity: 0.5,
    name: 'cursor'
});

minimap.add(mmapCursor);

minimap.add(new Konva.Line({
    points: [
        0, 0,
        clientWidth, 0,
        clientWidth, mmapClientHeight,
        0, mmapClientHeight
    ],
    stroke: 'black',
    strokeWidth: 1,
    name: 'border'
}));

var minimapStage = new Konva.Stage({
    container: 'waveform-minimap',
    width: clientWidth,
    height: mmapClientHeight
});

minimapStage.add(minimap);

// Composing waveform
var waveform = new Konva.Layer();

var waveTrack = new WaveformShape({
    width: clientWidth,
    height: waveClientHeight,
    stroke: '#0066ff',
    strokeWidth: 1,
    fill: '#0066ff',
    name: 'track'
});

waveform.add(waveTrack);

var waveTAxis = new TimeAxisShape({
    width: clientWidth,
    height: waveClientHeight,
    stroke: '#8812D0',
    strokeWidth: 1,
    name: 'time-axis'
});

waveform.add(waveTAxis);

var waveProgress = new Konva.Rect({
    x: 0,
    y: 0,
    width: 0,
    height: waveClientHeight,
    stroke: '#6E4786',
    strokeWidth: 1,
    fill: '#6E4786',
    opacity: 0.5,
    name: 'progress'
});

waveform.add(waveProgress);

var waveSelect = new Konva.Rect({
    x: 0,
    y: 0,
    width: 0,
    height: waveClientHeight,
    stroke: '#BB8FCE',
    strokeWidth: 1,
    fill: '#BB8FCE',
    fillEnabled: true,
    opacity: 0.35,
    name: 'select'
});

waveform.add(waveSelect);

var waveCursor = new Konva.Rect({
    x: 0,
    y: 0,
    width: 1,
    height: waveClientHeight,
    stroke: 'red',
    strokeWidth: 1,
    fill: 'red',
    visible: false,
    name: 'cursor'
});

waveform.add(waveCursor);

var waveCursorKnob = new Konva.Rect({
    x: 0 - cursorKnobSize / 2,
    y: waveClientHeight / 2 - cursorKnobSize / 2,
    width: cursorKnobSize,
    height: cursorKnobSize,
    stroke: 'black',
    strokeWidth: 1,
    fill: 'white',
    visible: false,
    name: 'cursor-knob',
    draggable: true,
    dragBoundFunc: function (pos) {
        let x = pos.x;
        if (x < -cursorKnobSize / 2) x = -cursorKnobSize / 2;
        if (x > clientWidth - cursorKnobSize / 2) x = clientWidth - cursorKnobSize / 2;
        return {
            x: x,
            y: waveClientHeight / 2 - cursorKnobSize / 2
        }
    }
});

waveCursorKnob.on("dragmove", function (e) {
    let x = e.target.position().x + regionKnobSize / 2;
    cursorPosition = viewPos2Time(x);
    updateUI();
});

waveform.add(waveCursorKnob);

waveform.add(new Konva.Rect({
    x: 0,
    y: waveClientHeight + 1,
    width: clientWidth,
    height: clientHeight,
    stroke: '#F4F6F6',
    strokeWidth: 1,
    fill: '#F4F6F6',
    fillEnabled: true,
    name: 'scrollbar-rect'
}));

var waveScroll = new Konva.Rect({
    x: 0,
    y: waveClientHeight + 1,
    width: scrollBarWidth,
    height: clientHeight,
    stroke: '#34495E',
    strokeWidth: 1,
    fill: '#34495E',
    fillEnabled: true,
    name: 'scroll',
    draggable: true,
    dragBoundFunc: function (pos) {
        let x = pos.x;
        if (x < 0) x = 0;
        if (x > clientWidth - this.width()) x = clientWidth - this.width();
        return {
            x: x,
            y: waveClientHeight + 1
        }
    }
});

waveform.add(waveScroll);

waveform.add(new Konva.Line({
    points: [
        0, 0,
        clientWidth, 0,
        clientWidth, clientHeight,
        0, clientHeight
    ],
    stroke: 'black',
    strokeWidth: 1,
    name: 'border'
}));

var waveformStage = new Konva.Stage({
    container: 'waveform',
    width: clientWidth,
    height: clientHeight
});

waveformStage.add(waveform);

waveTrack.on('dblclick', function (e) {
    if (audioBuffer == null) {
        return;
    }
    cursorEnabled = true;
    let pos = waveformStage.getPointerPosition();
    cursorPosition = viewPos2Time(pos.x);
    updateUI();
});

waveScroll.on('dragmove', function (e) {
    if (audioBuffer == null) {
        return;
    }
    let pos = waveScroll.position();
    viewportPosition = pos2Time(pos.x);
    updateUI();
});

function removeSelectUI(refresh) {
    dumpDebugInfo();
    waveSelect.position({ x: 0, y: 0 });
    waveSelect.width(0);
    if (refresh) {
        _.debounce(function () {
            waveform.batchDraw();
        }, 0)();
    }
}

function updateSelectUI(refresh) {
    let s = time2ViewPos(selectState.start);
    let l = time2ViewPos(selectState.end) - s;
    dumpDebugInfo();
    waveSelect.position({ x: s, y: 0 });
    waveSelect.width(l);
    if (refresh) {
        _.debounce(function () {
            waveform.batchDraw();
        }, 0)();
    }
}

waveformStage.on('mousedown', function (e) {
    if (audioBuffer == null) {
        return;
    }
    if (e.evt.ctrlKey) {
        let pos = waveformStage.getPointerPosition();
        let start = viewPos2Time(pos.x);
        selectState.start = start;
        selectState.end = start;
        selectState.state = 'init';
        updateSelectUI(true);
    }
});

waveformStage.on('mousemove', function (e) {
    if (selectState.state == 'init') {
        if (e.evt.ctrlKey) {
            let pos = waveformStage.getPointerPosition();
            selectState.end = viewPos2Time(pos.x);
            updateSelectUI(true);
        }
    }
});

waveformStage.on('mouseup', function (e) {
    if (selectState.state == 'init') {
        if (e.evt.ctrlKey) {
            let pos = waveformStage.getPointerPosition();
            let len = pos.x - time2ViewPos(selectState.start);
            if (Math.abs(len) >= minSelectWidth) {
                let end = viewPos2Time(pos.x)
                if (end > selectState.start) {
                    selectState.end = end
                } else {
                    selectState.end = selectState.start;
                    selectState.start = end;
                }
                selectState.state = 'ready';
                updateSelectUI(true);
            } else {
                selectState.state = 'empty';
                removeSelectUI(true);
            }
        }
    }
});

function createRegionRect(region) {
    let s = time2ViewPos(region.start);
    let l = time2ViewPos(region.end) - s;
    region.ui.rect = new Konva.Rect({
        x: s,
        y: 0,
        width: l,
        height: waveClientHeight,
        stroke: '#B03A2E',
        strokeWidth: 1,
        fill: '#B03A2E',
        fillEnabled: true,
        opacity: 0.75,
        id: region.id,
        name: 'region'
    });
    region.ui.rect.on('click', function (e) {
        let id = e.target.id();
        let region = Region.find(regions, id);
        if (region != activeRegion) {
            console.log("Region: #" + id + " selected.");
            activeRegion = region;
        }
    });
    waveform.add(region.ui.rect);
    s = time2Pos(region.start);
    l = time2Pos(region.end) - s;
    region.ui.mmap = new Konva.Rect({
        x: s,
        y: 0,
        width: l,
        height: mmapClientHeight,
        stroke: '#B03A2E',
        strokeWidth: 1,
        fill: '#B03A2E',
        fillEnabled: true,
        opacity: 0.75,
        id: region.id,
        name: 'region'
    });
    minimap.add(region.ui.mmap);
}

function createRegionLabel(region) {
    let s = time2ViewPos(region.start);
    if (region.label != "") {
        region.ui.label = new Konva.Label({
            x: s,
            y: waveClientHeight / 2,
            opacity: 0.75,
            fill: 'yellow',
            name: 'region-label'
        });
        region.ui.label.add(new Konva.Tag({
            pointerDirection: 'left',
            pointerWidth: 18,
            pointerHeight: 12,
            fill: 'yellow'
        }));
        region.ui.label.add(new Konva.Text({
            text: region.label,
            fontSize: 12,
            align: 'center',
            verticalAlign: 'middle',
            fill: 'black',
            padding: 5
        }));
        waveform.add(region.ui.label);
    }
}

function createRegionKnob(region) {
    let s = time2ViewPos(region.start);
    let e = time2ViewPos(region.end);
    region.ui.knob = [];
    region.ui.knob[0] = new Konva.Rect({
        x: s - regionKnobSize / 2,
        y: waveClientHeight / 2 - regionKnobSize / 2,
        width: regionKnobSize,
        height: regionKnobSize,
        stroke: 'black',
        strokeWidth: 1,
        fill: 'white',
        fillEnabled: true,
        id: region.id,
        name: 'region-knob-left',
        draggable: true,
        dragBoundFunc: function (pos) {
            let x = pos.x;
            if (x < -regionKnobSize / 2) x = -regionKnobSize / 2;
            if (x > clientWidth - regionKnobSize / 2) x = clientWidth - regionKnobSize / 2;
            return {
                x: x,
                y: waveClientHeight / 2 - regionKnobSize / 2
            }
        }
    });
    region.ui.knob[1] = new Konva.Rect({
        x: e - regionKnobSize / 2,
        y: waveClientHeight / 2 - regionKnobSize / 2,
        width: regionKnobSize,
        height: regionKnobSize,
        stroke: 'black',
        strokeWidth: 1,
        fill: 'white',
        fillEnabled: true,
        id: region.id,
        name: 'region-knob-right',
        draggable: true,
        dragBoundFunc: function (pos) {
            let x = pos.x;
            if (x < -regionKnobSize / 2) x = -regionKnobSize / 2;
            if (x > clientWidth - regionKnobSize / 2) x = clientWidth - regionKnobSize / 2;
            return {
                x: x,
                y: waveClientHeight / 2 - regionKnobSize / 2
            }
        }
    });
    region.ui.knob[0].on("dragmove", function (e) {
        let region = Region.find(regions, e.target.id());
        if (region) {
            let name = e.target.name();
            let x = e.target.position().x + regionKnobSize / 2;
            if (name == "region-knob-left") {
                region.start = viewPos2Time(x);
            } else {
                region.end = viewPos2Time(x);
            }
            updateRegionUI(region, true);
        }
    });
    region.ui.knob[1].on("dragmove", function (e) {
        let region = Region.find(regions, e.target.id());
        if (region) {
            let name = e.target.name();
            let x = e.target.position().x + regionKnobSize / 2;
            if (name == "region-knob-left") {
                region.start = viewPos2Time(x);
            } else {
                region.end = viewPos2Time(x);
            }
            updateRegionUI(region, true);
        }
    });
    waveform.add(region.ui.knob[0]);
    waveform.add(region.ui.knob[1]);
}

function createRegionUI(region, refresh) {
    createRegionRect(region);
    createRegionLabel(region);
    createRegionKnob(region);
    if (refresh) {
        _.debounce(function () {
            minimap.batchDraw();
            waveform.batchDraw();
        }, 0)();
    }
}

function updateRegionUI(region, refresh) {
    let s = time2ViewPos(region.start);
    let e = time2ViewPos(region.end);
    dumpDebugInfo();
    if (region.ui.rect) {
        region.ui.rect.position({ x: s, y: 0 });
        region.ui.rect.width(e - s);
    }
    if (region.ui.label) {
        region.ui.label.position({ x: s, y: waveClientHeight / 2 });
    }
    if (region.ui.knob) {
        region.ui.knob[0].position({
            x: s - regionKnobSize / 2,
            y: waveClientHeight / 2 - regionKnobSize / 2
        });
        region.ui.knob[1].position({
            x: e - regionKnobSize / 2,
            y: waveClientHeight / 2 - regionKnobSize / 2
        });
    }
    s = time2Pos(region.start);
    e = time2Pos(region.end);
    if (region.ui.mmap) {
        region.ui.mmap.position({ x: s, y: 0 });
        region.ui.mmap.width(e - s);
    }
    if (refresh) {
        _.debounce(function () {
            minimap.batchDraw();
            waveform.batchDraw();
        }, 0)();
    }
}

function removeRegionUI(region, refresh) {
    if (region.ui.rect) {
        region.ui.rect.remove();
        region.ui.rect = null;
    }
    if (region.ui.label) {
        region.ui.label.remove();
        region.ui.label = null;
    }
    if (region.ui.knob) {
        region.ui.knob[0].remove();
        region.ui.knob[1].remove();
        region.ui.knob = null;
    }
    if (region.ui.mmap) {
        region.ui.mmap.remove();
        region.ui.mmap = null;
    }
    if (refresh) {
        _.debounce(function () {
            minimap.batchDraw();
            waveform.batchDraw();
        }, 0)();
    }
}

function resetMmapUI(dataBuffer, mode, duration) {
    mmapTrack.setData(dataBuffer, mode);
    mmapTrack.setRange(0, 1.0);
    mmapTAxis.setDuration(duration);
    mmapTAxis.setRange(0, 1.0);
}

function resetWaveUI(dataBuffer, mode, duration, range) {
    waveTrack.setData(dataBuffer, mode);
    waveTrack.setRange(0, range);
    waveTAxis.setDuration(duration);
    waveTAxis.setRange(0, range);
    waveProgress.width(0);
    let x = time2Pos(viewportPosition);
    waveScroll.position({ x: x, y: waveClientHeight + 1 });
    waveScroll.width(scrollBarWidth);
}

function updateMmapUI(refresh, delay) {
    let xc = time2Pos(viewportPosition);
    mmapCursor.position({ x: xc, y: 0 });
    mmapCursor.width(scrollBarWidth);
    let xp = time2Pos(playbackStartPosition);
    let xl = time2Pos(playbackPosition) - xp;
    mmapProgress.position({ x: xp, y: 0 });
    mmapProgress.width(xl);
    if (refresh) {
        _.debounce(function () {
            minimap.batchDraw();
        }, delay || 0)();
    }
}

function updateWaveUI(refresh, delay) {
    let offset = time2Percent(viewportPosition);
    waveTrack.setOffset(offset);
    waveTAxis.setOffset(offset);
    let cursor = time2ViewPos(cursorPosition);
    waveCursor.position({ x: cursor, y: 0 });
    waveCursor.visible(cursorEnabled);
    waveCursorKnob.position({
        x: cursor - cursorKnobSize / 2,
        y: waveClientHeight / 2 - cursorKnobSize / 2
    });
    waveCursorKnob.visible(cursorEnabled);
    let xp = time2ViewPos(playbackStartPosition);
    let xl = time2ViewPos(playbackPosition) - xp;
    waveProgress.position({ x: xp, y: 0 });
    waveProgress.width(xl);
    if (selectState.state == 'ready') {
        updateSelectUI(false);
    }
    if (refresh) {
        _.debounce(function () {
            waveform.batchDraw();
        }, delay || 0)();
    }
}

function updateUI(delay) {
    dumpDebugInfo();
    updateMmapUI(false);
    updateWaveUI(false);
    for (let region of regions) {
        updateRegionUI(region, false);
    }
    _.debounce(function () {
        minimap.batchDraw();
        waveform.batchDraw();
    }, delay || 0)();
}

function decodeAudioFile(audioData, callback) {
    let offlineCtx = new (window.OfflineAudioContext ||
        window.webkitOfflineAudioContext)(1, defaultSampleRate * 1, defaultSampleRate);
    offlineCtx.decodeAudioData(audioData,
        function (aBuffer) {
            let sampleRate = aBuffer.sampleRate;
            let length = aBuffer.length;
            let duration = aBuffer.duration;
            console.log("Audio buffer decoded: length=" + length + ", sampleRate=" + sampleRate + ', duration=' + duration);
            callback(aBuffer);
        },
        function (e) {
            console.log("Audio buffer decoding error: " + e.err);
        });
}

async function loadAudioBuffer(aBuffer, resetState) {
    audioBuffer = aBuffer || audioBuffer;

    if (pixelsPerSeconds == 'auto') {
        pixelsPerSeconds = clientWidth / audioBuffer.duration;
    }

    if (plotMode == 'wave' && pixelsPerSeconds <= 160) {
        plotMode = 'peak'; // reduce plotting time
        console.log('Force using peak mode.');
    }

    if (plotMode == 'peak' && pixelsPerSeconds >= audioBuffer.sampleRate / 16) {
        plotMode = 'wave';
        console.log('Force using wave mode.');
    }

    totalClientWidth = ~~(audioBuffer.duration * pixelsPerSeconds);
    viewportRatio = clientWidth / totalClientWidth;

    scrollBarWidth = ~~(clientWidth * viewportRatio);
    if (scrollBarWidth < minScrollBarWidth) {
        scrollBarWidth = minScrollBarWidth;
    }

    if (resetState) {
        viewportPosition = 0;
        cursorPosition = 0;
        cursorEnabled = false;
        playbackStartPosition = 0;
        playbackPosition = 0;
        regions = [];
        activeRegion = null;
        selectState.state = 'empty';
        selectState.start = 0;
        selectState.end = 0;
    }

    // adjust scroll bar position
    let pos = time2Pos(viewportPosition);
    if (pos + scrollBarWidth > clientWidth) {
        viewportPosition = pos2Time(clientWidth - scrollBarWidth);
    }

    dumpDebugInfo();

    let channelBuffer = audioBuffer.getChannelData(0);

    if (aBuffer) {
        // for new audio buffer
        audioTask = await new AudioTask(channelBuffer, audioBuffer.sampleRate);
        audioTask.buildPeaks(clientWidth * peakPlotRatio,
            Comlink.proxyValue(function (outputBuffer) {
                resetMmapUI(outputBuffer, 'peak', audioBuffer.duration);
                updateMmapUI(true);
            }));
    } else {
        updateMmapUI(true);
    }

    if (plotMode == 'peak') {
        audioTask.buildPeaks(totalClientWidth * peakPlotRatio,
            Comlink.proxyValue(function (outputBuffer) {
                resetWaveUI(outputBuffer, 'peak',
                    audioBuffer.duration, viewportRatio);
                updateWaveUI(true);
            }));
    } else {
        resetWaveUI(channelBuffer, 'wave',
            audioBuffer.duration, viewportRatio);
        updateWaveUI(true);
    }
}

function getRemoteAudioFile(audioPath, callback) {
    let request = new XMLHttpRequest();
    request.open('GET', audioPath, true);
    request.responseType = 'arraybuffer';
    request.onload = function () {
        audioFilePath = audioPath;
        console.log("Audio file read: " + audioFilePath);
        let audioData = request.response;
        decodeAudioFile(audioData, callback);
    }
    request.send();
}

function getLocalAudioFile(audioPath, callback) {
    var reader = new FileReader();
    reader.onload = function () {
        audioFilePath = audioPath.name;
        console.log("Audio file read: " + audioFilePath);
        let audioData = reader.result;
        decodeAudioFile(audioData, callback);
    }
    reader.readAsArrayBuffer(audioPath);
}

function handleFileEvent(evt) {
    getLocalAudioFile(evt.target.files[0], function (aBuffer) {
        loadAudioBuffer(aBuffer, true);
    });
}

document.getElementById('audio-file').addEventListener('change', handleFileEvent, false);

function handlePlayEvent(evt) {
    if (audioBuffer == null) {
        alert("Audio buffer is not ready!");
        return;
    }
    if (audioPlayer == null) {
        audioPlayer = new AudioPlayer(audioBuffer);
        audioPlayer.on('progress', function (position) {
            playbackPosition = position;
            updateUI();
        });
        audioPlayer.on('end', function (position, reason) {
            if (reason == 'stopped' || reason == 'paused') {
                playbackPosition = position;
            } else {
                playbackPosition = playbackStartPosition;
            }
            updateUI();
        });
    }
    if (audioPlayer.getState() == 'paused') {
        console.log("Resume");
        audioPlayer.resume();
    } else {
        let div1 = document.getElementById('play-from');
        let playFrom = div1.options[div1.selectedIndex].value || 'begin';
        let div2 = document.getElementById('loop-mode');
        let loopMode = div2.options[div2.selectedIndex].value || 'off';
        let start = 0, end, loop = loopMode == 'on';
        switch (playFrom) {
            case 'cursor':
                start = cursorPosition;
                break;
            case 'select':
                if (selectState.state == 'ready') {
                    start = selectState.start;
                    end = selectState.end;
                } else {
                    alert("There is no selection.");
                    return;
                }
                break;
            case 'region':
                if (activeRegion) {
                    start = activeRegion.start;
                    end = activeRegion.end;
                } else {
                    alert("There is no active region.");
                    return;
                }
                break;
        }
        audioPlayer.setLoopMode(loop);
        console.log("Play");
        playbackStartPosition = start;
        audioPlayer.start(start, end);
    }
}

function handlePauseEvent(evt) {
    if (audioPlayer != null) {
        console.log("Pause");
        audioPlayer.pause();
    }
}

function handleStopEvent(evt) {
    if (audioPlayer != null) {
        console.log("Stop");
        audioPlayer.stop();
    }
}

document.getElementById('btn-play').addEventListener('click', handlePlayEvent, false);
document.getElementById('btn-pause').addEventListener('click', handlePauseEvent, false);
document.getElementById('btn-stop').addEventListener('click', handleStopEvent, false);

function handleVolUpEvent(evt) {
    if (audioPlayer != null) {
        console.log("Volume up");
        audioPlayer.incVolume();
        console.log("Volume up: vol=" + audioPlayer.getVolume());
    }
}

function handleVolDownEvent(evt) {
    if (audioPlayer != null) {
        console.log("Volume down");
        audioPlayer.decVolume();
        console.log("Volume down: vol=" + audioPlayer.getVolume());
    }
}

function handleMuteEvent(evt) {
    if (audioPlayer != null) {
        console.log("Mute");
        audioPlayer.mute(true);
    }
}

function handleUnmuteEvent(evt) {
    if (audioPlayer != null) {
        console.log("Unmute");
        audioPlayer.mute(false);
    }
}

document.getElementById('btn-vol-up').addEventListener('click', handleVolUpEvent, false);
document.getElementById('btn-vol-down').addEventListener('click', handleVolDownEvent, false);
document.getElementById('btn-mute').addEventListener('click', handleMuteEvent, false);
document.getElementById('btn-unmute').addEventListener('click', handleUnmuteEvent, false);

function handleZoomInEvent(evt) {
    if (audioBuffer == null) {
        alert("Audio buffer is not ready!");
        return;
    }
    if (pixelsPerSeconds >= audioBuffer.sampleRate) {
        alert("Can't zoom in anymore!");
        return;
    }
    pixelsPerSeconds *= 2;
    if (pixelsPerSeconds > audioBuffer.sampleRate) {
        pixelsPerSeconds = audioBuffer.sampleRate;
    }
    console.log("Zoom in: pps=" + pixelsPerSeconds);
    loadAudioBuffer(null, false);
}

function handleZoomOutEvent(evt) {
    if (audioBuffer == null) {
        alert("Audio buffer is not ready!");
        return;
    }
    if (pixelsPerSeconds <= (clientWidth / audioBuffer.duration)) {
        alert("Can't zoom out anymore!");
        return;
    }
    pixelsPerSeconds /= 2;
    if (pixelsPerSeconds < (clientWidth / audioBuffer.duration)) {
        pixelsPerSeconds = (clientWidth / audioBuffer.duration);
    }
    console.log("Zoom out: pps=" + pixelsPerSeconds);
    loadAudioBuffer(null, false);
}

document.getElementById('btn-zoom-in').addEventListener('click', handleZoomInEvent, false);
document.getElementById('btn-zoom-out').addEventListener('click', handleZoomOutEvent, false);

let clipboardData = null;

function handleEditCopyEvent(evt) {
    if (selectState.state == 'ready') {
        let start = selectState.start;
        let end = selectState.end;
        clipboardData = AudioBufferOps.sliceToArray(audioBuffer,
            time2Idx(start), time2Idx(end));
        console.log("Copied: " + clipboardData.length + " bytes.");
    }
}

function handleEditCutEvent(evt) {
    if (selectState.state == 'ready') {
        let start = selectState.start;
        let end = selectState.end;
        clipboardData = AudioBufferOps.sliceToArray(audioBuffer,
            time2Idx(start), time2Idx(end));
        console.log("Cut: " + clipboardData.length + " bytes.");
        let newBuffer = AudioBufferOps.shrink(audioBuffer,
            time2Idx(start), time2Idx(end));
        selectState.state = 'empty';
        loadAudioBuffer(newBuffer, false);
    }
}

function handleEditPasteEvent(evt) {
    if (clipboardData == null) {
        return;
    }
    let newBuffer = AudioBufferOps.insert(audioBuffer,
        time2Idx(cursorPosition), clipboardData);
    console.log("Pasted: " + clipboardData.length + " bytes.");
    loadAudioBuffer(newBuffer, false);
}

document.getElementById('btn-edit-copy').addEventListener('click', handleEditCopyEvent, false);
document.getElementById('btn-edit-cut').addEventListener('click', handleEditCutEvent, false);
document.getElementById('btn-edit-paste').addEventListener('click', handleEditPasteEvent, false);

function handleRegionAddEvent(evt) {
    if (selectState.state == 'ready') {
        let label = prompt("Please enter label", "");
        let start = selectState.start;
        let end = selectState.end;
        console.log("Add region");
        let region = new Region(start, end, label);
        if (!Region.addRegion(regions, region)) {
            alert("Region overlapped!");
            return;
        }
        selectState.state = 'empty';
        removeSelectUI(true);
        createRegionUI(region, true);
    }
}

function handleRegionRemoveEvent(evt) {
    if (activeRegion == null) {
        return;
    }
    console.log("Remove region");
    Region.delRegion(regions, activeRegion);
    removeRegionUI(activeRegion, true);
    activeRegion = null;
}

function handleRegionEditEvent(evt) {
    if (activeRegion == null) {
        return;
    }
    console.log("Edit region");
}

document.getElementById('btn-region-add').addEventListener('click', handleRegionAddEvent, false);
document.getElementById('btn-region-remove').addEventListener('click', handleRegionRemoveEvent, false);
document.getElementById('btn-region-edit').addEventListener('click', handleRegionEditEvent, false);

function handleBufferSilenceEvent(evt) {
    if (audioBuffer == null) {
        alert("Audio buffer is not ready!");
        return;
    }
    let div = document.getElementById('buffer-range');
    let range = div.options[div.selectedIndex].value || 'full';
    let start = 0, end = audioBuffer.duration;
    switch (range) {
        case 'select':
            if (selectState.state == 'ready') {
                start = selectState.start;
                end = selectState.end;
            } else {
                alert("There is no selection.");
                return;
            }
            break;
        case 'region':
            if (activeRegion) {
                start = activeRegion.start;
                end = activeRegion.end;
            } else {
                alert("There is no active region.");
                return;
            }
            break;
    }
    AudioBufferOps.fill(audioBuffer, 0, time2Idx(start), time2Idx(end));
    loadAudioBuffer(audioBuffer, false);
}

function handleBufferScaleEvent(evt) {
    if (audioBuffer == null) {
        alert("Audio buffer is not ready!");
        return;
    }
    let div = document.getElementById('buffer-range');
    let range = div.options[div.selectedIndex].value || 'full';
    let start = 0, end = audioBuffer.duration;
    switch (range) {
        case 'select':
            if (selectState.state == 'ready') {
                start = selectState.start;
                end = selectState.end;
            } else {
                alert("There is no selection.");
                return;
            }
            break;
        case 'region':
            if (activeRegion) {
                start = activeRegion.start;
                end = activeRegion.end;
            } else {
                alert("There is no active region.");
                return;
            }
            break;
    }
    let input = prompt("Please enter value", "1.0");
    let scale = parseFloat(input);
    AudioBufferOps.scale(audioBuffer, scale, time2Idx(start), time2Idx(end));
    loadAudioBuffer(audioBuffer, false);
}

function handleBufferNormEvent(evt) {
    if (audioBuffer == null) {
        alert("Audio buffer is not ready!");
        return;
    }
    let div = document.getElementById('buffer-range');
    let range = div.options[div.selectedIndex].value || 'full';
    let start = 0, end = audioBuffer.duration;
    switch (range) {
        case 'select':
            if (selectState.state == 'ready') {
                start = selectState.start;
                end = selectState.end;
            } else {
                alert("There is no selection.");
                return;
            }
            break;
        case 'region':
            if (activeRegion) {
                start = activeRegion.start;
                end = activeRegion.end;
            } else {
                alert("There is no active region.");
                return;
            }
            break;
    }
    AudioBufferOps.norm(audioBuffer, time2Idx(start), time2Idx(end));
    loadAudioBuffer(audioBuffer, false);
}

document.getElementById('btn-buffer-silence').addEventListener('click', handleBufferSilenceEvent, false);
document.getElementById('btn-buffer-amplify').addEventListener('click', handleBufferScaleEvent, false);
document.getElementById('btn-buffer-norm').addEventListener('click', handleBufferNormEvent, false);
