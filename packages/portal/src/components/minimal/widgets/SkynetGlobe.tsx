"use client";
import { useEffect, useRef } from "react";

/**
 * Animated starquake-style globe with blue halo.
 * Round crop via borderRadius:50% + overflow:hidden on the canvas wrapper.
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
      const ThreeGlobeLib = (await import("three-globe")) as any;
      const ThreeGlobe = ThreeGlobeLib.default ?? ThreeGlobeLib;

      if (destroyed) return;

      // ── Scene ──────────────────────────────────────────────────────────
      const scene = new THREE.Scene();

      // Blue inner halo (BackSide sphere, renders behind globe surface)
      const haloGeo = new THREE.SphereGeometry(1.18, 32, 32);
      const haloMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(0x1a4fff),
        transparent: true,
        opacity: 0.14,
        side: THREE.BackSide,
        depthWrite: false,
      });
      const halo = new THREE.Mesh(haloGeo, haloMat);
      scene.add(halo);

      // Outer glow sphere
      const glowGeo = new THREE.SphereGeometry(1.34, 32, 32);
      const glowMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(0x3a6fff),
        transparent: true,
        opacity: 0.06,
        side: THREE.BackSide,
        depthWrite: false,
      });
      scene.add(new THREE.Mesh(glowGeo, glowMat));

      // ── Globe ──────────────────────────────────────────────────────────
      const globe = new ThreeGlobe({ animateIn: false })
        .globeMaterial(
          new THREE.MeshPhongMaterial({
            color: new THREE.Color(0x060612),
            emissive: new THREE.Color(0x080818),
            shininess: 6,
          })
        )
        .showAtmosphere(true)
        .atmosphereColor("#2255ff")
        .atmosphereAltitude(0.16);

      globe.rotation.y = -Math.PI / 4;
      scene.add(globe);

      // Fetch country hex polygons from CDN
      try {
        const geoRes = await fetch(
          "https://cdn.jsdelivr.net/gh/janarosmonaliev/github-globe@master/src/files/globe-data-min.json"
        );
        const geoData = (await geoRes.json()) as { features: unknown[] };
        if (!destroyed) {
          globe
            .hexPolygonsData(geoData.features)
            .hexPolygonResolution(3)
            .hexPolygonMargin(0.35)
            .hexPolygonAltitude(0.003)
            .hexPolygonColor(() => "rgba(100,165,255,0.50)");
        }
      } catch {
        // non-critical
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
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(size, size);
      renderer.setClearColor(0x000000, 0);
      // canvas itself also gets round clip so WebGL output is circular
      renderer.domElement.style.borderRadius = "50%";
      el.appendChild(renderer.domElement);

      // ── Animation loop ─────────────────────────────────────────────────
      let frame = 0;
      const animate = () => {
        if (destroyed) return;
        raf = requestAnimationFrame(animate);
        globe.rotation.y += 0.003;
        halo.rotation.y += 0.001;
        frame++;
        renderer.render(scene, camera);
        // CSS variable drives the SKYNET text pulse
        const pulse = 0.82 + 0.18 * Math.sin(frame * 0.016);
        el.style.setProperty("--globe-pulse", String(pulse));
      };
      animate();
    })().catch(console.error);

    return () => {
      destroyed = true;
      cancelAnimationFrame(raf);
    };
  }, [size]);

  // Extra: blue radial glow ring drawn in CSS around the circle
  const haloSize = Math.round(size * 1.28);
  const haloOffset = -Math.round((haloSize - size) / 2);

  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        flexShrink: 0,
      }}
    >
      {/* CSS halo ring — sits behind the canvas */}
      <div
        style={{
          position: "absolute",
          width: haloSize,
          height: haloSize,
          top: haloOffset,
          left: haloOffset,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(40,100,255,0.22) 0%, rgba(20,60,200,0.12) 38%, rgba(10,30,120,0.06) 58%, transparent 72%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* Canvas container — ROUND clip */}
      <div
        ref={containerRef}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          overflow: "hidden",        // ← clips the square WebGL canvas to a circle
          position: "relative",
          zIndex: 1,
        }}
      />

      {/* SKYNET text overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
          zIndex: 3,
        }}
      >
        <span
          style={{
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: Math.round(size * 0.1),   // scales with globe size
            letterSpacing: "0.3em",
            fontWeight: 300,
            color: "rgba(180,215,255,0.92)",
            textTransform: "uppercase",
            userSelect: "none",
            opacity: "var(--globe-pulse, 0.85)" as unknown as number,
            transition: "opacity 80ms linear",
            textShadow:
              "0 0 14px rgba(80,150,255,0.9), 0 0 36px rgba(40,90,255,0.5)",
          }}
        >
          SKYNET
        </span>
        <span
          style={{
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: Math.round(size * 0.042),
            letterSpacing: "0.22em",
            color: "rgba(100,155,255,0.50)",
            textTransform: "uppercase",
            marginTop: 6,
            userSelect: "none",
          }}
        >
          intelligence
        </span>
      </div>
    </div>
  );
}
