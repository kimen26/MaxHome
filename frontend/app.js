import { calculer, euros, versCentimes, TYPES } from "./calc.js";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = (s) => document.querySelector(s);
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

const etat = { annee: 0, mois: 0, membres: [], charges: [], lignes: {}, revenus: {} };

function statut(msg, erreur = false) {
  $("#statut").textContent = msg;
  $("#statut").style.color = erreur ? "var(--rouge)" : "";
  if (erreur) console.error(msg);
}
const echec = (e) => statut(`Erreur : ${e.message ?? e}`, true);
const formater = (c) => (c ? (c / 100).toFixed(2).replace(".", ",") : "");

// ---------- auth ----------
$("#form-login").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const f = new FormData(ev.target);
  const { error } = await sb.auth.signInWithPassword({ email: f.get("email"), password: f.get("password") });
  $("#login-erreur").textContent = error ? error.message : "";
});
$("#logout").addEventListener("click", () => sb.auth.signOut());
sb.auth.onAuthStateChange((_ev, session) => {
  $("#login").hidden = !!session;
  $("#app").hidden = !session;
  $("#nav").hidden = !session;
  if (session) demarrer();
});

// ---------- navigation ----------
function moisDepuisHash() {
  const m = location.hash.match(/^#(\d{4})-(\d{1,2})$/);
  const d = new Date();
  return m ? [Number(m[1]), Number(m[2])] : [d.getFullYear(), d.getMonth() + 1];
}
function allerA(annee, mois) {
  if (mois < 1) { mois = 12; annee--; } else if (mois > 12) { mois = 1; annee++; }
  location.hash = `${annee}-${mois}`;
}
$("#prev").addEventListener("click", () => allerA(etat.annee, etat.mois - 1));
$("#next").addEventListener("click", () => allerA(etat.annee, etat.mois + 1));
window.addEventListener("hashchange", chargerMois);

async function demarrer() {
  try {
    const [{ data: membres, error: e1 }, { data: charges, error: e2 }] = await Promise.all([
      sb.from("membres").select("prenom,ordre").order("ordre"),
      sb.from("charges").select("*").order("ordre").order("id"),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    etat.membres = membres;
    etat.charges = charges;
    await chargerMois();
  } catch (e) { echec(e); }
}

async function chargerMois() {
  [etat.annee, etat.mois] = moisDepuisHash();
  $("#titre-mois").textContent = `${MOIS[etat.mois - 1]} ${etat.annee}`;
  try {
    const filtre = (q) => q.eq("annee", etat.annee).eq("mois", etat.mois);
    const [{ data: lignes, error: e1 }, { data: revenus, error: e2 }] = await Promise.all([
      filtre(sb.from("lignes").select("charge_id,montant_centimes")),
      filtre(sb.from("revenus").select("prenom,montant_centimes")),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    etat.lignes = Object.fromEntries(lignes.map((l) => [l.charge_id, l.montant_centimes]));
    etat.revenus = Object.fromEntries(etat.membres.map((m) => [m.prenom, 0]));
    for (const r of revenus) etat.revenus[r.prenom] = r.montant_centimes;
    rendre();
    statut("");
  } catch (e) { echec(e); }
}

// ---------- rendu ----------
function inputMontant(valeur, onChange) {
  const inp = document.createElement("input");
  inp.className = "montant";
  inp.inputMode = "decimal";
  inp.value = formater(valeur);
  const colorer = () => {
    inp.classList.toggle("neg", valeur < 0);
    inp.classList.toggle("pos", valeur > 0);
  };
  colorer();
  inp.addEventListener("change", async () => {
    try {
      valeur = inp.value.trim() === "" ? 0 : versCentimes(inp.value);
      inp.value = formater(valeur);
      colorer();
      await onChange(valeur);
      recalculer();
      statut("Enregistré.");
    } catch (e) { echec(e); }
  });
  return inp;
}

function rendre() {
  const tbRev = $("#revenus tbody");
  tbRev.innerHTML = "";
  for (const m of etat.membres) {
    const tr = tbRev.insertRow();
    tr.insertCell().textContent = m.prenom;
    const td = tr.insertCell();
    td.className = "num";
    td.append(inputMontant(etat.revenus[m.prenom], async (v) => {
      etat.revenus[m.prenom] = v;
      const { error } = await sb.from("revenus").upsert({ annee: etat.annee, mois: etat.mois, prenom: m.prenom, montant_centimes: v });
      if (error) throw error;
    }));
  }

  const tb = $("#charges tbody");
  tb.innerHTML = "";
  for (const c of etat.charges) {
    if (!c.actif && !etat.lignes[c.id]) continue;
    const tr = tb.insertRow();
    if (!c.actif) tr.className = "inactif";
    tr.insertCell().textContent = c.libelle;
    const sel = document.createElement("select");
    for (const [k, v] of Object.entries(TYPES)) sel.add(new Option(v, k, false, k === c.type));
    sel.addEventListener("change", async () => {
      const { error } = await sb.from("charges").update({ type: sel.value }).eq("id", c.id);
      if (error) return echec(error);
      c.type = sel.value;
      recalculer();
      statut("Enregistré.");
    });
    tr.insertCell().append(sel);
    const td = tr.insertCell();
    td.className = "num";
    td.append(inputMontant(etat.lignes[c.id] ?? 0, async (v) => {
      etat.lignes[c.id] = v;
      const { error } = await sb.from("lignes").upsert({ annee: etat.annee, mois: etat.mois, charge_id: c.id, montant_centimes: v });
      if (error) throw error;
    }));
    const act = tr.insertCell();
    act.className = "actions";
    const btn = document.createElement("button");
    btn.textContent = c.actif ? "archiver" : "réactiver";
    btn.title = "Une charge archivée reste visible dans les mois où elle a un montant";
    btn.addEventListener("click", async () => {
      const { error } = await sb.from("charges").update({ actif: !c.actif }).eq("id", c.id);
      if (error) return echec(error);
      c.actif = !c.actif;
      rendre();
    });
    act.append(btn);
  }
  recalculer();
}

function recalculer() {
  const r = calculer(etat.charges, etat.lignes, etat.revenus);
  $("#total").textContent = euros(r.total);
  $("#total-egales").textContent = euros(r.totaux.egales);
  $("#total-proport").textContent = euros(r.totaux.proport);
  const tb = $("#resultat tbody");
  tb.innerHTML = "";
  for (const m of etat.membres) {
    const p = m.prenom;
    const tr = tb.insertRow();
    tr.insertCell().textContent = p;
    const cellules = [
      (r.ratio[p] * 100).toFixed(1) + " %",
      euros(r.partEgales[p]), euros(r.partProport[p]), euros(r.parts[p]), euros(r.reste[p]),
    ];
    for (const v of cellules) {
      const td = tr.insertCell();
      td.className = "num";
      td.textContent = v;
    }
  }
}

// ---------- actions ----------
$("#form-charge").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const f = new FormData(ev.target);
  const ordre = Math.max(0, ...etat.charges.map((c) => c.ordre)) + 1;
  const { data, error } = await sb.from("charges")
    .insert({ libelle: f.get("libelle").trim(), type: f.get("type"), ordre }).select().single();
  if (error) return echec(error);
  etat.charges.push(data);
  ev.target.reset();
  rendre();
});

$("#copier").addEventListener("click", async () => {
  if (Object.values(etat.lignes).some((v) => v)) {
    statut("Ce mois a déjà des montants : copie refusée.", true);
    return;
  }
  let [a, m] = [etat.annee, etat.mois - 1];
  if (m < 1) { m = 12; a--; }
  try {
    const { data, error } = await sb.from("lignes").select("charge_id,montant_centimes").eq("annee", a).eq("mois", m);
    if (error) throw error;
    if (!data.length) { statut("Mois précédent vide.", true); return; }
    const rows = data.map((l) => ({ ...l, annee: etat.annee, mois: etat.mois }));
    const { error: e2 } = await sb.from("lignes").upsert(rows);
    if (e2) throw e2;
    await chargerMois();
    statut(`${rows.length} montants copiés depuis ${MOIS[m - 1]} ${a}.`);
  } catch (e) { echec(e); }
});
