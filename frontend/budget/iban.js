// Validation et mise en forme d'un IBAN saisi au clavier : fonctions pures, testées en isolation
// (tests/test_iban.mjs). Format : 2 lettres (pays) + 2 chiffres (clé) + 11 à 30 alphanumériques,
// vérifié par la clé de contrôle mod 97 (norme ISO 7064 / IBAN).

const FORME = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/;

// Retire espaces et tirets, met en majuscules — la forme « brute » utilisée pour valider,
// stocker et copier.
export function nettoyerIban(saisie) {
  return (saisie ?? "").toUpperCase().replace(/[\s-]/g, "");
}

// Clé de contrôle mod 97 : les 4 premiers caractères passent à la fin, chaque lettre devient
// deux chiffres (A=10 … Z=35), puis le nombre géant se réduit mod 97 par blocs pour rester dans
// les entiers sûrs de JS.
function mod97(iban) {
  const reordonne = iban.slice(4) + iban.slice(0, 4);
  const numerique = [...reordonne].map((c) => (/[0-9]/.test(c) ? c : (c.charCodeAt(0) - 55).toString())).join("");
  let reste = 0;
  for (let i = 0; i < numerique.length; i += 7) {
    reste = Number(String(reste) + numerique.slice(i, i + 7)) % 97;
  }
  return reste;
}

// null = valide (ou champ vide, autorisé) ; sinon message d'erreur clair pour l'utilisateur.
export function erreurIban(saisie) {
  const iban = nettoyerIban(saisie);
  if (!iban) return null;
  if (!FORME.test(iban)) return "IBAN invalide : 2 lettres pays + 2 chiffres + 11 à 30 caractères attendus.";
  if (mod97(iban) !== 1) return "IBAN invalide : la clé de contrôle ne correspond pas.";
  return null;
}

// Groupé par 4 pour l'affichage : « FR76 3000 6000 ... ».
export function formaterIban(saisie) {
  const iban = nettoyerIban(saisie);
  return iban.match(/.{1,4}/g)?.join(" ") ?? "";
}

// Les 4 derniers caractères, pour compatibilité avec iban_masque (lu par ui-mouvements.js).
export function derniersCaracteres(saisie) {
  const iban = nettoyerIban(saisie);
  return iban.slice(-4) || null;
}
