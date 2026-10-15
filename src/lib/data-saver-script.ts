/** Partagé serveur/client : préférence d'économie de données et script d'initialisation (head). */
export type SaverPref = "auto" | "on" | "off";
export const SAVER_KEY = "boyoma.data-saver";
export const SAVER_EVENT = "boyoma:data-saver";

/** Script en ligne (head) : décide avant le premier rendu. */
export const dataSaverInitScript = `(function(){try{var p=localStorage.getItem("${SAVER_KEY}")||"auto";var c=navigator.connection||{};var slow=c.saveData===true||c.effectiveType==="slow-2g"||c.effectiveType==="2g";var on=p==="on"||(p==="auto"&&slow);document.documentElement.dataset.saver=on?"on":"off";document.documentElement.dataset.saverPref=p;}catch(e){}})();`;
