/**
 * geo.js
 * GEN-008: прив'язка/прилипання рахується в екранних пікселях,
 * геометрія зберігається в координатах карти. Тому потрібні дешеві,
 * часто викликані конвертації в обидва боки при кожному рендері/русі миші.
 *
 * Реальна конвертація виконується через google.maps.OverlayView
 * (fromLatLngToDivPixel / fromContainerPixelToLatLng), тому цей модуль
 * — тонка обгортка навколо активного overlay-інстансу, яку інші модулі
 * можуть викликати не думаючи про Google Maps API напряму.
 */

window.FP = window.FP || {};

window.FP.geo = (() => {
  /** @type {google.maps.OverlayView|null} */
  let overlayRef = null;

  function bindOverlay(overlay) {
    overlayRef = overlay;
  }

  /** @param {{lat:number,lng:number}} geo -> {x,y} у пікселях контейнера карти */
  function toScreen(geo) {
    if (!overlayRef) return { x: 0, y: 0 };
    const projection = overlayRef.getProjection();
    if (!projection) return { x: 0, y: 0 };
    const latLng = new google.maps.LatLng(geo.lat, geo.lng);
    const point = projection.fromLatLngToDivPixel(latLng);
    return { x: point.x, y: point.y };
  }

  /** @param {{x:number,y:number}} screen -> {lat,lng} */
  function toGeo(screen) {
    if (!overlayRef) return { lat: 0, lng: 0 };
    const projection = overlayRef.getProjection();
    if (!projection) return { lat: 0, lng: 0 };
    const latLng = projection.fromDivPixelToLatLng(new google.maps.Point(screen.x, screen.y));
    return { lat: latLng.lat(), lng: latLng.lng() };
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
   * Крок винесено в конфіг (fpConfig), дефолт 0.1 м.
   */
  const config = { roundStepMeters: 0.1 };

  function roundLength(meters) {
    const step = config.roundStepMeters || 0.1;
    return Math.round(meters / step) * step;
  }

  return { bindOverlay, toScreen, toGeo, distanceMeters, distanceScreenPx, roundLength, config };
})();
