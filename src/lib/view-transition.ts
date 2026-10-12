"use client";

/**
 * Transition « carte → fiche » : la vignette du lieu s'agrandit jusqu'à devenir la couverture de la
 * fiche (API View Transitions). Sans prise en charge du navigateur ou avec « réduire les animations »,
 * navigation normale. L'écran n'est jamais figé plus de 900 ms : au-delà (connexion lente), simple
 * fondu vers la page en cours de chargement.
 */
type Router = { push: (href: string) => void };
type VTDocument = Document & {
  startViewTransition?: (update: () => Promise<void>) => { finished: Promise<void> };
};

export const PLACE_COVER = "place-cover";
const WAIT_MS = 900;

export function canTransition() {
  return (
    typeof document !== "undefined" &&
    typeof (document as VTDocument).startViewTransition === "function" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function waitForElement(selector: string, timeout: number): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const found = document.querySelector<HTMLElement>(selector);
    if (found) return resolve(found);
    const observer = new MutationObserver(() => {
      const el = document.querySelector<HTMLElement>(selector);
      if (el) {
        observer.disconnect();
        clearTimeout(timer);
        resolve(el);
      }
    });
    const timer = setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

export function navigateToPlace(router: Router, href: string, source: HTMLElement | null) {
  const doc = document as VTDocument;
  if (!source || !canTransition() || !doc.startViewTransition) {
    router.push(href);
    return;
  }
  source.style.viewTransitionName = PLACE_COVER;
  let target: HTMLElement | null = null;
  const transition = doc.startViewTransition(async () => {
    // L'ancienne vignette est capturée : son nom est retiré pour rester unique dans la nouvelle page.
    source.style.viewTransitionName = "";
    router.push(href);
    target = await waitForElement("[data-place-cover]", WAIT_MS);
    if (target) target.style.viewTransitionName = PLACE_COVER;
  });
  transition.finished.finally(() => {
    if (target) target.style.viewTransitionName = "";
  });
}
