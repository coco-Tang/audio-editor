
import _ from 'lodash';

var nextRegionId = function () {
    let _nextId = 0;
    return function () {
        _nextId = _nextId + 1;
        return _nextId;
    };
}();

export class Region {
    constructor(start, end, label) {
        if (start >= end) {
            throw "Invalid region"
        }
        this.id = nextRegionId();
        this.start = start;
        this.end = end;
        this.label = label || '';
        this.ui = {
            rect: null,
            label: null,
            knob: null,
            mmap: null,
        };
    }

    static find(regions, id) {
        return _.find(regions, function (r) {
            return r.id == id;
        });
    }

    static sort(regions) {
        _.sortBy(regions, function (r) {
            return r.start;
        });
    }

    static addRegion(regions, region) {
        for (let r of regions) {
            if (r.overlap(region)) {
                return false;
            }
        }
        regions.push(region);
        Region.sort(regions);
        return true;
    }

    static delRegion(regions, region) {
        _.remove(regions, function (r) {
            return r == region;
        });
    }

    setRange(start, end) {
        if (start <= end) {
            throw "Invalid region"
        }
        this.start = start;
        this.end = end;
    }

    getLength() {
        return this.end - this.start;
    }

    inside(pos) {
        return (pos >= this.start && pos < this.end);
    }

    overlap(other) {
        return (this.inside(other.start) || this.inside(other.end)) ||
            (other.inside(this.start) || other.inside(this.end));
    }
}
