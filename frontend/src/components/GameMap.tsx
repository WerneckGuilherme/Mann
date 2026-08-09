import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSON, FeatureCollection } from 'geojson';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { Coordinate, Route } from '../types/route.ts';

const mapStyle = {
    version: 8 as const,
    sources: {
        osm: {
            type: 'raster' as const,
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors',
        },
    },
    layers: [
        {
            id: 'osm',
            type: 'raster' as const,
            source: 'osm',
        },
    ],
};

const ROUTE_SOURCE_ID = 'mann-route';
const ROUTE_LINE_ID = 'mann-route-line';
const ROUTE_CASING_ID = 'mann-route-line-casing';

type Props = { position: Coordinate; bearing: number; route: Route | null; running: boolean; restartToken: number };

function emptyRouteData(): FeatureCollection {
    return { type: 'FeatureCollection', features: [] };
}

function routeData(route: Route | null): GeoJSON {
    if (!route || route.coordinates.length < 2) return emptyRouteData();
    return {
        type: 'Feature',
        properties: {},
        geometry: {
            type: 'LineString',
            coordinates: route.coordinates.map(point => [point.longitude, point.latitude]),
        },
    };
}

function fitRoute(map: MapLibreMap, route: Route | null): void {
    if (!route || route.coordinates.length < 2) return;
    const first = route.coordinates[0];
    const bounds = route.coordinates.reduce(
        (currentBounds, point) => currentBounds.extend([point.longitude, point.latitude]),
        new maplibregl.LngLatBounds([first.longitude, first.latitude], [first.longitude, first.latitude]),
    );
    map.fitBounds(bounds, { padding: { top: 220, bottom: 190, left: 30, right: 30 }, duration: 700, maxZoom: 15 });
}

function ensureRouteLayer(map: MapLibreMap): maplibregl.GeoJSONSource | null {
    if (!map.isStyleLoaded()) return null;

    let source = map.getSource(ROUTE_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (!source) {
        map.addSource(ROUTE_SOURCE_ID, { type: 'geojson', data: emptyRouteData() });
        source = map.getSource(ROUTE_SOURCE_ID) as maplibregl.GeoJSONSource;
    }

    if (!map.getLayer(ROUTE_CASING_ID)) {
        map.addLayer({
            id: ROUTE_CASING_ID,
            type: 'line',
            source: ROUTE_SOURCE_ID,
            paint: { 'line-color': '#123047', 'line-width': 10, 'line-opacity': 0.9 },
        });
    }
    if (!map.getLayer(ROUTE_LINE_ID)) {
        map.addLayer({
            id: ROUTE_LINE_ID,
            type: 'line',
            source: ROUTE_SOURCE_ID,
            paint: { 'line-color': '#35c7f4', 'line-width': 5, 'line-opacity': 1 },
        });
    }
    return source;
}

function GameMap({ position, bearing, route, running, restartToken }: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<MapLibreMap | null>(null);
    const markerRef = useRef<maplibregl.Marker | null>(null);
    const styleReadyRef = useRef(false);
    const routeRef = useRef<Route | null>(route);
    routeRef.current = route;

    useEffect(() => {
        if (!containerRef.current) return;
        const map = new maplibregl.Map({
            container: containerRef.current,
            style: mapStyle,
            center: [-43.9386, -19.9191],
            zoom: 13,
            pitch: 48,
            bearing,
        });
        mapRef.current = map;
        const vehicleElement = document.createElement('img');
        vehicleElement.className = 'vehicle-marker';
        vehicleElement.src = '/assets/car.svg';
        vehicleElement.alt = 'Player vehicle';
        const marker = new maplibregl.Marker({ element: vehicleElement, anchor: 'center', rotationAlignment: 'viewport' })
            .setLngLat([position.longitude, position.latitude])
            .setRotation(bearing - map.getBearing())
            .addTo(map);
        markerRef.current = marker;
        const syncMarkerRotation = () => marker.setRotation(bearing - map.getBearing());
        map.on('rotate', syncMarkerRotation);
        map.addControl(new maplibregl.NavigationControl(), 'top-right');
        map.addControl(new maplibregl.AttributionControl({ customAttribution: '© OpenStreetMap contributors' }), 'bottom-right');
        map.on('error', event => {
            const details = event as unknown as { error?: { message?: string }; sourceId?: string; tile?: unknown };
            console.error('[Mann MapLibre] error', {
                message: details.error?.message ?? 'Unknown MapLibre error',
                sourceId: details.sourceId,
                tile: details.tile,
            });
        });
        map.on('load', () => {
            styleReadyRef.current = true;
            const source = ensureRouteLayer(map);
            source?.setData(routeData(routeRef.current));
            fitRoute(map, routeRef.current);
        });
        return () => {
            styleReadyRef.current = false;
            map.off('rotate', syncMarkerRotation);
            marker.remove();
            markerRef.current = null;
            map.remove();
            mapRef.current = null;
        };
    }, []);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !styleReadyRef.current) return;
        const source = ensureRouteLayer(map);
        source?.setData(routeData(route));
        fitRoute(map, route);
    }, [route]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !styleReadyRef.current) return;
        fitRoute(map, routeRef.current);
    }, [restartToken]);

    useEffect(() => {
        const map = mapRef.current;
        const marker = markerRef.current;
        if (!map || !marker) return;
        marker.setLngLat([position.longitude, position.latitude]);
        marker.setRotation(bearing - map.getBearing());
    }, [position, bearing]);

    useEffect(() => {
        if (!running) return;
        mapRef.current?.easeTo({ center: [position.longitude, position.latitude], duration: 120, essential: true });
    }, [position, running]);

    return <div ref={containerRef} className="map-canvas" aria-label="Mann navigation map" />;
}

export default GameMap;
