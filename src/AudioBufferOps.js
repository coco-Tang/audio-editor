
export const AudioBufferOps = {

    build: function (arrayBuffer, sampleRate) {
        let audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        let audioBuffer = audioCtx.createBuffer(1, arrayBuffer.length, sampleRate);
        audioBuffer.copyToChannel(arrayBuffer, 0, 0);
        return audioBuffer;
    },

    fill: function (audioBuffer, value, start, end) {
        let srcBuffer = audioBuffer.getChannelData(0);
        end = end || srcBuffer.length;
        for (let i = start; i < end; i++) {
            srcBuffer[i] = value;
        }
    },

    scale: function (audioBuffer, scale, start, end) {
        let srcBuffer = audioBuffer.getChannelData(0);
        end = end || srcBuffer.length;
        for (let i = start; i < end; i++) {
            let tmp = srcBuffer[i] * scale;
            tmp = Math.min(1.0, tmp);
            tmp = Math.max(tmp, -1.0);
            srcBuffer[i] = tmp;
        }
    },

    norm: function (audioBuffer, start, end) {
        let srcBuffer = audioBuffer.getChannelData(0);
        end = end || srcBuffer.length;
        let max = 0;
        for (let i = start; i < end; i++) {
            let tmp = Math.abs(srcBuffer[i]);
            if (tmp > max) {
                max = tmp;
            }
        }
        if (max == 0) {
            return;
        }
        let scale = 1.0 / max;
        for (let i = start; i < end; i++) {
            let tmp = srcBuffer[i] * scale;
            srcBuffer[i] = tmp;
        }
    },

    insert: function (audioBuffer, start, arrayBuffer) {
        let srcBuffer = audioBuffer.getChannelData(0);
        let destBuffer = new Float32Array(srcBuffer.length + arrayBuffer.length);
        let i = 0;
        for (let j = 0; j < start; j++ , i++) {
            destBuffer[i] = srcBuffer[j];
        }
        for (let j = 0; j < arrayBuffer.length; j++ , i++) {
            destBuffer[i] = arrayBuffer[j];
        }
        for (let j = start; j < srcBuffer.length; j++ , i++) {
            destBuffer[i] = srcBuffer[j];
        }
        return this.build(destBuffer, audioBuffer.sampleRate);
    },

    shrink: function (audioBuffer, start, end) {
        let srcBuffer = audioBuffer.getChannelData(0);
        end = end || srcBuffer.length;
        let len = end - start;
        let destBuffer = new Float32Array(srcBuffer.length - len);
        let i = 0;
        for (let j = 0; j < start; j++ , i++) {
            destBuffer[i] = srcBuffer[j];
        }
        for (let j = end; j < srcBuffer.length; j++ , i++) {
            destBuffer[i] = srcBuffer[j];
        }
        return this.build(destBuffer, audioBuffer.sampleRate);
    },

    sliceToArray: function (audioBuffer, start, end) {
        let srcBuffer = audioBuffer.getChannelData(0);
        start = start || 0;
        end = end || srcBuffer.length;
        let len = end - start;
        let destBuffer = new Float32Array(len);
        let i = 0;
        for (let j = start; j < end; j++ , i++) {
            destBuffer[i] = srcBuffer[j];
        }
        return destBuffer;
    },

    slice: function (audioBuffer, start, end) {
        return this.build(this.sliceToArray(audioBuffer, start, end),
            audioBuffer.sampleRate);
    },

};
