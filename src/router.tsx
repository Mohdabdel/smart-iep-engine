import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// A stale page chunk (after an app update) fails to load and blanks the screen.
// Reload once to fetch the fresh version instead.
if (typeof window !== "undefined") {
  const retry = () => {
    const k = "iep:chunk-reload";
    if (sessionStorage.getItem(k)) return;
    sessionStorage.setItem(k, "1");
    window.location.reload();
  };
  window.addEventListener("vite:preloadError", (e) => { e.preventDefault(); retry(); });
  window.addEventListener("unhandledrejection", (e) => {
    if (String(e.reason?.message ?? e.reason).includes("dynamically imported module")) retry();
  });
  window.addEventListener("load", () => setTimeout(() => sessionStorage.removeItem("iep:chunk-reload"), 10000));
}

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
