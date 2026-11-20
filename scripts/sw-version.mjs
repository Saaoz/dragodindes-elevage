/* Calcul de la version du service worker et génération de public/sw.js (#55). Fonctions pures, testées. */

export const MARQUEUR = "__SW_VERSION__";

/** Version : SW_VERSION (forcée) > commit Vercel > horodatage du build. Toujours [A-Za-z0-9._-], 40 car. max. */
export function calculerVersion(env, maintenant = Date.now()) {
  const brut = env.SW_VERSION || env.VERCEL_GIT_COMMIT_SHA || `t${maintenant.toString(36)}`;
  const propre = String(brut).replace(/[^A-Za-z0-9._-]/g, "").slice(0, 40);
  return propre || `t${maintenant.toString(36)}`;
}

/** Remplace le marqueur par la version ; échoue s'il est absent (version figée par erreur). */
export function injecterVersion(modele, version) {
  if (!modele.includes(MARQUEUR)) throw new Error(`Marqueur ${MARQUEUR} introuvable dans le modèle du service worker`);
  return modele.split(MARQUEUR).join(version);
}
