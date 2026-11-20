import { describe, expect, it } from "vitest";
import { construireIcs, dateIcs, echapperIcs, lienGoogleAgenda, nomFichierIcs, plierLigne } from "@/lib/ics";

const evt = {
  uid: "enclos-1@dragodindes-elevage",
  titre: "Retour à l'enclos 1, vite ; sinon perte",
  description: "Une monture atteint +5 000.\nMets seulement 8 000 points.",
  debutMs: Date.UTC(2026, 10, 20, 20, 40, 0),
  dureeMin: 10,
  alarmeMin: 5,
  maintenantMs: Date.UTC(2026, 10, 20, 20, 0, 0),
};

describe("ics", () => {
  it("formate les dates en UTC", () => {
    expect(dateIcs(evt.debutMs)).toBe("20261120T204000Z");
  });

  it("échappe virgules, points-virgules, antislash et retours à la ligne", () => {
    expect(echapperIcs("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
  });

  it("produit un VEVENT avec VALARM, en CRLF", () => {
    const ics = construireIcs(evt);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("BEGIN:VEVENT\r\n");
    expect(ics).toContain("UID:enclos-1@dragodindes-elevage\r\n");
    expect(ics).toContain("DTSTAMP:20261120T200000Z\r\n");
    expect(ics).toContain("DTSTART:20261120T204000Z\r\n");
    expect(ics).toContain("DTEND:20261120T205000Z\r\n");
    expect(ics).toContain("BEGIN:VALARM\r\nACTION:DISPLAY\r\n");
    expect(ics).toContain("TRIGGER:-PT5M\r\n");
    expect(ics).toContain("SUMMARY:Retour à l'enclos 1\\, vite \\; sinon perte\r\n");
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/\n/);
  });

  it("alarme au début de l'événement par défaut", () => {
    expect(construireIcs({ ...evt, alarmeMin: undefined })).toContain("TRIGGER:PT0S");
  });

  it("plie les lignes longues à 75 octets sans couper un caractère", () => {
    const lignes = plierLigne("DESCRIPTION:" + "é".repeat(100));
    expect(lignes.length).toBeGreaterThan(1);
    const enc = new TextEncoder();
    for (const l of lignes) expect(enc.encode(l).length).toBeLessThanOrEqual(75);
    expect(lignes.slice(1).every((l) => l.startsWith(" "))).toBe(true);
    expect(lignes.map((l, i) => (i ? l.slice(1) : l)).join("")).toBe("DESCRIPTION:" + "é".repeat(100));
  });

  it("construit un lien Google Agenda prérempli", () => {
    const url = new URL(lienGoogleAgenda(evt));
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("text")).toBe(evt.titre);
    expect(url.searchParams.get("dates")).toBe("20261120T204000Z/20261120T205000Z");
    expect(url.searchParams.get("details")).toContain("8 000 points");
  });

  it("nettoie le nom de fichier", () => {
    expect(nomFichierIcs("Retour Enclos 1 — Élevage")).toBe("retour-enclos-1-elevage.ics");
    expect(nomFichierIcs("???")).toBe("rappel.ics");
  });
});
