/**
 * Langues de l'interface (décision D36). Le français reste la langue de référence ; le lingala et le
 * swahili couvrent pour l'instant la navigation, la recherche et les actions des fiches.
 * Traductions lingala et swahili : À FAIRE RELIRE par des locuteurs natifs avant toute communication.
 * Le contenu des fiches (noms, descriptions) n'est jamais traduit automatiquement.
 */
export const LOCALES = [
  { code: "fr", label: "Français" },
  { code: "ln", label: "Lingála" },
  { code: "sw", label: "Kiswahili" },
] as const;

export type Locale = (typeof LOCALES)[number]["code"];
export const DEFAULT_LOCALE: Locale = "fr";
export const LOCALE_KEY = "boyoma.lang";
export const LOCALE_EVENT = "boyoma:lang";

export const isLocale = (v: unknown): v is Locale => LOCALES.some((l) => l.code === v);

const fr = {
  "nav.home": "Accueil",
  "nav.explore": "Explorer",
  "nav.nearby": "À proximité",
  "nav.favorites": "Favoris",
  "nav.account": "Compte",
  "nav.main": "Navigation principale",
  "header.addPlace": "Ajouter un lieu",
  "header.signIn": "Se connecter",
  "header.myAccount": "Mon compte",
  "search.label": "Rechercher un lieu, un service, une catégorie ou une commune",
  "search.placeholder": "Pharmacie, hôtel, garage, quartier…",
  "search.clear": "Effacer",
  "action.call": "Appeler",
  "action.directions": "Itinéraire",
  "action.share": "Partager",
  "action.copied": "Lien copié",
  "action.save": "Favori",
  "action.saved": "Enregistré",
  "action.ride": "Envoyer l'adresse à un taxi-moto (WhatsApp)",
  "lang.title": "Langue",
  "lang.note": "Lingala et swahili : navigation, recherche et boutons des fiches. Traduction en cours de relecture.",
} as const;

export type MessageKey = keyof typeof fr;

const ln: Record<MessageKey, string> = {
  "nav.home": "Ebandeli",
  "nav.explore": "Kotala",
  "nav.nearby": "Penepene",
  "nav.favorites": "Oyo nalingi",
  "nav.account": "Konti",
  "nav.main": "Nzela ya monene",
  "header.addPlace": "Bakisa esika",
  "header.signIn": "Kota",
  "header.myAccount": "Konti na ngai",
  "search.label": "Luka esika, mosala, lolenge to komini",
  "search.placeholder": "Pharmacie, hotɛlɛ, garage, quartier…",
  "search.clear": "Longola",
  "action.call": "Benga",
  "action.directions": "Nzela",
  "action.share": "Kabola",
  "action.copied": "Lien ekangami",
  "action.save": "Bomba",
  "action.saved": "Ebombami",
  "action.ride": "Tindela taxi-moto adresi (WhatsApp)",
  "lang.title": "Monoko",
  "lang.note": "Lingála mpe Kiswahili : nzela, boluki mpe babouton. Libongisi ezali kosalema.",
};

const sw: Record<MessageKey, string> = {
  "nav.home": "Mwanzo",
  "nav.explore": "Gundua",
  "nav.nearby": "Karibu nami",
  "nav.favorites": "Vipendwa",
  "nav.account": "Akaunti",
  "nav.main": "Urambazaji mkuu",
  "header.addPlace": "Ongeza mahali",
  "header.signIn": "Ingia",
  "header.myAccount": "Akaunti yangu",
  "search.label": "Tafuta mahali, huduma, aina au wilaya",
  "search.placeholder": "Duka la dawa, hoteli, gereji, mtaa…",
  "search.clear": "Futa",
  "action.call": "Piga simu",
  "action.directions": "Njia",
  "action.share": "Shiriki",
  "action.copied": "Kiungo kimenakiliwa",
  "action.save": "Hifadhi",
  "action.saved": "Imehifadhiwa",
  "action.ride": "Tuma anwani kwa teksi-pikipiki (WhatsApp)",
  "lang.title": "Lugha",
  "lang.note": "Lingala na Kiswahili: urambazaji, utafutaji na vitufe. Tafsiri inakaguliwa.",
};

export const MESSAGES: Record<Locale, Record<MessageKey, string>> = { fr, ln, sw };

export const translate = (locale: Locale, key: MessageKey) => MESSAGES[locale][key] ?? fr[key];

/** Script de tête : applique la langue enregistrée à <html lang> avant l'affichage (lecteurs d'écran). */
export const localeInitScript = `try{var l=localStorage.getItem("${LOCALE_KEY}");if(l==="ln"||l==="sw")document.documentElement.lang=l}catch(e){}`;
