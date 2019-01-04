
import Konva from 'konva';

const SECOND_IN_MILLI = 1000;

export function TimeAxisShape(options) {
    Konva.Shape.call(this, options);

    this.units = [
        SECOND_IN_MILLI / 100,
        SECOND_IN_MILLI / 10,
        SECOND_IN_MILLI,
        5 * SECOND_IN_MILLI,
        10 * SECOND_IN_MILLI,
        15 * SECOND_IN_MILLI,
        30 * SECOND_IN_MILLI,
        60 * SECOND_IN_MILLI,
        300 * SECOND_IN_MILLI,
        600 * SECOND_IN_MILLI,
        900 * SECOND_IN_MILLI,
        1800 * SECOND_IN_MILLI,
        3600 * SECOND_IN_MILLI
    ]; // in millisec
    this.unitRepeats = [
        10, 10, 10, 2, 3, 2, 2, 5, 2, 3, 2, 2, 1
    ];
    this.unitPrecise = [
        2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    ];

    this.duration = options.duration || 0;
    this.offset = options.offset || 0;
    this.length = options.length || 1.0;

    this.sceneFunc(this._sceneFunc);
}

TimeAxisShape.prototype = Object.create(Konva.Shape.prototype);

TimeAxisShape.prototype.setDuration = function (duration) {
    this.duration = duration;
}

TimeAxisShape.prototype.setRange = function (offset, length) {
    this.offset = offset;
    this.length = length;
}

TimeAxisShape.prototype.setOffset = function (offset) {
    this.offset = offset;
}

TimeAxisShape.prototype.setLength = function (length) {
    this.length = length;
}

function formatTime(val, prec) {
    let hour = ~~(val / (60 * 60));
    let rest = val % (60 * 60);
    let min = ~~(rest / 60);
    let sec = rest % 60;
    let outs = '';

    if (hour) {
        outs += `${hour}h`;
    }

    if (outs && min < 10) {
        outs += '0' + `${min}m`;
    } else if (min) {
        outs += `${min}m`;
    }

    if (outs && sec < 10) {
        outs += '0' + sec.toFixed(prec) + 's';
    } else {
        outs += sec.toFixed(prec) + 's'
    }

    return outs;
}

TimeAxisShape.prototype._sceneFunc = function (context, shape) {
    let start = this.offset * this.duration * SECOND_IN_MILLI;
    let len = this.length * this.duration * SECOND_IN_MILLI;
    let end = start + len;
    let w = this.width();
    let h = this.height();
    let i, unit, reps, prec;

    if (this.duration == 0 || start == end) {
        return;
    }

    for (i = this.units.length - 1; i >= 0; i--) {
        unit = this.units[i];
        reps = this.unitRepeats[i];
        prec = this.unitPrecise[i];
        if (unit <= (len / 15)) {
            break;
        }
    }

    let xcur = Math.floor(start / unit) * unit;
    let xinc = w / len;

    context.beginPath();

    for (; xcur < end; xcur += unit) {
        if (xcur < start) {
            continue;
        }
        let hasLabel = ((xcur / unit) % reps) == 0;
        let ysiz = hasLabel ? 10 : 5;
        let xpos = xcur - start;
        context.moveTo(xpos * xinc, h);
        context.lineTo(xpos * xinc, h - ysiz);
        if (hasLabel) {
            context.textAlign = 'center';
            context.fillText(formatTime(xcur / SECOND_IN_MILLI, prec),
                xpos * xinc, h - ysiz - 5);
        }
    }

    context.closePath();
    context.fillStrokeShape(shape);
}
