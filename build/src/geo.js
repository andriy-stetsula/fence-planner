window.FP = window.FP || {};

window.FP.geo = (() => {
  let mapRef = null;

  function bindMap(map) {
    mapRef = map;
  }

  function toScreen(geo) {
    if (!mapRef) return { x: 0, y: 0 };
    const point = mapRef.latLngToContainerPoint([geo.lat, geo.lng]);
    return { x: point.x, y: point.y };
  }

  function toGeo(screen) {
    if (!mapRef) return { lat: 0, lng: 0 };
    const latLng = mapRef.containerPointToLatLng([screen.x, screen.y]);
    return { lat: latLng.lat, lng: latLng.lng };
  }

  function distanceMeters(a, b) {
    const R = 6371000;
    const toRad = d => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);

    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) *
        Math.cos(lat2) *
        Math.sin(dLng / 2) ** 2;

    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function distanceScreenPx(geoA, geoB) {
    const a = toScreen(geoA);
    const b = toScreen(geoB);
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  const config = {
    roundStepMeters: 0.1
  };

  function roundLength(meters) {
    const step = config.roundStepMeters || 0.1;
    return Math.round(meters / step) * step;
  }

  function pointAtDistanceAlongDirection(
    fixedGeo,
    currentGeo,
    desiredMeters
  ) {
    const metersPerDegLat = 111320;
    const metersPerDegLng =
      111320 * Math.cos((fixedGeo.lat * Math.PI) / 180);

    const dx =
      (currentGeo.lng - fixedGeo.lng) * metersPerDegLng;
    const dy =
      (currentGeo.lat - fixedGeo.lat) * metersPerDegLat;

    const currentDist = Math.hypot(dx, dy) || 1e-9;

    const unitX = dx / currentDist;
    const unitY = dy / currentDist;

    return {
      lat:
        fixedGeo.lat +
        (unitY * desiredMeters) / metersPerDegLat,
      lng:
        fixedGeo.lng +
        (unitX * desiredMeters) / metersPerDegLng
    };
  }

  function toLocalXY(origin, geo) {
    const metersPerDegLat = 111320;
    const metersPerDegLng =
      111320 * Math.cos((origin.lat * Math.PI) / 180);

    return {
      x: (geo.lng - origin.lng) * metersPerDegLng,
      y: (geo.lat - origin.lat) * metersPerDegLat
    };
  }

  function fromLocalXY(origin, xy) {
    const metersPerDegLat = 111320;
    const metersPerDegLng =
      111320 * Math.cos((origin.lat * Math.PI) / 180);

    return {
      lat: origin.lat + xy.y / metersPerDegLat,
      lng: origin.lng + xy.x / metersPerDegLng
    };
  }

  function rotateXY(xy, angleDeg) {
    const rad = (angleDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    return {
      x: xy.x * cos - xy.y * sin,
      y: xy.x * sin + xy.y * cos
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
    toLocalXY,
    fromLocalXY,
    rotateXY
  };
})();