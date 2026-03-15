// ============================================
// SitePilotPro — Interactive 3D Canvas Globe
// Vanilla JS port (no React / no build step)
// ============================================

(function () {
  "use strict";

  // ---------- CONFIG ----------
  const MARKERS = [
    { lat: 37.78, lng: -122.42, label: "San Francisco" },
    { lat: 51.51, lng: -0.13, label: "London" },
    { lat: 35.68, lng: 139.69, label: "Tokyo" },
    { lat: -33.87, lng: 151.21, label: "Sydney" },
    { lat: 1.35, lng: 103.82, label: "Singapore" },
    { lat: 55.76, lng: 37.62, label: "Moscow" },
    { lat: -23.55, lng: -46.63, label: "São Paulo" },
    { lat: 19.43, lng: -99.13, label: "Mexico City" },
    { lat: 28.61, lng: 77.21, label: "Delhi" },
    { lat: 36.19, lng: 44.01, label: "Erbil" },
  ];

  const CONNECTIONS = [
    { from: [37.78, -122.42], to: [51.51, -0.13] },
    { from: [51.51, -0.13], to: [35.68, 139.69] },
    { from: [35.68, 139.69], to: [-33.87, 151.21] },
    { from: [37.78, -122.42], to: [1.35, 103.82] },
    { from: [51.51, -0.13], to: [28.61, 77.21] },
    { from: [37.78, -122.42], to: [-23.55, -46.63] },
    { from: [1.35, 103.82], to: [-33.87, 151.21] },
    { from: [28.61, 77.21], to: [36.19, 44.01] },
    { from: [51.51, -0.13], to: [36.19, 44.01] },
  ];

  const AUTO_ROTATE_SPEED = 0.002;
  const FOV = 600;
  const NUM_DOTS = 1200;

  // ---------- MATH HELPERS ----------
  function latLngToXYZ(lat, lng, r) {
    var phi = ((90 - lat) * Math.PI) / 180;
    var theta = ((lng + 180) * Math.PI) / 180;
    return [
      -(r * Math.sin(phi) * Math.cos(theta)),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.sin(theta),
    ];
  }

  function rotateY(x, y, z, a) {
    var c = Math.cos(a), s = Math.sin(a);
    return [x * c + z * s, y, -x * s + z * c];
  }

  function rotateX(x, y, z, a) {
    var c = Math.cos(a), s = Math.sin(a);
    return [x, y * c - z * s, y * s + z * c];
  }

  function project(x, y, z, cx, cy) {
    var scale = FOV / (FOV + z);
    return [x * scale + cx, y * scale + cy, z];
  }

  // ---------- GENERATE FIBONACCI SPHERE DOTS ----------
  function generateDots() {
    var dots = [];
    var golden = (1 + Math.sqrt(5)) / 2;
    for (var i = 0; i < NUM_DOTS; i++) {
      var theta = (2 * Math.PI * i) / golden;
      var phi = Math.acos(1 - (2 * (i + 0.5)) / NUM_DOTS);
      dots.push([
        Math.cos(theta) * Math.sin(phi),
        Math.cos(phi),
        Math.sin(theta) * Math.sin(phi),
      ]);
    }
    return dots;
  }

  // ---------- READ THEME COLORS FROM CSS VARS ----------
  function getColors() {
    var s = getComputedStyle(document.documentElement);
    var primary = s.getPropertyValue("--color-primary").trim() || "#c8842a";
    var border = s.getPropertyValue("--globe-border").trim() || "#d1d1d6";
    var textFaint = s.getPropertyValue("--globe-text-faint").trim() || "#aeaeb2";
    var bg = s.getPropertyValue("--globe-bg").trim() || "#fbfbfb";

    // Detect dark mode
    var isDark = false;
    var theme = document.documentElement.getAttribute("data-theme");
    if (theme === "dark") {
      isDark = true;
    } else if (!theme) {
      isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    }

    return { primary: primary, border: border, textFaint: textFaint, bg: bg, isDark: isDark };
  }

  // Parse hex to rgba helper
  function hexToRgba(hex, alpha) {
    hex = hex.replace("#", "");
    if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    var r = parseInt(hex.substring(0, 2), 16);
    var g = parseInt(hex.substring(2, 4), 16);
    var b = parseInt(hex.substring(4, 6), 16);
    return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
  }

  // ---------- GLOBE CLASS ----------
  function Globe(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.dots = generateDots();
    this.rotY = 0.4;
    this.rotXVal = 0.3;
    this.time = 0;
    this.animId = 0;

    // Drag state
    this.drag = { active: false, startX: 0, startY: 0, startRotY: 0, startRotX: 0 };

    // Bind events
    this._onPointerDown = this.onPointerDown.bind(this);
    this._onPointerMove = this.onPointerMove.bind(this);
    this._onPointerUp = this.onPointerUp.bind(this);
    canvas.addEventListener("pointerdown", this._onPointerDown);
    canvas.addEventListener("pointermove", this._onPointerMove);
    canvas.addEventListener("pointerup", this._onPointerUp);
    canvas.addEventListener("pointerleave", this._onPointerUp);

    // Start
    this.draw = this.draw.bind(this);
    this.animId = requestAnimationFrame(this.draw);
  }

  Globe.prototype.destroy = function () {
    cancelAnimationFrame(this.animId);
    this.canvas.removeEventListener("pointerdown", this._onPointerDown);
    this.canvas.removeEventListener("pointermove", this._onPointerMove);
    this.canvas.removeEventListener("pointerup", this._onPointerUp);
    this.canvas.removeEventListener("pointerleave", this._onPointerUp);
  };

  Globe.prototype.onPointerDown = function (e) {
    this.drag = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      startRotY: this.rotY,
      startRotX: this.rotXVal,
    };
    this.canvas.setPointerCapture(e.pointerId);
  };

  Globe.prototype.onPointerMove = function (e) {
    if (!this.drag.active) return;
    var dx = e.clientX - this.drag.startX;
    var dy = e.clientY - this.drag.startY;
    this.rotY = this.drag.startRotY + dx * 0.005;
    this.rotXVal = Math.max(-1, Math.min(1, this.drag.startRotX + dy * 0.005));
  };

  Globe.prototype.onPointerUp = function () {
    this.drag.active = false;
  };

  Globe.prototype.draw = function () {
    var canvas = this.canvas;
    var ctx = this.ctx;
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth;
    var h = canvas.clientHeight;

    if (w === 0 || h === 0) {
      this.animId = requestAnimationFrame(this.draw);
      return;
    }

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    var cx = w / 2;
    var cy = h / 2;
    var radius = Math.min(w, h) * 0.38;

    // Auto rotate
    if (!this.drag.active) {
      this.rotY += AUTO_ROTATE_SPEED;
    }

    this.time += 0.015;
    var time = this.time;
    var ry = this.rotY;
    var rx = this.rotXVal;

    // Read current theme colors
    var colors = getColors();

    ctx.clearRect(0, 0, w, h);

    // Outer glow
    var glowGrad = ctx.createRadialGradient(cx, cy, radius * 0.8, cx, cy, radius * 1.5);
    glowGrad.addColorStop(0, hexToRgba(colors.primary, 0.04));
    glowGrad.addColorStop(1, hexToRgba(colors.primary, 0));
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, w, h);

    // Globe outline
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = hexToRgba(colors.border, 0.15);
    ctx.lineWidth = 1;
    ctx.stroke();

    // Draw dots
    var dots = this.dots;
    var dotBaseAlpha = colors.isDark ? 0.5 : 0.35;
    for (var i = 0; i < dots.length; i++) {
      var dx2 = dots[i][0] * radius;
      var dy2 = dots[i][1] * radius;
      var dz2 = dots[i][2] * radius;

      var r1 = rotateX(dx2, dy2, dz2, rx);
      var r2 = rotateY(r1[0], r1[1], r1[2], ry);

      if (r2[2] > 0) continue; // back-face cull

      var p = project(r2[0], r2[1], r2[2], cx, cy);
      var depthAlpha = Math.max(0.08, 1 - (r2[2] + radius) / (2 * radius));
      var dotSize = 0.8 + depthAlpha * 0.8;

      ctx.beginPath();
      ctx.arc(p[0], p[1], dotSize, 0, Math.PI * 2);
      ctx.fillStyle = hexToRgba(colors.primary, (depthAlpha * dotBaseAlpha).toFixed(2));
      ctx.fill();
    }

    // Draw connections as arcs
    for (var c = 0; c < CONNECTIONS.length; c++) {
      var conn = CONNECTIONS[c];
      var p1 = latLngToXYZ(conn.from[0], conn.from[1], radius);
      var p2 = latLngToXYZ(conn.to[0], conn.to[1], radius);

      var r1a = rotateX(p1[0], p1[1], p1[2], rx);
      p1 = rotateY(r1a[0], r1a[1], r1a[2], ry);
      var r2a = rotateX(p2[0], p2[1], p2[2], rx);
      p2 = rotateY(r2a[0], r2a[1], r2a[2], ry);

      // Only draw if both points roughly face camera
      if (p1[2] > radius * 0.3 && p2[2] > radius * 0.3) continue;

      var sp1 = project(p1[0], p1[1], p1[2], cx, cy);
      var sp2 = project(p2[0], p2[1], p2[2], cx, cy);

      // Elevated midpoint for arc
      var midX = (p1[0] + p2[0]) / 2;
      var midY = (p1[1] + p2[1]) / 2;
      var midZ = (p1[2] + p2[2]) / 2;
      var midLen = Math.sqrt(midX * midX + midY * midY + midZ * midZ) || 1;
      var arcH = radius * 1.25;
      var elevX = (midX / midLen) * arcH;
      var elevY = (midY / midLen) * arcH;
      var elevZ = (midZ / midLen) * arcH;
      var scp = project(elevX, elevY, elevZ, cx, cy);

      ctx.beginPath();
      ctx.moveTo(sp1[0], sp1[1]);
      ctx.quadraticCurveTo(scp[0], scp[1], sp2[0], sp2[1]);
      ctx.strokeStyle = hexToRgba(colors.primary, 0.35);
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Traveling dot
      var t = (Math.sin(time * 1.2 + conn.from[0] * 0.1) + 1) / 2;
      var tx = (1 - t) * (1 - t) * sp1[0] + 2 * (1 - t) * t * scp[0] + t * t * sp2[0];
      var ty = (1 - t) * (1 - t) * sp1[1] + 2 * (1 - t) * t * scp[1] + t * t * sp2[1];

      ctx.beginPath();
      ctx.arc(tx, ty, 2, 0, Math.PI * 2);
      ctx.fillStyle = hexToRgba(colors.primary, 0.9);
      ctx.fill();
    }

    // Draw markers
    for (var m = 0; m < MARKERS.length; m++) {
      var marker = MARKERS[m];
      var mp = latLngToXYZ(marker.lat, marker.lng, radius);
      var mr1 = rotateX(mp[0], mp[1], mp[2], rx);
      mp = rotateY(mr1[0], mr1[1], mr1[2], ry);

      if (mp[2] > radius * 0.1) continue;

      var sp = project(mp[0], mp[1], mp[2], cx, cy);

      // Pulse ring
      var pulse = Math.sin(time * 2 + marker.lat) * 0.5 + 0.5;
      ctx.beginPath();
      ctx.arc(sp[0], sp[1], 4 + pulse * 4, 0, Math.PI * 2);
      ctx.strokeStyle = hexToRgba(colors.primary, (0.15 + pulse * 0.15).toFixed(2));
      ctx.lineWidth = 1;
      ctx.stroke();

      // Core dot
      ctx.beginPath();
      ctx.arc(sp[0], sp[1], 2.5, 0, Math.PI * 2);
      ctx.fillStyle = hexToRgba(colors.primary, 0.9);
      ctx.fill();

      // Label
      if (marker.label) {
        ctx.font = "10px 'General Sans', system-ui, sans-serif";
        ctx.fillStyle = hexToRgba(colors.primary, 0.5);
        ctx.fillText(marker.label, sp[0] + 8, sp[1] + 3);
      }
    }

    this.animId = requestAnimationFrame(this.draw);
  };

  // ---------- INIT ----------
  function init() {
    var canvas = document.getElementById("globeCanvas");
    if (!canvas) return;
    window.__globe = new Globe(canvas);
  }

  // Start when DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
