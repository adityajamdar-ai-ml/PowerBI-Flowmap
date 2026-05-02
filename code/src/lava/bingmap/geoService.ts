import { copy } from '../type';
import { ILocation } from './converter';
import { Func, StringMap, keys } from '../type';

var _injected = {} as StringMap<ILocation>;

export function inject(locs: StringMap<ILocation>, reset = false): void {
    locs = locs || {};
    if (reset) {
        _injected = locs;
        return;
    }
    for (var key of keys(locs)) {
        var loc = locs[key];
        if (loc) {
            _injected[key] = loc;
        }
        else {
            delete _injected[key];
        }
    }
}

export function remove(where: Func<ILocation, boolean>): void {
    for (var key of keys(_injected)) {
        if (where(_injected[key])) {
            delete _injected[key];
        }
    }
}

export function latitude(addr: string): number {
    var loc = query(addr);
    return loc ? loc.latitude : null;
}

export function longitude(addr: string): number {
    var loc = query(addr);
    return loc ? loc.longitude : null;
}

export function query(addr: string): ILocation;
export function query(addr: string, then: Func<ILocation, void>): void;
export function query(addr: string, then?: Func<ILocation, void>): any {
    if (then) {
        var loc = _injected[addr] || _initCache[addr] || geocodeCache[addr.toLowerCase()];
        if (loc) {
            loc.address = addr;
        }
        setTimeout(() => then(loc || undefined), 0);
        return undefined;
    }
    else {
        if (_injected[addr]) { return _injected[addr]; }
        if (_initCache[addr]) { return _initCache[addr]; }
        var rec = geocodeCache[addr.toLowerCase()];
        return rec ? rec : null;
    }
}

var _initCache = {} as StringMap<ILocation>;
export function initCache(locs: StringMap<ILocation>) {
    _initCache = copy(locs);
}

export var settings = {
    MaxBingRequest: 6,
    MaxCacheSize: 3000,
    MaxCacheSizeOverflow: 1000
};

export function getCacheSize(): number {
    return Object.keys(geocodeCache).length;
}

var geocodeCache = {} as StringMap<ILocation>;
