/**
 * geo.js (Leaflet версія)
 * GEN-008: прив'язка/прилипання рахується в екранних пікселях,
 * геометрія зберігається в координатах карти (lat/lng).
 *
 * У Leaflet немає окремого OverlayView з projection — конвертація
 * робиться напряму через map.latLngToContainerPoint() / containerPointToLatLng().
 * Інтерфейс (toScreen/toGeo/distanceMeters/...) лишається той самий,
 * що й був для Google Maps — інші модулі (draw.js, overlay.js) не знають,
 * яка карта під капотом.
 */

window.FP = window.FP || {};

window.FP.geo = (() => {
  /** @type {L.Map|null} */
  let mapRef = null;

  function bindMap(map) {
    mapRef = map;
  }

  /** @param {{lat:number,lng:number}} geo -> {x,y} у пікселях контейнера карти */
  function toScreen(geo) {
    if (!mapRef) return { x: 0, y: 0 };
    const point = mapRef.latLngToContainerPoint([geo.lat, geo.lng]);
    return { x: point.x, y: point.y };
  }

  /** @param {{x:number,y:number}} screen -> {lat,lng} */
  function toGeo(screen) {
    if (!mapRef) return { lat: 0, lng: 0 };
    const latLng = mapRef.containerPointToLatLng([screen.x, screen.y]);
    return { lat: latLng.lat, lng: latLng.lng };
  }

  /** Метрична відстань між двома geo-точками (формула гаверсинуса) */
  function distanceMeters(a, b) {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  /** Відстань в екранних пікселях — для snap-радіусів (GEN-008) */
  function distanceScreenPx(geoA, geoB) {
    const a = toScreen(geoA);
    const b = toScreen(geoB);
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  /**
   * DRW-003: округлення довжини/координат кроком проєкту, а не хардкодом.
   */
  const config = { roundStepMeters: 0.1 };

  function roundLength(meters) {
    const step = config.roundStepMeters || 0.1;
    return Math.round(meters / step) * step;
  }

  /**
   * 7.3: обчислити нову geo-позицію точки так, щоб відстань від fixedGeo
   * дорівнювала точно desiredMeters, зберігаючи поточний напрямок на currentGeo.
   * Проста локальна апроксимація (коректна для невеликих відстаней паркану).
   */
  function pointAtDistanceAlongDirection(fixedGeo, currentGeo, desiredMeters) {
    const metersPerDegLat = 111320;
    const metersPerDegLng = 111320 * Math.cos((fixedGeo.lat * Math.PI) / 180);

    const dx = (currentGeo.lng - fixedGeo.lng) * metersPerDegLng;
    const dy = (currentGeo.lat - fixedGeo.lat) * metersPerDegLat;
    const currentDist = Math.hypot(dx, dy) || 1e-9;

    const unitX = dx / currentDist;
    const unitY = dy / currentDist;

    const newDx = unitX * desiredMeters;
    const newDy = unitY * desiredMeters;

    return {
      lat: fixedGeo.lat + newDy / metersPerDegLat,
      lng: fixedGeo.lng + newDx / metersPerDegLng,
    };
  }

  return {
    bindMap,
    toScreen,
    toGeo,
    distanceMeters,
    distanceScreenPx,
    roundLength,
    config,
    pointAtDistanceAlongDirection,
  };
})();
