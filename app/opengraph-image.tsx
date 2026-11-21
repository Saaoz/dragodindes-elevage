import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { VERSION_JEU } from "@/lib/data";

/* Miniature des liens partagés (Discord, réseaux, messageries) : générée au build, servie en /opengraph-image.
   Couleurs de l'appli (vert #166534) ; l'icône vient de public/icons. */
export const alt = "Élevage de dragodindes : heure de retour aux enclos, rentabilité et guide (DOFUS)";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const icone = await readFile(join(process.cwd(), "public/icons/icon-512.png"));
  const src = `data:image/png;base64,${icone.toString("base64")}`;
  const points = ["Quand revenir à chaque enclos", "Accouplement rentable ou pas", "Guide d'élevage complet"];
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: "linear-gradient(135deg, #0f3d22 0%, #166534 60%, #1f7a42 100%)",
          color: "#ffffff",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse n'accepte que <img> */}
          <img src={src} width={120} height={120} style={{ borderRadius: 28 }} alt="" />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 68, letterSpacing: -1.5, lineHeight: 1.05 }}>Élevage de dragodindes</div>
            <div style={{ display: "flex", fontSize: 30, color: "#cde8d5", marginTop: 8 }}>{`Outil pour DOFUS ${VERSION_JEU}`}</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {points.map((t) => (
            <div key={t} style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 36 }}>
              <div style={{ width: 14, height: 14, borderRadius: 7, background: "#9be2b0" }} />
              {t}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", fontSize: 26, color: "#cde8d5" }}>
          <div style={{ display: "flex", fontSize: 32, color: "#ffffff" }}>elevage-dofus.saaoz.fr</div>
          <div style={{ display: "flex" }}>Gratuit · sans compte · fan-made non officiel</div>
        </div>
      </div>
    ),
    size,
  );
}
