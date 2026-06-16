import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';

const REYKJAVIK = [64.1466, -21.9426];

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/bright';

const DATA_URL =
  'https://gist.githubusercontent.com/IvanIlanic/33107020899eb9e32a2507124a96a70c/raw/4949658a2ef652ab06917bb16960c38d1dc155d5/dba.json';

function timeToMinutes(value) {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

function isNowInPeriod(period, now = new Date()) {
  const current = now.getHours() * 60 + now.getMinutes();
  const start = timeToMinutes(period.start);
  const end = timeToMinutes(period.end);

  if (end >= start) return current >= start && current < end;
  return current >= start || current < end;
}

function getActiveHappyPeriod(bar) {
  return bar.happyPeriods?.find((period) => isNowInPeriod(period));
}

function getSoonHappyPeriod(bar, now = new Date()) {
  const current = now.getHours() * 60 + now.getMinutes();

  return bar.happyPeriods?.find((period) => {
    const start = timeToMinutes(period.start);
    const difference = start - current;

    return difference > 0 && difference <= 120;
  });
}

function happyHourDetails(bar) {
  if (!bar.happyPeriods?.length) return [];

  return bar.happyPeriods.map((period) => ({
    time: `${period.start}–${period.end}`,
    beer: period.beerPrice,
    wine: period.winePrice,
    cocktail: period.cocktailPrice
  }));
}

function priceLine(period) {
  if (!period) return 'No active happy hour right now';

  const parts = [];

  if (period.beerPrice) parts.push(`Beer ${period.beerPrice} kr`);
  if (period.winePrice) parts.push(`Wine ${period.winePrice} kr`);
  if (period.cocktailPrice) parts.push(`Cocktails ${period.cocktailPrice} kr`);

  return parts.length
    ? parts.join(' · ')
    : 'Happy hour active — prices not listed';
}

function trackEvent(name, details = {}) {
  console.log('[Beer Luga event]', name, details);
}

function getBarStatus(bar) {
  if (getActiveHappyPeriod(bar)) return 'active';
  if (getSoonHappyPeriod(bar)) return 'soon';
  return 'later';
}

function createBeerMarker(status) {
  const element = document.createElement('div');

  element.className = `marker ${
    status === 'active' ? 'marker--active' : status === 'soon' ? 'marker--soon' : ''
  }`;

  element.innerHTML = '🍺';

  return element;
}

function createUserMarker() {
  const element = document.createElement('div');
  element.className = 'user-dot';
  return element;
}

function makeIdFromName(name) {
  return name
    .toLowerCase()
    .replaceAll(' ', '-')
    .replaceAll('é', 'e')
    .replaceAll('í', 'i')
    .replaceAll('ð', 'd')
    .replaceAll('æ', 'ae')
    .replaceAll('ö', 'o')
    .replaceAll('ó', 'o')
    .replaceAll('á', 'a')
    .replaceAll('þ', 'th')
    .replace(/[^a-z0-9-]/g, '');
}

function customizeBeerLugaMap(map) {
  const paintChanges = [
    ['water', 'fill-color', '#9FDDF2'],
    ['waterway', 'line-color', '#9FDDF2'],

    ['building', 'fill-color', '#EFE7DC'],
    ['building', 'fill-opacity', 0.45],

    ['road_minor', 'line-color', '#FFFFFF'],
    ['road_major', 'line-color', '#FFFFFF'],
    ['road_trunk_primary', 'line-color', '#FFEFD3'],
    ['road_motorway', 'line-color', '#FFF0D6'],

    ['road_minor', 'line-opacity', 0.9],
    ['road_major', 'line-opacity', 0.95],

    ['road_label', 'text-color', '#777777'],
    ['road_label', 'text-halo-color', '#FFFFFF']
  ];

  paintChanges.forEach(([layerId, property, value]) => {
    if (map.getLayer(layerId)) {
      try {
        map.setPaintProperty(layerId, property, value);
      } catch {
        // Some OpenFreeMap styles do not support every property.
      }
    }
  });
}

function App() {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);

  const [bars, setBars] = useState([]);
  const [selectedBar, setSelectedBar] = useState(null);
  const [onlyHappyNow, setOnlyHappyNow] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    fetch(DATA_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setBars(
          data.map((bar) => ({
            ...bar,
            id: bar.id || makeIdFromName(bar.name)
          }))
        );
      })
      .catch((err) => console.error('Could not load bars data', err));
  }, []);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLE,
      center: [REYKJAVIK[1], REYKJAVIK[0]],
      zoom: 13
    });

    map.addControl(new maplibregl.NavigationControl(), 'bottom-right');

    map.on('load', () => {
      customizeBeerLugaMap(map);
      setMapReady(true);
    });

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const userLngLat = [
            position.coords.longitude,
            position.coords.latitude
          ];

          new maplibregl.Marker({
            element: createUserMarker()
          })
            .setLngLat(userLngLat)
            .addTo(map);

          map.flyTo({
            center: userLngLat,
            zoom: 15,
            duration: 1200
          });

          trackEvent('location_allowed');
        },
        () => trackEvent('location_denied'),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }

    mapRef.current = map;

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const visibleBars = useMemo(() => {
    return onlyHappyNow ? bars.filter(getActiveHappyPeriod) : bars;
  }, [bars, onlyHappyNow]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    visibleBars.forEach((bar) => {
      const status = getBarStatus(bar);
      const markerElement = createBeerMarker(status);

      const marker = new maplibregl.Marker({
        element: markerElement,
        anchor: 'bottom'
      })
        .setLngLat([bar.coordinates.longitude, bar.coordinates.latitude])
        .addTo(mapRef.current);

      markerElement.addEventListener('click', () => {
        setSelectedBar(bar);
        trackEvent('bar_marker_clicked', {
          barId: bar.id,
          barName: bar.name
        });
      });

      markersRef.current.push(marker);
    });
  }, [visibleBars, mapReady]);

  return (
    <main>
      <div id="map" ref={mapContainerRef} />

      <section className="top-panel">
        <div className="top-row">
          <div>
            <h1>🍺 Beer Luga</h1>
            <p>{visibleBars.length} bars shown</p>
          </div>

          <button onClick={() => setOnlyHappyNow((value) => !value)}>
            {onlyHappyNow ? 'Show all' : 'Happy now'}
          </button>
        </div>

        <div className="legend">
          <span>🟠 Now</span>
          <span>🔵 Soon</span>
          <span>⚪ Later</span>
        </div>
      </section>

      {selectedBar && (
        <section className="bar-card">
          <button className="close" onClick={() => setSelectedBar(null)}>
            ×
          </button>

          <img src={selectedBar.imageURL} alt={selectedBar.name} />

          <h2>{selectedBar.name}</h2>

          <p>{selectedBar.introduction}</p>

          <strong>{priceLine(getActiveHappyPeriod(selectedBar))}</strong>

          <div className="happy-hours-box">
            <h3>🍺 Happy Hour</h3>

            {happyHourDetails(selectedBar).map((period, index) => (
              <div key={index} className="happy-period">
                <div className="happy-time-row">{period.time}</div>

                <div className="happy-prices">
                  {period.beer && <span>🍺 {period.beer} kr</span>}
                  {period.wine && <span>🍷 {period.wine} kr</span>}
                  {period.cocktail && <span>🍸 {period.cocktail} kr</span>}
                </div>

                {!period.beer && !period.wine && !period.cocktail && (
                  <p className="price-missing">Prices not listed</p>
                )}
              </div>
            ))}
          </div>

          <p className="hours">
            Open {selectedBar.openTime}–{selectedBar.closeTime}
          </p>

          <div className="perks">
            {selectedBar.perks?.map((perk) => (
              <span key={perk.title}>{perk.title}</span>
            ))}
          </div>

          <a
            className="directions"
            href={`https://www.google.com/maps/dir/?api=1&destination=${selectedBar.coordinates.latitude},${selectedBar.coordinates.longitude}`}
            target="_blank"
            rel="noreferrer"
            onClick={() =>
              trackEvent('directions_clicked', {
                barId: selectedBar.id,
                barName: selectedBar.name
              })
            }
          >
            Get directions
          </a>
        </section>
      )}
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);