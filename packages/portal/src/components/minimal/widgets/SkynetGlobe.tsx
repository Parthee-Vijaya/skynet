"use client";
import { useEffect, useRef } from "react";

/**
 * Animated starquake-style globe with blue halo.
 * Uses three-globe + Three.js via dynamic import (avoids SSR issues).
 * "Skynet" text is rendered as an HTML overlay that pulses with the globe rotation.
 */
export function SkynetGlobe({ size = 260 }: { size?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let raf = 0;
    let destroyed = false;

    (async () => {
      const THREE = await import("three");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ThreeGlobeLib = await import("three-globe") as any;
      const ThreeGlobe = ThreeGlobeLib.default ?? ThreeGlobeLib;

      if (destroyed) return;

      // ── Scene ──────────────────────────────────────────────────────────
      const scene = new THREE.Scene();

      // Blue halo: additive sprite behind the globe
      const haloGeo = new THREE.SphereGeometry(1.18, 32, 32);
      const haloMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(0x1a4fff),
        transparent: true,
        opacity: 0.13,
        side: THREE.BackSide,
        depthWrite: false,
      });
      const halo = new THREE.Mesh(haloGeo, haloMat);
      scene.add(halo);

      // Outer glow ring (slightly larger, more transparent)
      const glowGeo = new THREE.SphereGeometry(1.32, 32, 32);
      const glowMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(0x3a6fff),
        transparent: true,
        opacity: 0.055,
        side: THREE.BackSide,
        depthWrite: false,
      });
      scene.add(new THREE.Mesh(glowGeo, glowMat));

      // ── Globe ──────────────────────────────────────────────────────────
      const globe = new ThreeGlobe({ animateIn: false })
        .globeMaterial(
          new THREE.MeshPhongMaterial({
            color: new THREE.Color(0x060612),
            emissive: new THREE.Color(0x0a0a1a),
            shininess: 6,
          })
        )
        .showAtmosphere(true)
        .atmosphereColor("#2255ff")
        .atmosphereAltitude(0.18);

      globe.rotation.y = -Math.PI / 4;
      scene.add(globe);

      // Fetch country hex polygons
      try {
        const geoRes = await fetch(
          "https://cdn.jsdelivr.net/gh/janarosmonaliev/github-globe@master/src/files/globe-data-min.json"
        );
        const geoData = await geoRes.json() as { features: unknown[] };
        if (!destroyed) {
          globe
            .hexPolygonsData(geoData.features)
            .hexPolygonResolution(3)
            .hexPolygonMargin(0.35)
            .hexPolygonAltitude(0.003)
            .hexPolygonColor(() => "rgba(100,160,255,0.45)");
        }
      } catch {
        // geo data not critical — globe still shows
      }

      // ── Lights ────────────────────────────────────────────────────────
      scene.add(new THREE.AmbientLight(0xffffff, 0.7));
      const dirLight = new THREE.DirectionalLight(0x4488ff, 0.8);
      dirLight.position.set(5, 3, 5);
      scene.add(dirLight);
      const rimLight = new THREE.DirectionalLight(0x2244aa, 0.4);
      rimLight.position.set(-5, -2, -3);
      scene.add(rimLight);

      // ── Camera ────────────────────────────────────────────────────────
      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
      camera.position.z = 2.6;

      // ── Renderer ──────────────────────────────────────────────────────
      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(size, size);
      renderer.setClearColor(0x000000, 0);
      el.appendChild(renderer.domElement);

      // ── Animation loop ─────────────────────────────────────────────────
      const SPEED = 0.003;
      let frame = 0;
      const animate = () => {
        if (destroyed) return;
        raf = requestAnimationFrame(animate);
        globe.rotation.y += SPEED;
        halo.rotation.y += SPEED * 0.3;
        frame++;
        renderer.render(scene, camera);

        // Drive the text opacity via a CSS variable on the container
        // so the overlay label can pulse slightly with rotation
        const pulse = 0.85 + 0.15 * Math.sin(frame * 0.018);
        el.style.setProperty("--globe-pulse", String(pulse));
      };
      animate();

      // ── Cleanup ───────────────────────────────────────────────────────
      return () => {
        destroyed = true;
        cancelAnimationFrame(raf);
        renderer.dispose();
        if (renderer.domElement.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
      };
    })().catch(console.error);

    return () => {
      destroyed = true;
      cancelAnimationFrame(raf);
    };
  }, [size]);

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      {/* Three.js canvas injected here */}
      <div ref={containerRef} style={{ width: size, height: size }} />

      {/* Blue radial glow behind everything */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(30,80,255,0.18) 0%, rgba(10,30,120,0.10) 50%, transparent 75%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* SKYNET label — animates with globe pulse */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
          zIndex: 2,
        }}
      >
        <span
          className="globe-skynet-label"
          style={{
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 13,
            letterSpacing: "0.35em",
            color: "rgba(160,200,255,0.90)",
            textTransform: "uppercase",
            userSelect: "none",
            opacity: "var(--globe-pulse, 0.85)",
            transition: "opacity 60ms linear",
            textShadow:
              "0 0 12px rgba(80,140,255,0.8), 0 0 30px rgba(40,80,255,0.4)",
          }}
        >
          SKYNET
        </span>
        <span
          style={{
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 9,
            letterSpacing: "0.25em",
            color: "rgba(100,150,255,0.45)",
            textTransform: "uppercase",
            marginTop: 4,
            userSelect: "none",
          }}
        >
          personal intelligence
        </span>
      </div>
    </div>
  );
}
