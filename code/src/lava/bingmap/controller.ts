import * as L from 'leaflet';
import { ILocation, IBound } from './converter';
import { anchorPixel, bound, anchor, fitOptions, area } from './converter';
import { keys, IPoint, partial, Func } from '../type';
import { ISelex, selex } from '../d3';

export interface IMapElement {
  forest: boolean;
  label: boolean;
  road: 'color' | 'gray' | 'gray_label' | 'hidden';
  icon: boolean;
  area: boolean;
  building: boolean;
  city: boolean;
  scale: boolean;
}

export interface IMapControl {
  type: 'hidden' | 'aerial' | 'road' | 'grayscale' | 'canvasDark' | 'canvasLight';
  lang: string;
  pan: boolean;
  zoom: boolean;
}

export interface IMapFormat extends IMapControl, IMapElement { }

export function defaultZoom(width: number, height: number): number {
  const min = Math.min(width, height);
  for (let level = 1; level < 20; level++) {
    if (256 * Math.pow(2, level) > min) {
      return level;
    }
  }
  return 20;
}

export function pixel(map: L.Map, loc: ILocation): IPoint {
  const size = map.getSize();
  const pt = map.latLngToContainerPoint(L.latLng(loc.latitude, loc.longitude));
  return { x: pt.x - size.x / 2, y: pt.y - size.y / 2 };
}

export function coordinate(map: L.Map, p: IPoint): ILocation {
  const size = map.getSize();
  const ll = map.containerPointToLatLng(L.point(p.x + size.x / 2, p.y + size.y / 2));
  return { latitude: ll.lat, longitude: ll.lng };
}

export class MapFormat implements IMapFormat {
  type = 'road' as 'aerial' | 'road' | 'grayscale' | 'canvasDark' | 'canvasLight';
  lang = 'default';
  pan = true;
  zoom = true;
  city = false;
  road = 'color' as 'color' | 'gray' | 'gray_label' | 'hidden';
  label = true;
  forest = true;
  icon = false;
  building = false;
  area = false;
  scale = false;

  public static build(...fmts: any[]): MapFormat {
    const ret = new MapFormat();
    for (const f of fmts.filter(v => v)) {
      for (const key in ret) {
        if (key in f) {
          ret[key] = f[key];
        }
      }
    }
    return ret;
  }

  public static control<T>(fmt: MapFormat, extra: T): IMapControl & T {
    const result = partial(fmt, ['type', 'lang', 'pan', 'zoom']) as any;
    for (const key in extra) {
      result[key] = extra[key];
    }
    return result;
  }

  public static element<T>(fmt: MapFormat, extra: T): IMapElement & T {
    const result = partial(fmt, ['road', 'forest', 'label', 'city', 'icon', 'building', 'area', 'scale']) as any;
    for (const key in extra) {
      result[key] = extra[key];
    }
    return result;
  }
}

export interface IListener {
  transform?(ctl: Controller, pzoom: number, end?: boolean): void;
  resize?(ctl: Controller): void;
}

const _osmUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const _cartoLightUrl = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png';
const _cartoDarkUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png';

function tileConfig(type: IMapControl['type']): { url: string; subdomains: string } | null {
  switch (type) {
    case 'hidden': return null;
    case 'grayscale': return { url: _cartoLightUrl, subdomains: 'abcd' };
    case 'canvasLight': return { url: _cartoLightUrl, subdomains: 'abcd' };
    case 'canvasDark': return { url: _cartoDarkUrl, subdomains: 'abcd' };
    default: return { url: _osmUrl, subdomains: 'abc' };
  }
}

export class Controller {
  private _div: HTMLDivElement;
  private _map: L.Map;
  private _fmt: IMapFormat;
  private _svg: ISelex;
  private _svgroot: ISelex;
  private _tileLayer: L.TileLayer;

  public get map() { return this._map; }
  public get format() { return this._fmt; }
  public get svg() { return this._svgroot; }
  public get canvas() { return null as ISelex; }

  public getCenter(): ILocation {
    const ll = this._map.getCenter();
    return { latitude: ll.lat, longitude: ll.lng };
  }

  public location(p: IPoint): ILocation {
    const size = this._map.getSize();
    const ll = this._map.containerPointToLatLng(
      L.point(p.x + size.x / 2, p.y + size.y / 2)
    );
    return { latitude: ll.lat, longitude: ll.lng };
  }

  public setCenterZoom(center: ILocation, zoom: number) {
    if (this._map) {
      const min = this._map.getMinZoom(), max = this._map.getMaxZoom();
      zoom = Math.min(max, 20, Math.max(min, 1, zoom));
      this._map.setView(L.latLng(center.latitude, center.longitude), zoom, { animate: false });
    }
  }

