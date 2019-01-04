
import Konva from 'konva';

export function WaveformShape(options) {
    Konva.Shape.call(this, options);

    this.data = options.data || null;
    this.mode = options.mode;
    this.offset = options.offset || 0;
    this.length = options.length || 1.0;

    this.sceneFunc(this._sceneFunc);
    this.hitFunc(this._hitFunc);
}

WaveformShape.prototype = Object.create(Konva.Shape.prototype);

WaveformShape.prototype.setData = function (data, mode) {
    this.data = data;
    this.mode = mode;
}

WaveformShape.prototype.setRange = function (offset, length) {
    this.offset = offset;
    this.length = length;
}

WaveformShape.prototype.setOffset = function (offset) {
    this.offset = offset;
}

WaveformShape.prototype.setLength = function (length) {
    this.length = length;
}

WaveformShape.prototype._sceneFunc = function (context, shape) {
    let w = this.width();
    let h = this.height() / 2;

    if (this.data == null) {
        return;
    }

    let start = (~~(this.offset * this.data.length) >> 1) << 1;
    let len = (~~(this.length * this.data.length) >> 1) << 1;
    let end = start + len;

    if (start < 0) {
        start = 0;
    }

    if (end > this.data.length) {
        end = this.data.length;
    }

    let yval = this.data.slice(start, end);
    let xinc = w / len;
    let i;

    if (this.mode == 'peak') {
        this.fillEnabled(true);
    } else {
        this.fillEnabled(false);
    }

    context.beginPath();
    context.moveTo(0, h);

    if (this.mode == 'peak') {
        for (i = 0; i < yval.length; i += 2) {
            context.lineTo(xinc * i, h * (1 - yval[i]));
        }

        context.lineTo(xinc * i, h);
        context.lineTo(w, h);

        for (i = yval.length - 1; i >= 0; i -= 2) {
            context.lineTo(xinc * i, h * (1 - yval[i]));
        }

        context.lineTo(xinc * i, h);
        context.lineTo(0, h);
    } else {
        for (i = 0; i < yval.length; i++) {
            context.lineTo(xinc * i, h * (1 - yval[i]));
        }

        context.lineTo(xinc * i, h);
        context.moveTo(w, h);
    }

    context.closePath();
    context.fillStrokeShape(shape);
}

WaveformShape.prototype._hitFunc = function (context) {
    context.beginPath();
    context.rect(0, 0, this.width(), this.height());
    context.closePath();
    context.fillStrokeShape(this)
}