  public pixel(loc: ILocation | IBound): IPoint {
    if ((loc as IBound).anchor) {
      const size = this._map.getSize();
      const toPixel: Func<ILocation, IPoint> = l => {
        const p = this._map.latLngToContainerPoint(L.latLng(l.latitude, l.longitude));
        return { x: p.x - size.x / 2, y: p.y - size.y / 2 };
      };
      return anchorPixel(this._map.getZoom(), toPixel, size.x, loc as IBound);
    }
    else {
      return pixel(this._map, loc as ILocation);
    }
  }

  public anchor(locs: ILocation[]) { return anchor(locs); }
  public area(locs: ILocation[], level = 20) { return area(locs, level); }
  public bound(locs: ILocation[]): IBound { return bound(locs); }

  private _listener = [] as IListener[];
  public add(v: IListener) { this._listener.push(v); return this; }

  public fitView(areas: IBound[], backupCenter?: ILocation) {
    const size = this._map.getSize();
    const config = fitOptions(areas, { width: size.x, height: size.y });
    const minZoom = this._map.getMinZoom();
    if (config.zoom < minZoom) {
      config.zoom = minZoom;
      if (backupCenter) {
        config.center = backupCenter;
      }
    }
    this._map.setView(
      L.latLng(config.center.latitude, config.center.longitude),
      config.zoom
    );
    this._viewChange(false);
  }

  constructor(id: string) {
    const div = selex(id).node<HTMLDivElement>();
    this._fmt = {} as IMapFormat;
    this._div = div;
    this._svg = selex(div).append('svg')
      .att.tabIndex(-1)
      .sty.pointer_events('none')
      .sty.position('absolute')
      .sty.visibility('inherit')
      .sty.user_select('none');
    (this._svg.node() as HTMLElement).style.zIndex = '800';
    this._svgroot = this._svg.append('g').att.id('root');
  }

  private _viewChange(end = false) {
    const zoom = this._map.getZoom();
    for (const l of this._listener) {
      l.transform && l.transform(this, this._zoom, end);
    }
    this._zoom = zoom;
  }

  private _zoom: number;

  private _resize(): void {
    if (!this._map) { return; }
    this._map.invalidateSize();
    const size = this._map.getSize();
    this._svg.att.width('100%').att.height('100%');
    this._svgroot.att.translate(size.x / 2, size.y / 2);
    for (const l of this._listener) {
      l.resize && l.resize(this);
    }
  }

  restyle(fmt: Partial<IMapFormat>, then?: (m: L.Map) => void): Controller {
    then = then || (() => { });
    const dirty = {} as Partial<IMapFormat>;
    for (const k in fmt) {
      if (fmt[k] !== this._fmt[k]) {
        dirty[k] = this._fmt[k] = fmt[k];
      }
    }
    if (keys(dirty).length === 0 && this._map) {
      then(this._map);
      return this;
    }

    if (!this._map) {
      this._map = L.map(this._div, {
        zoomControl: false,
        attributionControl: false,
        preferCanvas: false
      });
      this._map.setView([20, 0], 2);
      this._map.invalidateSize();
      this._map.on('zoom move', () => this._viewChange(false));
      this._map.on('zoomend moveend', () => this._viewChange(true));
      if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(() => this._resize()).observe(this._div);
      }
    }

    if ('pan' in dirty) {
      if (dirty.pan) { this._map.dragging.enable(); }
      else { this._map.dragging.disable(); }
    }

    if ('zoom' in dirty) {
      if (dirty.zoom) {
        this._map.scrollWheelZoom.enable();
        this._map.doubleClickZoom.enable();
        this._map.keyboard.enable();
      }
      else {
        this._map.scrollWheelZoom.disable();
        this._map.doubleClickZoom.disable();
        this._map.keyboard.disable();
      }
    }

    if ('type' in dirty || !this._tileLayer) {
      if (this._tileLayer) {
        this._map.removeLayer(this._tileLayer);
        this._tileLayer = null;
      }
      const cfg = tileConfig(this._fmt.type);
      if (cfg) {
        this._tileLayer = L.tileLayer(cfg.url, {
          subdomains: cfg.subdomains,
          maxZoom: 19
        });
        this._tileLayer.addTo(this._map);
      }
    }

    const size = this._map.getSize();
    this._svg.att.width('100%').att.height('100%');
    this._svgroot.att.translate(size.x / 2, size.y / 2);

    then(this._map);
    return this;
  }
}
